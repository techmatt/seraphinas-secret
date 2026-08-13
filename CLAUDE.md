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
| `content/world/` | Authored map layout: regions, roads, where buildings go. Source of truth. |
| `tools/voice/` | The voice generator. Providers live under `providers/`; nothing else may. |
| `tools/world/` | The map generator, plus the catalog of which pack rectangle is which. |
| `tools/assets/` | Mirrors the side-loaded art pack into `public/assets/`. |
| `public/` | Static assets served as-is. `voice/` and `world/` are generated — do not hand-edit. |
| `tests/` | Playwright specs, plus `harness.ts` (boot, route, steer, read hooks). |
| `tests/screenshots/` | Where the screenshot tour lands. Regenerated, ignored — see **Screenshots**. |
| `docs/` | `systems.md` — every subsystem's entry point. `engineering.md` — durable facts about the pack, edge-tts, the browser and the gates. Read before rediscovering something. |
| `dist/` | `npm run build` output. Ignored. |

**Art** is the side-loaded Cute Fantasy pack at `C:\Code\seraphinas-assets`
(override with `SERAPHINA_ASSETS`). Pack pixels never enter the repo; generated
map data does. See README, "Art assets" and "The world".

Reports live outside the repo entirely — see **Report delivery** below.

**Commands**: `npm run dev` (serve), `npm run build` (static `dist/`),
`npm run preview` (serve the build), `npm test` (Playwright, headless — the
fast suite; see **The two test suites**), `npm run test:slow` (the picture
tours and the long walk), `npm run test:all` (both),
`npm run typecheck` (`src/`, `tools/` and `content/`), `npm run voice:build`
(regenerate audio; incremental, `--force` to redo everything),
`npm run voice:inspect` (check word timings and phonics against the actual
waveform, without listening), `npm run world:build` (regenerate the maps in
`public/world/` from `content/world/layout.ts`; needs the art pack side-loaded,
and refuses to write a world you cannot walk across),
`npm run world:measure -- <pack-relative.png>` (print the bounding box of
everything drawn on a pack sheet, which is where catalog rectangles come from),
`npm run world:footings` (check every catalog hitbox against the pixels it is
supposed to be the hitbox of; hold **B** in the game to see the same thing
drawn over the world).

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

### Narrative lines are spoken by Seraphina

A prop line, a bed, a sign — anything not coming out of a specific character's
mouth — is voiced as the `seraphina` speaker, first person where it reads
naturally (Matt, 2026-08-12). Borrowing another speaker's clip for the world's
own voice is a bug. Lines a character genuinely says stay theirs.

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
The report does not live in this repo — not at the root, not in `scratch/`. One
copy, on the drive, so there is nothing to drift out of date.

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

**No appendix files, by default.** A report is one file and that is the whole
deliverable. An appendix exists only where the prompt asks for one *by name*, and
then it goes on the drive beside the report with one pointer line in it.

Data you will consume again — measurements, maps, inventories, catalogs — is not
an appendix. It belongs **in the repo**, where the next session will find it
without being told: `docs/` for a durable fact, a catalog or a layout for a
measurement the code reads, `scratch/` for a working file. A number that only
matters once goes in the report and nowhere.

Trivial tasks — a single commit, a file move — get one console line and no report
file.

### Report delivery

Write the report straight into `C:\Code\seraphinas-drive-sync\reports\`, creating
the folder if it isn't there. That copy is the only copy — no second one in the
repo to drift out of date. Any appendix the prompt asked for by name goes beside
it; everything else the prompt produced is either in the repo or in the report.

If the folder cannot be created or written, fall back to `scratch/` in this repo
and say so in the report itself, so the next reader knows the drive copy is
missing. That is the only case in which a report is ever written into the repo.

### The two test suites

`npm test` is the **fast suite**: thirteen tests, everything that fails when the
code is wrong. Around two and a half minutes. This is what to run while working, and what
has to be green before a commit.

The tests are deliberately few and long. Page startup is the dominant cost in
this suite, so a test is one boot with every question that zone can answer asked
inside it, rather than one boot per question — and anything the test is not
actually about is teleported to rather than walked to. When adding a claim, look
for the test that already boots where it belongs before writing a new one.

`npm run test:slow` is the five tests tagged `@slow`, about a minute:

- `landmarks.spec` — all three tours: the exterior, the cave and the house.
  Twenty-one framings, six assertions. They exist to regenerate
  `tests/screenshots/`, not to catch bugs.
- `hitboxes.spec` — *the wood, with its hitboxes showing*. Seven framings, same
  reason. The overlay's own behaviour is tested in `world.spec`.
- `world.spec` — *the Mystic Woods can be reached on foot*. The one tagged for
  itself rather than for its pictures: it walks the whole exterior at her real
  speed, which cannot be shortened without giving up the claim.

So the fast suite does **not** prove the world is connected on foot, and does
not refresh the screenshots. Run `npm run test:all` before reporting anything,
before any change to `content/world/`, and any time a claim rests on a picture.

A test joins the slow suite by taking a `{ tag: '@slow' }` argument, with a
comment above it saying why. Say why in terms of what is lost by not running it.

### Screenshots

**Reports do not gather evidence screenshots** (Matt, 2026-08-12). Matt verifies
by playing the game, so a picture in a report is a picture nobody needed. Take as
many as you like to check your own work, then delete them.

The exception is a prompt that asks for a screenshot by name. Then — and only
then — it is a report appendix: it goes in the drive reports folder beside the
report that cites it, and it is never committed.

`tests/screenshots/` is the screenshot tour's output directory. It is
regenerated by `npm run test:slow` — the fast suite takes no pictures at all
now — and gitignored, so it is a scratch pad, not an audit
trail; copy out the frames a report actually cites. What the tours cover is the
world and the collision grid; anything closer than that (the tool row, a speech
balloon, a swing mid-flight) has to be photographed by hand or played. An image may be committed
only if a test actually reads it — a baseline to compare against, not a picture
of the game. PNGs already in the history stay where they are: they are untracked
going forward, and the history is never rewritten.

### Runtime discipline

Estimate runtime before each step. Background anything over roughly 30 seconds,
and run long jobs detached — a reaper may kill tasks that are being waited on.

### Commit gate

Never commit 20 MB or more of tree bytes without Matt's explicit prior
confirmation. That number is a sanity cutoff, not the real test — the real test is
whether the bytes will be useful later.

### Git

Commit incrementally as steps complete, rather than one commit at the end.
