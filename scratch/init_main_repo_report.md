# init_main_repo — report

## Outcomes

| Work item | Commit | Status |
| --- | --- | --- |
| Git init on `main` + .gitignore | `12b8f81` | done |
| CLAUDE.md standing contract | `12b8f81` | done |
| Game skeleton (Phaser 3 + Vite + TS) | `a556d99` | done |
| Playwright smoke test | `a556d99`, fixed in `4dfe1d7` | done |

Tree is 91 KB tracked, 128 KB `.git` — nowhere near the 20 MB gate.

## Versions

Resolved by `npm install` on 2026-08-08, not pinned by the prompt:

- node 24.19.0, npm 11.17.0
- phaser **3.90.0**, vite 8.2.1, typescript 7.0.2
- @playwright/test 1.62.1, @types/node 26.2.0, Chromium via `playwright install`

## Corrections and deviations

- `npm install phaser` resolved **Phaser 4.2.1**. Pinned to `^3` → 3.90.0, per the
  stack decision in CLAUDE.md. Worth a conscious call later: Phaser 4 is out, and
  the particle/scene APIs this skeleton uses did change between the majors.
- `GAME_WIDTH`/`GAME_HEIGHT` moved from `main.ts` to new `src/config.ts`.
  `RoomScene` imported them from `main.ts`, which constructs the game as a side
  effect — an import cycle through the entry point.
- Added `"node"` to `tsconfig.json` `types`; the spec imports `node:path` and
  `types: ["vite/client"]` alone excluded it.
- Interaction test walked for hardcoded durations and stopped ~181 px from the
  stone, outside the 120 px interact radius — it failed on first run. It now reads
  the stone position from the hooks and hops toward it.
- The `03-sparkle.png` screenshot was an empty room on first green run: a
  screenshot round trip outlives the 380–900 ms particles. The test now freezes
  the scene before shooting. I initially read this as a particle bug; it was not —
  particles emit fine, the observation was just late.

## Decisions worth attention

- **The test-hook surface grew.** `src/testHooks.ts` now also exposes `stone`,
  `interactRadius`, `peakParticles`, `aliveParticles` and a `pause()` that halts
  the scene. Rationale: any assertion about transient juice races the round trip
  unless the test can either freeze time or read a high-water mark. Expect this
  object to keep growing as juice gets richer — it is the one place test-shaped
  code is allowed to live.
- HUD text, walk speed (260 px/s), interact radius (120 px) and all colours are
  placeholder numbers chosen to make the smoke test legible, not design intent.

## Gamepad support — what matters for a wired 360 pad

- Chromium maps XInput devices to the Gamepad API `"standard"` mapping, so
  Phaser's `pad.A` and `pad.leftStick` line up with a 360 pad without a custom
  mapping table. `input: { gamepad: true }` is set in `main.ts`.
- **A pad does not appear in `navigator.getGamepads()` until a button is pressed
  on it.** This is a browser privacy behaviour, not a bug, and it will read as
  "the controller is broken" to a 4-year-old on a cold boot. The HUD says
  "controller: press a button to wake it" as a stopgap; a real attract screen
  should handle this.
- Audio needs a real user gesture before an AudioContext will leave `suspended`.
  `unlockAudio()` is wired to first keypress, pointerdown and pad-connect.

## Test suite

`npm test` — 2 specs, 2 passed, ~22 s headless on Chromium.
`npm run build` — typecheck + bundle clean; 1.20 MB JS (321 KB gzipped), all Phaser.

## Screenshots

- `tests/screenshots/01-boot.png` — room, character, glowing stone, HUD.
- `tests/screenshots/02-walked.png` — after arrow-key walk.
- `tests/screenshots/03-sparkle.png` — burst mid-flight, scene frozen.

Visually verified all three; the room and the burst both render as intended.

## Not done

- **The gamepad path has never been executed** — no pad on this machine, and
  headless Chromium cannot inject Gamepad API state, so Playwright cannot cover
  it. The stick/A-button code is written but unproven. First job with hardware
  present is to confirm it on the real 360 pad.
- No `public/` directory yet — nothing to put in it.
- No fullscreen affordance beyond F11; no scaling check on a real TV.
- Phaser 4 not evaluated (see above).
