# Engineering notes

Durable facts that cost somebody a measurement, a build failure or an afternoon.
Everything here is checked against the code as of 2026-08-13; where the code and
the received wisdom disagreed, the code won and the note says so.

Not a style guide — design law is CLAUDE.md. This is what is *true* about the
tools, the pack and the browser.

## The art pack

**Measure every sheet. The readmes are licence text.** `npm run world:measure --
<pack-relative.png> [gap]` prints the bounding box of every connected run of
opaque pixels, which is where every rectangle in `tools/world/catalog.ts` and
`src/ui/toolIcons.ts` came from. `gap` dilates before labelling: 1 joins a lamp
to its own shadow, 0 when a box comes out spanning the sheet.

- **Player sheets are 9 columns × 56 rows of 64×64** (576×3584 px), the same grid
  for every paper-doll layer. Rows 0–2 idle, 3–5 walk, each in the pack's
  down / **right** / up order. There is no left row anywhere in the pack; left is
  `flipX` in code.
- **Rows 35–37 (axe) and 38–40 (hammer) are one swing shipped twice.** Not
  byte-identical throughout, which is the received version of this: 37 and 40 *are*
  identical across all nine columns, and 35/38 and 36/39 differ by 31 and 5 pixels
  of a 36,864-pixel band. Nothing in the body could break the tie — the tool
  overlay did. See `src/world/characterSheets.ts`.
- **NPC sheets are not on the player grid.** `Cute_Fantasy_Characters/` (knights,
  orcs, goblins, angels) and `NPCs (Premade)/` are each their own grid, and the
  pack has no child in it at all. Every person in this game is therefore the
  player paper doll with different hair and shirt — see `kid()`. If a future
  prompt does use a pack NPC sheet, measure that sheet on its own.
- **Interior furniture and wall sheets are not safely indexable.** A bed is 25 px
  of art in a 32 px slot; a counter unit is 16×20. That is the whole reason
  `catalog.ts` is a list of measured rectangles rather than frame numbers.
- **Small tree sheets are a matched set.** `Trees/Small_*_Tree.png` are all
  96×64 = three 32×64 slots: slot 0 a small stump (art 7×9 at 13,41), slot 1 the
  tree with its shadow, slot 2 the tree without. Identical layout for oak,
  spruce, birch and fruit — so a small tree and a matching small stump are two
  slots of one file.
- **`Crops/Crops.png` is 7 columns × 22 crops, two 16-px rows each** (112×704).
  Per crop: sign, seed jar, sprout, two growing stages, the mature plant in the
  ground (column 5), the harvested item icon with a cream outline (column 6). So
  a crop's world form and its HUD icon are two cells of one row.
- **The base pack has no coin and no rabbit.** The coin comes from the separate
  `Cute_Fantasy_UI` download: `UI/UI_Icons.png` is 39 × 16 cells of 16 px, and
  its first row is five filled / half / empty triples — heart, star, coin,
  lightning, shield. The gold coin is frame 6. There is no rabbit, hare or bunny
  anywhere in any of the twelve packs.
- The mirror is whole folders: `CATEGORIES` in `tools/assets/config.ts`, copied
  into the gitignored `public/assets/` by `npm run assets:sync` (a `predev` and
  `prebuild` step). Pack pixels never enter the repo.

## Collision and footings

- **A prop's solid cells sit centred under the part of it that touches the
  ground, in whole tiles**, with the sprite nudged up to half a tile so both can
  be true at once. One implementation: `tools/world/footing.ts`. Do not
  re-derive it anywhere.
- **`npm run world:footings` checks a rect's centre and bottom alignment, never
  its SIZE.** An oversized collision rect passes it. Holding **B** in game draws
  the same overlay over the real world, which is what catches the rest.
- **Movement is substepped.** `MAX_STEP = TILE_SIZE / 4` (16 px) per collision
  step, one axis at a time. Headless Chromium runs long frames and an unstepped
  move tunnels straight through a trunk.

## Voice (edge-tts, until ElevenLabs)

