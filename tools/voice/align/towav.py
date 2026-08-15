"""
Anything libsndfile can decode → a 16-bit PCM wav at a chosen rate.

Two uses, both small. The batch simulator needs edge-tts's mp3 turned into the
kind of file Firefly hands out, so the ingest is exercised on a real WAV at a
real sample rate rather than on the format that happens to be convenient. And
if a download ever arrives in something the ingest chokes on, this is the
one-line fix.

    python towav.py in.mp3 out.wav --rate 44100

Content-time only, like everything else here.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

import soundfile as sf
import torch
import torchaudio.functional as AF


def convert(source: Path | str, target: Path | str, rate: int | None = None, mono: bool = True) -> dict:
    data, source_rate = sf.read(str(source), dtype="float32", always_2d=True)
    signal = torch.from_numpy((data.mean(axis=1) if mono else data.T).copy())
    if signal.dim() == 1:
        signal = signal.unsqueeze(0)

    out_rate = source_rate if rate is None else int(rate)
    if out_rate != source_rate:
        signal = AF.resample(signal, source_rate, out_rate)

    Path(target).parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(target), signal.T.numpy(), out_rate, subtype="PCM_16")
    return {
        "source": str(source),
        "target": str(target),
        "sourceRate": int(source_rate),
        "rate": out_rate,
        "channels": int(signal.shape[0]),
        "seconds": round(signal.shape[1] / out_rate, 3),
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--rate", type=int, default=None, help="output sample rate; source's by default")
    parser.add_argument("--stereo", action="store_true", help="keep the channels rather than mixing down")
    args = parser.parse_args(argv)

    sys.stdout.write(json.dumps(convert(args.source, args.target, args.rate, not args.stereo)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
