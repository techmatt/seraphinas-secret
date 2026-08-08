# init_main_repo — bootstrap C:\Code\seraphinas-secret

Initialize the Seraphina's Secret main repo (this directory): git, a standing CLAUDE.md, and a minimal bootable game skeleton.

Context: Seraphina's Secret is a cozy, no-fail 2D exploration game for a 4-year-old — room-based world, Xbox 360 pad as primary input, heavy audio/particle "juice." Stack decided (Matt, 2026-08-08): TypeScript + Phaser 3 + Vite, run as a local browser page (F11 fullscreen); Playwright for automated boot/screenshot smoke tests. Voices will be pre-generated neural TTS with word timestamps — NOT part of this task. This task is scaffolding only, no real game content.

## 1. Git

git init on branch `main`. Sensible .gitignore (node_modules, dist, Playwright output). Do NOT ignore `scratch/` — reports are cheap text and useful history. Commit incrementally as steps complete.

## 2. CLAUDE.md — the standing contract

Create `CLAUDE.md` at repo root. It carries the rules below (adapt wording freely; keep every rule) plus a short project header: what the game is, the stack, and where things live.

**Report contract.** Every non-trivial prompt ends with a report at `scratch/<prompt-name>_report.md` (never repo root). ~60 lines is a SOFT target: write once, at most one trim pass, then stop — running over is fine; never iterate to squeeze under the number. Per-line test: does it change what the planner decides next? Content: outcome + commit hash per work item; every correction/deviation from the prompt, one line each; unrequested decisions needing attention; numbers with population + basis; test-suite status in two lines; NOT-done items one line each. No process narration, no restating the prompt. Overflow goes to appendix files (JSON preferred) beside the report, one pointer line each. Trivial tasks (a commit, a file move): one console line, no report file.

**Report delivery.** After writing a report, copy it and any appendices to `C:\Code\seraphinas-drive-sync\reports\` (create the folder if absent). Best-effort — a failed copy is never fatal; the `scratch/` copy is canonical.

**Runtime discipline.** Estimate runtime before each step; background anything over ~30 s; run long jobs detached (a reaper may kill waited tasks).

**Commit gate.** Never commit ≥20 MB of tree bytes without Matt's explicit prior confirmation. That's a sanity cutoff, not the test — the test is future usefulness.

## 3. Game skeleton

- Vite + TypeScript + Phaser 3, npm. `npm run dev` serves; `npm run build` produces a static `dist/`.
- One scene: a single room (flat-color placeholder background) with a placeholder character (a simple shape is fine) that walks via left stick AND arrow keys (keyboard fallback for automated tests).
- One juicy interaction: pressing gamepad A or keyboard Z near a marked object fires a particle burst + a placeholder sound (WebAudio beep is fine). This smoke-tests particles, audio, and input — it is not real content.
- Gamepad through Phaser's gamepad support / the standard Gamepad API mapping; must work with a wired Xbox 360 pad.

## 4. Playwright smoke test

- One test: start the dev server (or preview the build), load the page, assert the Phaser canvas renders, screenshot; keyboard-walk the character a few steps, screenshot again. Screenshots land in a predictable folder — they're how the planner visually audits future work.
- `npm test` runs it headless.

## 5. Report

`scratch/init_main_repo_report.md` per the contract you just installed (this prompt predates CLAUDE.md, hence the restatement above). Include: versions chosen (node/phaser/vite/playwright), anything worth knowing about browser gamepad support for 360 pads, and the screenshot paths.
