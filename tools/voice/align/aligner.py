"""
Forced alignment — audio plus the text that was spoken, out come word times.

Why this exists: the next voice provider (Adobe Firefly) returns WAVs and no
word timestamps at all, and per-word highlighting is the whole reading mechanic.
We always know exactly what was said, so the timings can be recovered by forced
alignment rather than asked for. edge-tts's native word boundaries are the
ground truth this was measured against — see the spike report.

This module knows nothing about the game, the manifest, or display text. It
takes *spoken* text and returns spans over the spoken words, in seconds. Turning
those into the manifest's display-token space is `../align.ts`'s job and stays
there, so there is exactly one implementation of that contract.

Content-time only. Nothing under `src/` may ever import anything from here.

    python aligner.py jobs.json > spans.json
    python aligner.py --model mms_fa jobs.json

jobs.json is `[{"id": "...", "audio": "path.mp3", "text": "what was said"}]`;
stdout is the same ids with `words`, plus per-job timings. One process aligns
many jobs so the model is loaded once, which is also how the future ingest
should call it — start-up is ~4 s and dwarfs a short line's alignment.

Setup lives in README.md beside this file.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, Sequence

import soundfile as sf
import torch
import torchaudio
import torchaudio.functional as F

#: What the acoustic models want. Everything is resampled to this.
SAMPLE_RATE = 16_000

MODELS = {
    # 360 MB, English-only, trained for ASR. The cheap default.
    "wav2vec2_base": "WAV2VEC2_ASR_BASE_960H",
    # 1.2 GB, multilingual, trained *for alignment*. The "bigger model" answer.
    "mms_fa": "MMS_FA",
}

#: A CTC model emits a character some frames *after* the sound that caused it,
#: so every word span starts systematically late — by a constant, not by
#: chance. Measured against edge-tts's own word boundaries over the spike
#: sample: the numbers below are the median of (aligned start - true start),
#: and subtracting them takes the median start error to a few milliseconds.
#: Ends do not need it; only the start of a span is delayed this way.
#: Re-measure with `spikePerLine.ts --raw` if the model or its version changes.
LATENCY_SECONDS = {
    "wav2vec2_base": 0.115,
    "mms_fa": 0.095,
}


@dataclass
class WordSpan:
    """One spoken word, in seconds from the start of the clip."""

    word: str
    start: float
    end: float
    #: Mean per-frame CTC probability over the word. Low means "I placed this
    #: word, but I was not convinced" — the only self-report we get.
    score: float


class AlignmentFailed(RuntimeError):
    pass


def _normalize(word: str, vocabulary: set[str], upper: bool) -> str:
    """
    Reduce an authored word to the model's alphabet.

    Accents are folded rather than dropped (the pack has none, but a name might),
    curly apostrophes are straightened, and anything still outside the alphabet
    goes — so "Sparky!" is "sparky" and "REAL." is "real". The two bundles
    disagree about case (the ASR labels are upper, the alignment dict lower),
    hence `upper`. A word that survives as the empty string is one the model
    cannot be asked about; the caller decides what to do about that.
    """
    folded = unicodedata.normalize("NFKD", word.replace("’", "'").replace("‘", "'"))
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    cased = folded.upper() if upper else folded.lower()
    return "".join(c for c in cased if c in vocabulary)


def tokenize(text: str) -> list[str]:
    """Whitespace tokens, matching `align.ts`'s idea of a word."""
    return [t for t in re.split(r"\s+", text.strip()) if t]


