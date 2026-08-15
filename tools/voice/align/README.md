# Forced alignment

Word timings recovered from audio plus the text that was spoken, for providers
that do not hand out timestamps of their own. edge-tts does; Adobe Firefly, the
provider Matt generates WAVs with by hand, does not — and per-word highlighting
is the reading mechanic, so the timings have to come from somewhere.

Content-time only. Nothing under `src/` may import any of this, and the game
still only ever reads `public/voice/manifest.json`.

## The pieces

| File | What |
| --- | --- |
| `aligner.py` | The aligner. Audio + spoken text → spans over the spoken words. Knows nothing about the game. |
| `runAligner.ts` | Node's side of it: spawn the script, hand it a whole batch, get JSON back. |
| `spikePerLine.ts` | Measures alignment against edge-tts's own timestamps. |
| `spikeBatch.ts` | Synthesises one long utterance, aligns it, cuts it into per-line clips. |

`../align.ts` — one directory up — is a different job with a similar name: it
maps *spoken* words onto the *displayed* tokens the game highlights. That stays
the single implementation of that contract; the aligner never does it.

## Setup

Python 3.13, and about 1.3 GB of disk for torch.

```sh
python -m venv tools/voice/align/.venv
tools/voice/align/.venv/Scripts/python.exe -m pip install \
  --index-url https://download.pytorch.org/whl/cpu torch==2.6.0 torchaudio==2.6.0
tools/voice/align/.venv/Scripts/python.exe -m pip install -r tools/voice/align/requirements.txt
```

The CPU index matters: the default one pulls three gigabytes of CUDA for a
machine with no card. `soundfile` is there because this machine has no ffmpeg
and libsndfile is the only thing here that decodes an mp3.

The scripts find `.venv` themselves; `VOICE_ALIGN_PYTHON` overrides it.

## Models

Both download to torch's hub cache on first use and are then free.

- `wav2vec2_base` (default) — `WAV2VEC2_ASR_BASE_960H`, 360 MB, English.
- `mms_fa` — 1.2 GB, multilingual, trained for alignment rather than ASR.

Measured over all 75 lines of the book, `mms_fa` is not better enough to pay
for: it costs about three times the wall clock and lands in the same place.
See the spike report.

## The one thing that will bite

A CTC model emits a character some frames *after* the sound that caused it, so
raw spans start about 100 ms late — every word, in the same direction. That is
`LATENCY_SECONDS` in `aligner.py`, subtracted by default. `--latency 0` shows
the raw spans, which is how the constant was measured; re-measure it with
`spikePerLine.ts --raw` if the model or torchaudio version changes.
