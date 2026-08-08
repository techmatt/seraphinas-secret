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
| `scratch/` | Reports and appendices. Committed on purpose. |
| `dist/` | `npm run build` output. Ignored. |

**Commands**: `npm run dev` (serve), `npm run build` (static `dist/`),
`npm run preview` (serve the build), `npm test` (Playwright, headless),
`npm run typecheck` (`src/` and `tools/`), `npm run voice:build` (regenerate audio;
incremental, `--force` to redo everything), `npm run voice:inspect` (check word
timings and phonics against the actual waveform, without listening).

---

## Standing rules

These apply to every prompt in this repo unless a prompt explicitly overrides them.

### Report contract

Every non-trivial prompt ends with a report at `scratch/<prompt-name>_report.md`.
Never at repo root.

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

After writing a report, copy it and any appendices to
`C:\Code\seraphinas-drive-sync\reports\`, creating the folder if it isn't there.
This is best-effort: a failed copy is never fatal. The `scratch/` copy is canonical.

### Runtime discipline

Estimate runtime before each step. Background anything over roughly 30 seconds,
and run long jobs detached — a reaper may kill tasks that are being waited on.

### Commit gate

Never commit 20 MB or more of tree bytes without Matt's explicit prior
confirmation. That number is a sanity cutoff, not the real test — the real test is
whether the bytes will be useful later.

### Git

Commit incrementally as steps complete, rather than one commit at the end.
