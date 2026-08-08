# voice_pipeline_spike — report

## Outcome

| Work item | Outcome | Commit |
| --- | --- | --- |
| `tools/voice/` pipeline + provider interface | done | `c042250` |
| 9 spike lines, 3 voices, generated into `public/voice/` | done | `c042250` |
| Letter-sound experiment (22 renderings) | done, **negative result** | `c042250` |
| `SpeechBubble` + wired to A / Z | done | `ed2a1e0` |
| Playwright highlight test + screenshot | done | `ed2a1e0` |

## edge-tts verdict: usable, ship it

**`edge-tts-universal@1.4.0`** — no API key, no Edge install, word boundaries in
100-ns ticks, mp3 at 24 kHz mono. 9 lines in ~9 s. Zero synthesis failures across
~40 calls today; the provider retries 3× anyway.

`@andresaya/edge-tts` was **not** installed: it peer-depends on `typescript@^5` and
this repo is on 7, so npm refuses without `--legacy-peer-deps`. No reason to force it.

The provider seam is `tools/voice/providers/edgeTts.ts`. Nothing else in the repo
imports it, and nothing in `src/` knows a provider exists — the game reads only
`public/voice/manifest.json`.

## Letter-sound experiment: it does not work, and here is the rule

**edge-tts reads any run of s's as the letter NAME, once per letter.** `"Sss"` comes
out *"ess ess ess"*; `"Ssssssss"` is *"ess"* eight times. Case, hyphens, trailing
punctuation and rate all change nothing. SSML is dead too — the package xml-escapes
its input, so `<phoneme>` is spoken aloud as *"phoneme alphabet equals ipa…"*.

I could not listen to any of this, so I measured it: `/s/` is unvoiced hiss with a
very high zero-crossing rate, any vowel is voiced and low, so *"ess"* is a V-then-S
pair and a real sustained *sss* would be one unbroken S. A lone `"S"` and a spelled
`"Ess"` produce byte-for-byte the same V-S shape, which is what pins the diagnosis.
All 22 renderings: `scratch/voice_pipeline_spike_phonics.json`.

**Kept:** `say: "Suh"` at `rate: -25%` — 0.16 s of clean leading `/s/`, one hiss run,
no letter name. It is an approximation with a schwa on the end, and it is the best
edge-tts can do. The authored line carries a `note` saying so.

**The rule for authoring future phonics lines:** voiced continuants sustain fine as
doubled interjections — `"Mmm"` gives 0.36 s of unbroken hum, no letter name, no
tricks needed. Unvoiced consonants (s, f, sh, th, h) cannot be done this way at all.
`"Shhh"` does work, so the *sh* digraph is fine. Expect to re-record every unvoiced
phonics line when ElevenLabs lands; treat them as placeholders, not content.

## Timing accuracy

Measured, not listened to (`npm run voice:inspect`), over 37 words / 9 lines:

- **Non-initial words are frame-accurate**: median lag 0.001 s, and 23 of 28 are
  within ±2 ms of audible onset. Nothing to fix.
- **The first word of every line is early by 61–143 ms** (mean 0.11 s): edge-tts does
  not count the clip's leading silence. Left alone — a highlight that lands slightly
  before the sound is the right way round for a child following along.
- The other 5 are words that follow a pause — a comma, an em dash, a breath — and are
  early by 51–94 ms, same cause.
- **Every clip has 0.8–1.2 s of silence after the last word.** The bubble ignores it
  and holds on the manifest's `duration` + 0.7 s instead of waiting for audio end.
  If clip size ever matters, trimming that is ~25% of the bytes.
- 87–100% of each clip's energy falls inside a word window, so almost nothing is
  spoken while no word is lit.

## Voices chosen

| Speaker | Voice | Prosody |
| --- | --- | --- |
| Seraphina | `en-US-AnaNeural` (child) | rate −8% |
| Dad | `en-US-GuyNeural` (adult male) | rate −10%, pitch −15 Hz |
| Little Sister | `en-US-AnaNeural` | rate +6%, **pitch +40 Hz** |

Little Sister is Ana pitched up, as the prompt allowed. She is clearly distinct from
Seraphina, but it is the same voice — worth an ear check before it ships.

## Decisions not asked for

- **`say` field on a line**, separate from displayed `text`, plus per-line
  `rate`/`pitch`/`volume`. The phonics experiment cannot exist without the first, and
  the chosen rendering needs the second. Alignment is strict by default and only
  loosens when `say` is present.
- **Manifest carries every display token**, not just spoken ones, so `words.join(' ')`
  rebuilds the line exactly. Punctuation-only tokens (the em dash) get
  `start === end`, so they hold their place and never highlight.
- **`tools/voice/inspect.ts` (`npm run voice:inspect`)** kept and committed. It is the
  only reason any claim above about audio is checkable; future phonics authoring needs
  it. Chromium decodes the mp3 — no ffmpeg on this machine.
- **`src/audio/context.ts`** split out of `beep.ts` so voice and chimes share one
  AudioContext and one unlock. `unlockAudio` moved; `beep.ts` re-imports it.
- Alignment mismatches **fail the build** rather than warn. A silently misaligned line
  means a four-year-old watches the wrong word light up.
- `tsconfig.tools.json` + `npm run typecheck` now covers `tools/` as well as `src/`.
- `tests/harness.ts` extracted from `smoke.spec.ts`; the smoke tests are unchanged.

## Corrections to the prompt

- `voices.json` is `{ provider, speakers: {...} }`, not a bare speaker map — the
  provider name has to live somewhere, and putting it in the voice book is what lets
  the build refuse a manifest built for the wrong provider.
- Audio does **not** go through Phaser's sound manager. It goes through the existing
  `unlockAudio` AudioContext, decoded to buffers, because `ctx.currentTime` is the
  clock the highlight needs and Phaser's own context would be a second one.

## Tests

`npm test` — 6 passed, 0 failed (2 pre-existing smoke, 4 new voice). Full suite ~42 s.
The real-time playback test was repeated 2× to check for flakiness; stable.
`npm run typecheck` and `npm run build` clean.

Canonical audit image: `tests/screenshots/04-speech-bubble.png` — "sure" lit,
mid-line, tail pointing at Seraphina.

## Not done

- Nobody has heard any of this. Every acoustic claim is measured, not listened to.
  Matt should play `public/voice/*.mp3` before these lines go anywhere near a child.
- The sustained-`sss` problem is unsolved, not worked around. It waits on ElevenLabs.
- No ElevenLabs provider stub — the interface is there, the module is not.
- The bubble always anchors to the player; Dad and Little Sister lines have no
  on-screen speaker to point at yet.
- Long lines wrap at a fixed 620 px with no measurement of what a 4-year-old can
  track; two lines of text is untested on a real child.
