"""
Cutting a batch recording into one clip per line.

Firefly is a web UI: Matt will paste in a paragraph, get back one WAV, and the
ingest has to turn that into one file per line with its own word timings. The
line boundaries are not marked in the audio anywhere — they come out of the
same forced alignment that produces the timings, which is the whole reason to
do both in one pass.

Where exactly to cut is the interesting part. The alignment says where the last
word of a line ends and the first word of the next begins; the cut goes at the
quietest point in between, not at either edge, so no clip clips a consonant and
none of them start on a breath. A short fade keeps the edges from popping.

    python cutter.py batch.json > cuts.json

batch.json is `{"audio": "...", "lines": [{"id": "...", "text": "..."}],
"outDir": "..."}`. Written clips are 16-bit PCM wav at the source's rate.

Content-time only, like everything else here.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Sequence

import numpy as np
import soundfile as sf

from aligner import ForcedAligner, WordSpan, tokenize

#: Frame size for the energy search inside a gap. 5 ms, same as voice:inspect.
HOP_SECONDS = 0.005

#: "Silence" is this share of the clip's peak frame energy. Also voice:inspect's.
SILENCE = 0.05

#: A gap shorter than this has no room for a cut that misses both words.
USABLE_GAP_SECONDS = 0.06

#: Linear fade at each cut edge. Long enough to kill a click, short enough that
#: nobody hears it happen.
FADE_SECONDS = 0.008


def _frames(pcm: np.ndarray, rate: int) -> np.ndarray:
    """Per-frame RMS over the whole clip."""
    hop = max(1, int(round(rate * HOP_SECONDS)))
    usable = len(pcm) - len(pcm) % hop
    if usable == 0:
        return np.zeros(1, dtype=np.float32)
    return np.sqrt((pcm[:usable].reshape(-1, hop) ** 2).mean(axis=1))


def longest_quiet_run(rms: np.ndarray, floor: float, start: float, end: float) -> tuple[float, float]:
    """
    The longest stretch of frames under the silence floor inside a window.

    Returned as (start, end) in seconds; no run at all comes back as two equal
    numbers. Where a pause *is* is a different question from where a word ends,
    and the aligner only answers the second one — it gets the first wrong
    whenever a word has no crisp onset to find. See `ingest.py`.
    """
    lo = max(0, int(start / HOP_SECONDS))
    hi = min(len(rms), max(lo + 1, int(end / HOP_SECONDS)))
    quiet = rms[lo:hi] < floor

    best_start, best_len, run_start = -1, 0, -1
    for i, is_quiet in enumerate(quiet):
        if is_quiet and run_start < 0:
            run_start = i
        elif not is_quiet and run_start >= 0:
            if i - run_start > best_len:
                best_start, best_len = run_start, i - run_start
            run_start = -1
    if run_start >= 0 and len(quiet) - run_start > best_len:
        best_start, best_len = run_start, len(quiet) - run_start

    if best_len == 0:
        return lo * HOP_SECONDS, lo * HOP_SECONDS
    return (lo + best_start) * HOP_SECONDS, (lo + best_start + best_len) * HOP_SECONDS


def find_cut(rms: np.ndarray, floor: float, start: float, end: float) -> tuple[float, bool]:
    """
    The best place to cut between two words, and whether it was a real silence.

    Preferred: the middle of the longest run of frames under the silence floor.
    Failing that — two words with no gap the aligner could see — the single
    quietest frame, reported as unusable so the caller can say so out loud.
    """
    run_start, run_end = longest_quiet_run(rms, floor, start, end)
    if run_end - run_start >= USABLE_GAP_SECONDS:
        return (run_start + run_end) / 2, True

    lo = max(0, int(start / HOP_SECONDS))
    hi = min(len(rms), max(lo + 1, int(end / HOP_SECONDS)))
    return (lo + int(np.argmin(rms[lo:hi]))) * HOP_SECONDS, False


def _fade(clip: np.ndarray, rate: int, seconds: float = FADE_SECONDS) -> np.ndarray:
    n = min(int(rate * seconds), len(clip) // 2)
    if n <= 0:
        return clip
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    out = clip.copy()
    out[:n] *= ramp
    out[-n:] *= ramp[::-1]
    return out


def cut_batch(
    audio: Path | str,
    lines: Sequence[dict],
    out_dir: Path | str,
    model: str = "wav2vec2_base",
    aligner: ForcedAligner | None = None,
) -> dict:
    """
    Align one recording of several lines, then split it into one file per line.

    `lines` is `[{"id": ..., "text": ...}]` in the order they were spoken. Each
    returned line carries its own word spans, rebased to its own clip — which
    is exactly the shape `build.ts` would hand to `align()`.
    """
    aligner = aligner or ForcedAligner(model)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    words_per_line = [tokenize(line["text"]) for line in lines]
    flat = [w for group in words_per_line for w in group]

    started = time.perf_counter()
    waveform = aligner.read_audio(audio)
    spans = aligner.align(waveform, flat)
    align_seconds = time.perf_counter() - started

    data, rate = sf.read(str(audio), dtype="float32", always_2d=True)
    pcm = data.mean(axis=1)
    rms = _frames(pcm, rate)
    floor = float(rms.max()) * SILENCE
    duration = len(pcm) / rate

    grouped: list[list[WordSpan]] = []
    cursor = 0
    for group in words_per_line:
        grouped.append(spans[cursor : cursor + len(group)])
        cursor += len(group)

    # Boundaries first, so a clip's start is the previous clip's end exactly and
    # not one sample of audio goes missing.
    boundaries = []
    for i in range(len(grouped) - 1):
        gap_start = grouped[i][-1].end
        gap_end = grouped[i + 1][0].start
        at, usable = find_cut(rms, floor, gap_start, gap_end)
        boundaries.append(
            {
                "after": lines[i]["id"],
                "gapSeconds": round(max(0.0, gap_end - gap_start), 4),
                "cutSeconds": round(at, 4),
                "usable": usable,
            }
        )

    edges = [0.0] + [b["cutSeconds"] for b in boundaries] + [duration]
    written = []
    for i, line in enumerate(lines):
        start, end = edges[i], edges[i + 1]
        clip = _fade(pcm[int(start * rate) : int(end * rate)], rate)
        file = out_dir / f"{line['id']}.wav"
        sf.write(str(file), clip, rate, subtype="PCM_16")
        written.append(
            {
                "id": line["id"],
                "file": str(file),
                "start": round(start, 4),
                "end": round(end, 4),
                # Rebased to the clip, which is what the manifest would carry.
                "words": [
                    {
                        "word": s.word,
                        "start": round(s.start - start, 4),
                        "end": round(s.end - start, 4),
                        "score": s.score,
                    }
                    for s in grouped[i]
                ],
            }
        )

    return {
        "model": aligner.name,
        "audioSeconds": round(duration, 3),
        "alignSeconds": round(align_seconds, 3),
        "floor": round(floor, 6),
        "lines": written,
        "boundaries": boundaries,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch", help="JSON file of {audio, lines, outDir}, or - for stdin")
    parser.add_argument("--model", default="wav2vec2_base")
    args = parser.parse_args(argv)

    raw = sys.stdin.read() if args.batch == "-" else Path(args.batch).read_text(encoding="utf8")
    spec = json.loads(raw)
    result = cut_batch(spec["audio"], spec["lines"], spec["outDir"], args.model)
    sys.stdout.write(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
