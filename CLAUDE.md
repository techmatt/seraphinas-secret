# CLAUDE.md — Seraphina's Secret

## The project

**Seraphina's Secret** is a cozy, no-fail 2D exploration game built for a 4-year-old.
Room-based world, wander and poke at things, nothing can be lost or failed. The
Xbox 360 pad is the primary input; keyboard exists mainly so automated tests can
drive the game. Heavy audio and particle "juice" is a feature, not polish — it is
most of what makes the game readable to a small child.

Every piece of text speaks, and the word being spoken is always highlighted — that
pairing is the reading instruction, not decoration. Voices are pre-generated neural
TTS with word-level timestamps, baked at content time, never synthesised at runtime.
The provider today is edge-tts (free proxy voices); ElevenLabs replaces it later, so
the game may only ever read `public/voice/manifest.json`, never a provider.

**Stack** (decided 2026-08-08): TypeScript + Phaser 3 + Vite, npm. It runs as a
local browser page — open it and press F11 for fullscreen. Playwright drives
headless boot/screenshot smoke tests.

**Where things live**

| Path | What |
| --- | --- |
| `src/` | Game source. `main.ts` boots Phaser; `scenes/` holds scenes. |
| `content/voice/` | Authored dialog: `lines.json` and `voices.json`. Source of truth. |
| `tools/voice/` | The generator. Providers live under `providers/`; nothing else may. |
| `public/` | Static assets served as-is. `voice/` is generated — do not hand-edit. |
| `tests/` | Playwright specs, plus `harness.ts` (boot, steer, read hooks). |
| `tests/screenshots/` | Smoke-test screenshots — the planner's visual audit trail. |
| `dist/` | `npm run build` output. Ignored. |

Reports live outside the repo entirely — see **Report delivery** below.

**Commands**: `npm run dev` (serve), `npm run build` (static `dist/`),
`npm run preview` (serve the build), `npm test` (Playwright, headless),
`npm run typecheck` (`src/` and `tools/`), `npm run voice:build` (regenerate audio;
incremental, `--force` to redo everything), `npm run voice:inspect` (check word
timings and phonics against the actual waveform, without listening).

---

## Standing design rules

These hold for every task in this repo. They are design law, not preferences —
honor them without being told.

### Button prompts are colored dots, never letter labels

`src/ui/ButtonDot.ts` is the single source for every button prompt in the game.
Green = A (interact/confirm), red = B (cancel/exit), blue = X (switch tool),
yellow = Y (help/replay). The player is 4 and cannot read a letter, but "press the
green button" is literally true of the pad in her hands. No "A"/"B" glyphs, no
button-name text, anywhere.

### Every piece of on-screen text speaks aloud, with per-word highlighting

She can't read, so audio-first *is* the UI. Any text that appears must have a voice
line and must highlight each word as it is spoken. Text with no voice is a bug.

### No fail states

A game-design rule: no timers, no death, no lives, no wrong-answer buzzers, no
losing progress. A wrong choice does something mildly funny and the game carries on.
(This is about mechanics — code should still be robust and errors still handled.)

---

## Standing rules

These apply to every prompt in this repo unless a prompt explicitly overrides them.

### Report contract

Every non-trivial prompt ends with a report at
`C:\Code\seraphinas-drive-sync\reports\<prompt-name>_report.md`, and nowhere else.
Reports do not live in this repo — not at the root, not in a scratch folder.

Length: ~60 lines is a **soft** target. Write it once, take at most one trim pass,
then stop. Going over is fine. Never iterate to squeeze under the number.

The test for every line: **does it change what the planner decides next?** If not,
cut it.

Include:

- Outcome plus commit hash, per work item.
- Every correction or deviation from the prompt — one line each.
- Decisions made that weren't requested and deserve attention.
- Numbers, always with population and basis ("14 of 60 rooms", not "14").
- Test-suite status in two lines.
- Anything NOT done — one line each.

Leave out: process narration, and any restating of the prompt.

Overflow goes to appendix files next to the report (JSON preferred), with one
pointer line each in the report.

Trivial tasks — a single commit, a file move — get one console line and no report
file.

### Report delivery

Write the report and its appendices straight into
`C:\Code\seraphinas-drive-sync\reports\`, creating the folder if it isn't there.
That copy is the only copy — no second one in the repo to drift out of date.

If the folder cannot be written, say so in the final message and paste the report
into the conversation instead. Never fall back to writing it into the repo.

### Runtime discipline

Estimate runtime before each step. Background anything over roughly 30 seconds,
and run long jobs detached — a reaper may kill tasks that are being waited on.

### Commit gate

Never commit 20 MB or more of tree bytes without Matt's explicit prior
confirmation. That number is a sanity cutoff, not the real test — the real test is
whether the bytes will be useful later.

### Git

Commit incrementally as steps complete, rather than one commit at the end.
