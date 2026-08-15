"""
One downloaded batch recording in, one finished clip per line out.

This is the audio half of `npm run voice:ingest`. Node knows about batches,
sidecars, hashes and the clip store; this knows about samples. It is handed a
recording and the exact words in it, in order, and it returns one file per line
plus everything worth remembering about how it got there.

    python ingest.py spec.json > result.json

spec.json is `{"audio": ..., "outDir": ..., "lines": [{"id", "text"}], ...}`;
the optional keys are the tunables at the top of this file, and Node passes all
of them so the constants live in one place over there.

What happens to a line, in order:

1. **Resample.** Firefly's WAV rate is not known until batch #1 and may be 24,
   44.1 or 48 kHz; the aligner wants 16 kHz and the finished clips want edge-tts's
   own 24 kHz, so both come off the same mono mixdown and neither cares.
2. **Align and cut.** The line boundaries are nowhere in the audio — they come
   out of the same forced alignment that produces the word timings, and the cut
   goes at the quietest point between two lines rather than at either word edge.
   That is `cutter.find_cut`, shared with the spike so there is one implementation.
3. **Trim.** Edge silence goes, minus a small pad so no onset is clipped. Word
   spans are rebased by however much came off the front.
4. **Normalise.** One loudness target for every clip in the game, so a Firefly
   line and an edge-tts line sit at the same level in the same scene.
5. **Encode.** mp3 at 24 kHz mono, which is exactly what edge-tts writes, so the
   manifest carries one kind of file and the browser decodes one kind of file.

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
import torch
import torchaudio.functional as AF

from aligner import LATENCY_SECONDS, SAMPLE_RATE, ForcedAligner, WordSpan, tokenize
from cutter import (
    FADE_SECONDS,
    HOP_SECONDS,
    SILENCE,
    USABLE_GAP_SECONDS,
    _fade,
    _frames,
    longest_quiet_run,
)

#: Clips are written at edge-tts's rate so the two providers sit together.
CLIP_RATE = 24_000

#: Loudness target, dBFS, measured over the frames that are not silence.
TARGET_DBFS = -19.0

#: Normalisation never pushes a clip's peak above this.
PEAK_CEILING_DBFS = -1.0

#: Kept either side of the speech when trimming. Short enough not to be heard,
#: long enough that a plosive's build-up survives the knife.
TRIM_PAD_SECONDS = 0.04

#: A clip's own silence, below which nothing is measured or kept.
EPSILON = 1e-12


def _db(value: float) -> float:
    return 20.0 * float(np.log10(max(float(value), EPSILON)))


def _speech_dbfs(pcm: np.ndarray, rate: int) -> float:
    """
    RMS over the frames that are not silence, in dBFS.

    Whole-clip RMS would make a line with a long pause in it measure quiet and
    then get boosted, which is how one word ends up shouting. Silence is the
    same 5%-of-peak floor the cutter and `voice:inspect` use.
    """
    frames = _frames(pcm, rate)
    active = frames[frames >= frames.max() * SILENCE] if frames.size else frames
    if not active.size:
        return _db(0.0)
    return _db(np.sqrt((active**2).mean()))


def _trim(pcm: np.ndarray, rate: int, floor: float, speech: tuple[float, float], pad: float):
    """
    Edge silence off the front and back, without ever cutting into a word.

    Two opinions are combined: where the audio actually gets loud, and where the
    aligner put the first and last word. The earlier of the two wins at the
    front and the later at the back, so a soft onset the energy test missed is
    still inside the clip.
    """
    frames = _frames(pcm, rate)
    loud = np.flatnonzero(frames >= floor)
    if not loud.size:
        return 0, len(pcm)

    energy_start = float(loud[0]) * HOP_SECONDS
    energy_end = float(loud[-1] + 1) * HOP_SECONDS
    start = max(0.0, min(energy_start, speech[0]) - pad)
    end = min(len(pcm) / rate, max(energy_end, speech[1]) + pad)
    if end <= start:
        return 0, len(pcm)
    return int(start * rate), int(end * rate)


def _boundary(rms: np.ndarray, floor: float, line: dict, before: list[WordSpan], after: list[WordSpan]) -> dict:
    """
    Where one line stops and the next starts, and what the silence says.

    The obvious window — from the last word's end to the next word's start — is
    wrong often enough to matter, and it fails in the worst way: a word with no
    crisp onset (a vowel or a nasal after a pause, exactly the case the spike
    measured) gets its span stretched back over the whole pause, so the window
    collapses to nothing and the cut lands hard against the previous word.

    So the window is the whole *neighbourhood* of the join — from the start of
    the last word before it to the end of the first word after — and what is
    looked for in it is the longest run of silence. Silence is never inside
    speech, so a run of it a fifth of a second long is the pause and nothing
    else, whatever the aligner believes about where words begin.

    The same run is then used to correct the two spans it contradicts: a word
    cannot still be sounding during silence, and cannot have started before it
    ended. That is an acoustic fact rather than a guess, and it is what keeps a
    highlight off a word that is not being said yet.
    """
    quiet_start, quiet_end = longest_quiet_run(rms, floor, before[-1].start, after[0].end)
    usable = quiet_end - quiet_start >= USABLE_GAP_SECONDS

    if usable:
        before[-1].end = round(max(before[-1].start, min(before[-1].end, quiet_start)), 4)
        after[0].start = round(min(after[0].end, max(after[0].start, quiet_end)), 4)
        at = (quiet_start + quiet_end) / 2
    else:
        # Nothing to cut in. The quietest frame between the two words is the
        # least bad place, and `usable` says so out loud.
        lo = max(0, int(before[-1].end / HOP_SECONDS))
        hi = min(len(rms), max(lo + 1, int(after[0].start / HOP_SECONDS)))
        at = (lo + int(np.argmin(rms[lo:hi]))) * HOP_SECONDS

    return {
        "after": line["id"],
        "gapSeconds": round(max(0.0, quiet_end - quiet_start), 4),
        "cutSeconds": round(at, 4),
        "usable": bool(usable),
    }


def ingest_batch(
    audio: Path | str,
    lines: Sequence[dict],
    out_dir: Path | str,
    model: str = "wav2vec2_base",
    clip_rate: int = CLIP_RATE,
    target_dbfs: float = TARGET_DBFS,
    peak_ceiling_dbfs: float = PEAK_CEILING_DBFS,
    fade_seconds: float | None = None,
    trim_pad_seconds: float = TRIM_PAD_SECONDS,
) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fade = FADE_SECONDS if fade_seconds is None else float(fade_seconds)

    data, source_rate = sf.read(str(audio), dtype="float32", always_2d=True)
    mono = torch.from_numpy(data.mean(axis=1).copy()).unsqueeze(0)

    # Two resamplings of one mixdown: the model's rate and the clip's rate. The
    # timings come out of the first and are applied to the second, which is only
    # sound because both are the same signal.
    for_align = mono if source_rate == SAMPLE_RATE else AF.resample(mono, source_rate, SAMPLE_RATE)
    for_clips = mono if source_rate == clip_rate else AF.resample(mono, source_rate, clip_rate)
    pcm = for_clips[0].numpy()

    started = time.perf_counter()
    aligner = ForcedAligner(model)
    load_seconds = time.perf_counter() - started

    words_per_line = [tokenize(line["text"]) for line in lines]
    flat = [w for group in words_per_line for w in group]

    started = time.perf_counter()
    spans = aligner.align(for_align, flat)
    align_seconds = time.perf_counter() - started

    grouped: list[list[WordSpan]] = []
    cursor = 0
    for group in words_per_line:
        grouped.append(spans[cursor : cursor + len(group)])
        cursor += len(group)

    rms = _frames(pcm, clip_rate)
    floor = float(rms.max()) * SILENCE
    duration = len(pcm) / clip_rate

    # Boundaries first, so a clip's start is the previous clip's end exactly and
    # not one sample of the recording is dropped between two lines.
    boundaries = [_boundary(rms, floor, lines[i], grouped[i], grouped[i + 1]) for i in range(len(grouped) - 1)]

    edges = [0.0] + [b["cutSeconds"] for b in boundaries] + [duration]
    written = []
    for i, line in enumerate(lines):
        cut_start, cut_end = edges[i], edges[i + 1]
        slice_ = pcm[int(cut_start * clip_rate) : int(cut_end * clip_rate)]
        timed = [s for s in grouped[i] if s.end > s.start]
        speech = (
            (timed[0].start - cut_start, timed[-1].end - cut_start)
            if timed
            else (0.0, len(slice_) / clip_rate)
        )

        head, tail = _trim(slice_, clip_rate, floor, speech, trim_pad_seconds)
        clip = slice_[head:tail].copy()
        offset = head / clip_rate
        clip = _fade(clip, clip_rate, fade)

        speech_dbfs = _speech_dbfs(clip, clip_rate)
        gain_db = target_dbfs - speech_dbfs
        peak_db = _db(np.abs(clip).max() if clip.size else 0.0)
        if peak_db + gain_db > peak_ceiling_dbfs:
            gain_db = peak_ceiling_dbfs - peak_db
        clip = clip * (10.0 ** (gain_db / 20.0))

        file = out_dir / f"{line['id']}.mp3"
        sf.write(str(file), clip, clip_rate, format="MP3", subtype="MPEG_LAYER_III")

        written.append(
            {
                "id": line["id"],
                "file": str(file),
                "bytes": file.stat().st_size,
                "seconds": round(len(clip) / clip_rate, 4),
                "cutStart": round(cut_start, 4),
                "cutEnd": round(cut_end, 4),
                "trimmedHead": round(offset, 4),
                "trimmedTail": round(max(0.0, (len(slice_) - tail) / clip_rate), 4),
                "usableGap": _usable(boundaries, i, len(lines)),
                "speechDbfs": round(speech_dbfs, 2),
                "gainDb": round(gain_db, 2),
                "peakDbfs": round(peak_db + gain_db, 2),
                # Rebased twice: to the cut, then past whatever the trim removed.
                "words": [
                    {
                        "word": s.word,
                        "start": round(max(0.0, s.start - cut_start - offset), 4),
                        "end": round(max(0.0, s.end - cut_start - offset), 4),
                        "score": s.score,
                    }
                    for s in grouped[i]
                ],
            }
        )

    return {
        "model": aligner.name,
        "latency": LATENCY_SECONDS[aligner.name],
        "sourceRate": int(source_rate),
        "sourceChannels": int(data.shape[1]),
        "clipRate": clip_rate,
        "audioSeconds": round(duration, 3),
        "loadSeconds": round(load_seconds, 3),
        "alignSeconds": round(align_seconds, 3),
        "targetDbfs": target_dbfs,
        "fadeSeconds": fade,
        "lines": written,
        "boundaries": boundaries,
    }


def _usable(boundaries: list[dict], i: int, count: int) -> bool:
    """True when both cuts either side of this clip landed in real silence."""
    before = i == 0 or bool(boundaries[i - 1]["usable"])
    after = i == count - 1 or bool(boundaries[i]["usable"])
    return before and after


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", help="JSON file of the ingest spec, or - for stdin")
    args = parser.parse_args(argv)

    raw = sys.stdin.read() if args.spec == "-" else Path(args.spec).read_text(encoding="utf8")
    spec = json.loads(raw)
    result = ingest_batch(
        spec["audio"],
        spec["lines"],
        spec["outDir"],
        model=spec.get("model", "wav2vec2_base"),
        clip_rate=int(spec.get("clipRate", CLIP_RATE)),
        target_dbfs=float(spec.get("targetDbfs", TARGET_DBFS)),
        peak_ceiling_dbfs=float(spec.get("peakCeilingDbfs", PEAK_CEILING_DBFS)),
        fade_seconds=spec.get("fadeSeconds"),
        trim_pad_seconds=float(spec.get("trimPadSeconds", TRIM_PAD_SECONDS)),
    )
    sys.stdout.write(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