class ForcedAligner:
    """
    A loaded acoustic model plus the CTC alignment around it.

    Construction downloads and loads the model (seconds); `align` is cheap after
    that. Not thread-safe, and deliberately reusable — build one, align a batch.
    """

    def __init__(self, model: str = "wav2vec2_base", device: str = "cpu") -> None:
        if model not in MODELS:
            raise ValueError(f"unknown model {model!r}; known: {', '.join(MODELS)}")
        self.name = model
        self.device = torch.device(device)

        bundle = getattr(torchaudio.pipelines, MODELS[model])
        self.model = bundle.get_model().to(self.device).eval()

        # The two bundles describe their alphabet differently: the ASR bundle
        # hands out an ordered label tuple, the alignment bundle a dict. Both
        # put the CTC blank at index 0.
        if hasattr(bundle, "get_dict"):
            self.dictionary: dict[str, int] = dict(bundle.get_dict())
        else:
            self.dictionary = {label: i for i, label in enumerate(bundle.get_labels())}
        self.vocabulary = {c for c in self.dictionary if c not in {"-", "|", "*"}}
        self.upper = any(c.isupper() for c in self.vocabulary)
        self.blank = 0

    # -- audio ------------------------------------------------------------

    def read_audio(self, path: Path | str) -> torch.Tensor:
        """Mono float32 at SAMPLE_RATE. mp3 and wav both go through libsndfile."""
        data, rate = sf.read(str(path), dtype="float32", always_2d=True)
        waveform = torch.from_numpy(data.T)
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        if rate != SAMPLE_RATE:
            waveform = F.resample(waveform, rate, SAMPLE_RATE)
        return waveform

    # -- alignment --------------------------------------------------------

    def align(
        self,
        audio: Path | str | torch.Tensor,
        text: str | Sequence[str],
        latency: float | None = None,
    ) -> list[WordSpan]:
        """
        Place every word of `text` in `audio`.

        `text` may be a string or an already-split word list — the batch cutter
        passes a list so its own line boundaries survive the round trip.

        `latency` overrides the model's emission-delay correction; pass 0.0 to
        see the raw CTC spans. See LATENCY_SECONDS.
        """
        delay = LATENCY_SECONDS[self.name] if latency is None else latency
        waveform = audio if isinstance(audio, torch.Tensor) else self.read_audio(audio)
        words = list(text) if not isinstance(text, str) else tokenize(text)

        normalized = [_normalize(w, self.vocabulary, self.upper) for w in words]
        spellable = [(i, n) for i, n in enumerate(normalized) if n]
        if not spellable:
            raise AlignmentFailed(f"nothing to align in {words!r}")

        targets = torch.tensor(
            [[self.dictionary[c] for _, n in spellable for c in n]],
            dtype=torch.int32,
            device=self.device,
        )

        with torch.inference_mode():
            emission, _ = self.model(waveform.to(self.device))
            # log_softmax is idempotent on log-probabilities, so this is correct
            # whether the bundle emits logits or log-probs.
            emission = torch.log_softmax(emission, dim=-1)
            aligned, scores = F.forced_align(emission, targets, blank=self.blank)

        spans = F.merge_tokens(aligned[0], scores[0].exp())
        by_word = _unflatten(spans, [len(n) for _, n in spellable])

        seconds_per_frame = waveform.shape[1] / emission.shape[1] / SAMPLE_RATE
        out: list[WordSpan] = []
        placed = {i: group for (i, _), group in zip(spellable, by_word)}
        cursor = 0.0
        for i, word in enumerate(words):
            group = placed.get(i)
            if not group:
                # Punctuation-only, or a word of characters the model has no
                # letter for. Zero-length, exactly like `align.ts`'s handling.
                out.append(WordSpan(word, round(cursor, 4), round(cursor, 4), 0.0))
                continue
            start = group[0].start * seconds_per_frame
            end = group[-1].end * seconds_per_frame
            # Undo the model's emission delay, but never far enough to start a
            # word before the one in front of it has finished, or after its own
            # end — a highlight that runs backwards is worse than a late one.
            start = min(max(start - delay, cursor, 0.0), end)
            weight = sum(s.end - s.start for s in group) or 1
            score = sum(s.score * (s.end - s.start) for s in group) / weight
            out.append(WordSpan(word, round(start, 4), round(end, 4), round(float(score), 4)))
            cursor = end
        return out


def _unflatten(spans: Iterable, lengths: Sequence[int]) -> list[list]:
    """Regroup a flat token-span list into one list per word."""
    spans = list(spans)
    out: list[list] = []
    cursor = 0
    for n in lengths:
        out.append(spans[cursor : cursor + n])
        cursor += n
    if cursor != len(spans):
        raise AlignmentFailed(f"token spans ({len(spans)}) do not cover the transcript ({cursor})")
    return out


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jobs", help="JSON file of [{id, audio, text}], or - for stdin")
    parser.add_argument("--model", default="wav2vec2_base", choices=sorted(MODELS))
    parser.add_argument("--out", default="-", help="where to write the JSON result")
    parser.add_argument(
        "--latency",
        type=float,
        default=None,
        help="seconds of emission delay to undo; 0 for the raw CTC spans",
    )
    args = parser.parse_args(argv)

    raw = sys.stdin.read() if args.jobs == "-" else Path(args.jobs).read_text(encoding="utf8")
    jobs = json.loads(raw)

    started = time.perf_counter()
    aligner = ForcedAligner(args.model)
    load_seconds = time.perf_counter() - started

    results = []
    for job in jobs:
        clock = time.perf_counter()
        try:
            words = aligner.align(job["audio"], job["text"], args.latency)
            entry = {"id": job["id"], "words": [asdict(w) for w in words]}
        except Exception as error:  # a failed line must not lose the batch
            entry = {"id": job["id"], "error": f"{type(error).__name__}: {error}"}
        entry["seconds"] = round(time.perf_counter() - clock, 4)
        results.append(entry)

    payload = {
        "model": args.model,
        "latency": LATENCY_SECONDS[args.model] if args.latency is None else args.latency,
        "loadSeconds": round(load_seconds, 3),
        "results": results,
    }
    text = json.dumps(payload, indent=1)
    if args.out == "-":
        sys.stdout.write(text)
    else:
        Path(args.out).write_text(text, encoding="utf8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