- **A mid-line `!` or `.` buys about 0.9 s of dead air** — on screen, a second
  with no word lit. Trailing punctuation is free. The fix is the `say`/`text`
  split in `content/voice/lines.json`: `text` is what is shown, `say` is what is
  spoken, and a comma in `say` keeps the beat without the silence.
- **A sustained unvoiced consonant is read as the letter's NAME.** "Sss" comes
  out "ess ess ess". Use a spelling that leads with a real phoneme ("Suh") and
  note it on the line.
- Word boundaries arrive from the service in **100-nanosecond ticks**; see
  `TICKS_PER_SECOND` in `tools/voice/providers/edgeTts.ts`.
- Generation costs roughly a second of wall clock per line, so a full
  `voice:build --force` of the whole book is a background job, not a wait.
- **The manifest's per-line `speaker` can go stale.** The incremental
  fingerprint hashes `{provider, resolved voice, text, say}` — the speaker *id*
  is not in it, so renaming a speaker while keeping the same voice settings
  leaves every cached line labelled with the old name. `--force`, or delete
  `public/voice/.build-cache.json`.
- **The game may only read `public/voice/manifest.json`.** No file under `src/`
  may know a provider exists. That is the whole reason the manifest is the
  contract.
- `npm run voice:inspect` answers "do the highlights match the audio" and "is
  this phonics line saying the sound or the letter" without anybody listening.

## Runtime

- **`npm install phaser` resolves Phaser 4.** Stay pinned `^3` in package.json.
- **Per-texture NEAREST plus `camera.setRoundPixels(true)`, never Phaser's
  global `pixelArt` flag** — the global one jaggies the vector UI. See
  `Character.ts`, `TileWorld.ts` and the row files for the per-texture calls, and
  `RoomScene.setupCamera` for the camera.
- **Walking through a doorway rebuilds the zone from the generated map file.**
  Anything that must survive it belongs in `src/state/session.ts` and nowhere
  else. The map file always has every tree standing.
- **A night's sleep clears the store — except `persistent`.** Coins are the first
  thing on that side of the seam; see `SessionState.resetForSleep`. Nothing here
  touches disk, and a page reload still starts from nothing.

## Build gates

- **`npm run world:build` refuses to write a world you cannot walk across.**
  Flood fill from the spawn must reach every spawn, landmark, npc, doorway and
  prop; the boundary must be sealed three ways, including *with every choppable
  tree felled* — she has an axe, and a boundary that only holds while the wood
  stands has a timer on it. `--check` runs the lot and writes nothing.
- Quest furniture (`src/quest/quests.ts`) is **not** in `content/world/`, so the
  build gate never sees it. `tests/quest.spec.ts` stands in, over the same
  collision grid.
- `npm run typecheck` is two projects: `tsconfig.json` (src) and
  `tsconfig.tools.json` (tools + content). `npm run build` runs it first.

## Tests

- **Headless Chromium draws this game in software at roughly fifteen frames a
  second.** The suite is latency-bound, not throughput-bound: `workers: 1` is
  measured, not cautious — two workers dropped a walking test, four turned
  ten-second tests into five-minute timeouts.
- **Page startup dominates the fast suite.** A test is one boot with every
  question that zone can answer asked inside it. Before writing a new test, look
  for the boot that already goes where it belongs.
- **Teleport to anything the test is not about.** `hooks.teleport` and
  `standAt` exist for exactly that; anything asserting a place is *reachable*
  still walks.
- `hooks.session()` is a function returning a deep copy; `readHooks` calls it and
  strips every other function, because functions do not survive serialisation
  back to node.
- Screenshots are taken of the **page**, not the canvas element — byte-identical
  here and three times cheaper, because element screenshots go through
  actionability checks first. This holds only while the viewport matches
  `GAME_WIDTH × GAME_HEIGHT`.
- `?fastBoot=1` skips the title greeting (~2.5 s a test) but still performs the
  press, because that press is what unlocks the AudioContext.
- Wait on numbers the game keeps (`hooks.whacks`, `hooks.sleeps`,
  `hooks.quest.step`), never on a stopwatch. A press landing inside a skipped
  frame is gone, so the helpers press until it takes.
