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
  pack has no child in it at all. Every *child* in this game is therefore the
  player paper doll with different hair and shirt — see `kid()`.
- **`NPCs (Premade)/` is the pack's only adult, and it drops straight in.**
  Measured 2026-08-15 for Dad: the eight sheets are 6 columns of the same 64x64
  frame (Farmer_Bob/Buba 384x832 = 13 rows, Lumberjack/Miner 384x640 = 10,
  Bartenders/Chef 384x448 = 7, Fisherman_Fin 576x832 = 9 columns), rows 0-2 idle
  and 3-5 walk in the pack's own down/right/up order, and the rest job
  animations. The part worth writing down: **their feet are on frame row 40,
  exactly like the player's**, so `FOOT_ORIGIN_Y` needs no adjusting — only the
  head does, since a grown-up starts at row 19 rather than 23 (`headTop` on the
  sheet). Bob and Buba are 17x22 pack pixels against Seraphina's 13x18.
- **Interior furniture and wall sheets are not safely indexable.** A bed is 25 px
  of art in a 32 px slot; a counter unit is 16×20. That is the whole reason
  `catalog.ts` is a list of measured rectangles rather than frame numbers.
- **Small tree sheets are a matched set.** `Trees/Small_*_Tree.png` are all
  96×64 = three 32×64 slots: slot 0 a small stump (art 7×9 at 13,41), slot 1 the
  tree with its shadow, slot 2 the tree without. Identical layout for oak,
  spruce, birch and fruit — so a small tree and a matching small stump are two
  slots of one file. Catalogued as `oakSmall` (blocks `x 0.5, y 2`) and
  `smallStump` (rect 8,34,16,16), both level to the pixel: the stump's opaque
  base is only six columns wide, so the seven-pixel art centres exactly, and the
  bottom two rows are shadow — which is why the rect bottom-aligns two rows low,
  exactly as the big `stump` does.
- **`Crops/Crops.png` is 7 columns × 22 crops, two 16-px rows each** (112×704).
  Per crop: sign, seed jar, sprout, two growing stages, the mature plant in the
  ground (column 5), the harvested item icon with a cream outline (column 6). So
  a crop's world form and its HUD icon are two cells of one row.
- **The base pack has no coin and no rabbit.** The coin comes from the separate
  `Cute_Fantasy_UI` download: `UI/UI_Icons.png` is 39 × 16 cells of 16 px, and
  its first row is five filled / half / empty triples — heart, star, coin,
  lightning, shield. The gold coin is frame 6. There is no rabbit, hare or bunny
  anywhere in any of the twelve packs.
- **The bunnies are frogs, and `src/world/Bunny.ts` is the only file that knows.**
  `Animals/Frog/Frog_06.png` is the palest of six colourways (mean luminance 99
  against the green one's 80) and the frog is the only animal in any pack that
  *hops*. 320×128 = ten columns × four rows of 32 px: row 0 is two frames of
  idle, row 1 eight frames of the hop, row 2 a tongue lashing at a fly, row 3 a
  hurt flash. Only the first two are used. The animal is drawn 11 px square in
  the middle of its cell with its feet at 21/32 down. Every id, key, line and
  slot in the game says *bunny*; swapping in real art is four constants.
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

## Forced alignment (for the providers that give no timings)

Measured 2026-08-15 over all 75 lines, against edge-tts's own word boundaries.

- **Raw CTC word spans start about 115 ms late, every word, in the same
  direction.** That is the model emitting a character some frames after the
  sound that caused it, not noise: median +115 ms, p5 +75, p95 +177. Subtract
  the constant (`LATENCY_SECONDS` in `tools/voice/align/aligner.py`) and the
  median start error falls to 27 ms, p95 80 ms, with 10 of 436 words over
  100 ms. **Ends need no correction** — they were within 33 ms untouched.
- **Pitch shifting and slowed prosody are not the risk they looked like.**
  Hazel at +40 Hz and Sneak at −35 Hz align *better* than Seraphina's own
  voice; the −22% storybook pages are a few ms worse and no more.
- **What actually wanders is a vowel or a nasal after silence or a fricative.**
  All ten words over 100 ms begin with one — "Axe!", "One", "all", "Mmm" —
  three of them the word *axe*. There is no crisp acoustic edge to find there,
  so the disagreement is with edge-tts's guess, not an error.
- **The bigger model is not worth it.** `MMS_FA` (1.2 GB) lands within a few
  milliseconds of `WAV2VEC2_ASR_BASE_960H` (360 MB) and costs about three
  times the wall clock. Alignment runs at roughly 10× realtime on CPU either
  way: 0.24 s per line, plus one ~1 s model load per batch.
- **edge-tts pauses about 0.94 s at a full stop and 0.32 s at a comma**, which
  is what makes cutting a batch recording into per-line clips easy — the cut
  goes at the quietest point between the last word of one line and the first
  of the next. Both pause sizes were tested; every join landed inside the real
  gap. A CTC span's own confidence score reliably flags the words that follow
  a pause, which are the only ones that wander.
- **A word with no crisp onset swallows the pause in front of it, and that
  collapses the cut window.** Measured 2026-08-15 on the first simulated
  batches: 2 of 14 joins came back with the next line's first word starting at
  the exact instant the previous line's last word ended, with a full second of
  silence in between — "The" (score 0.40) and "go!" (0.20), both flagged by
  the confidence score that already exists. Searching *between* the two spans
  therefore finds nothing and the cut lands hard against a consonant. The fix
  in `align/ingest.py` is to search the whole neighbourhood of the join —
  start of the last word before, end of the first word after — for the longest
  run of silence, since silence is never inside speech, and then to clamp the
  two spans the run contradicts. That correction is also what keeps the
  highlight off a word that is not being said yet.

## Firefly ingest (measured 2026-08-15, on simulated batches)

Matt has recorded no real Firefly batch yet. Everything here was measured with
edge-tts standing in — one continuous utterance per batch, saved as a 44.1 kHz
WAV — so the numbers about *our* pipeline hold and the numbers about *Firefly*
do not exist.

- **libsndfile 1.2.2 writes MP3, and Chromium decodes what it writes.** This
  machine has no ffmpeg and that was the open question; `soundfile` with
  `format="MP3", subtype="MPEG_LAYER_III"` is the whole encoder. Verified by
  `voice:inspect`, which decodes every clip in Chromium.
- **edge-tts writes 24 kHz mono mp3, ~18 KB a line.** Ingested clips are
  written to match, at 21 KB a line over 16 clips; all 75 lines recorded would
  be about 1.6 MB in the repo.
- **The loudness target is -19 dBFS**, measured as RMS over the frames that are
  not silence — not whole-clip RMS, which makes a line with a pause in it
  measure quiet and then get boosted until one word shouts. The 75 edge-tts
  clips run -21.2 to -16.5 with a median of -19.2, so the target leaves the
  existing voice where it is. Peak is held under -1 dBFS.
- **Forced alignment plus a trim beats edge-tts's own first-word boundary.**
  `voice:inspect` reports the lag between a word's reported start and the audio
  actually getting loud: the ingested clips run 0.000-0.002 s on the first word,
  the edge-tts ones about 0.10 s, because edge-tts reports the first boundary at
  the top of a clip that opens with silence.
- **Alignment costs about 0.15 s per second of audio on CPU**, plus a ~1.5 s
  model load per batch: a 37 s batch of twelve lines aligned in 5.7 s.

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
- **A picture nobody placed is a picture nothing can draw.** A map file lists the
  rectangles it uses so the scene can queue exactly those textures, so anything
  the *game* puts down at runtime has to be registered anyway: the generator
  works the felled-tree stump out for itself, and a quest's furniture is named by
  the layout — see `images` on a ZoneLayout, which is how `outside` carries
  `oakSmall` and `smallStump` without planting one.
- **The Mystic Woods has exactly three road-free 5×5 placements and they are all
  the same clearing** (top-left 12–14, 26). The bunny pen is the middle one. The
  wood is 85% open ground and 151 of its 654 interior cells are road, which is
  the constraint — not density.
- `npm run typecheck` is two projects: `tsconfig.json` (src) and
  `tsconfig.tools.json` (tools + content). `npm run build` runs it first.

## Tests

- **Headless Chromium draws this game in software at roughly fifteen frames a
  second.** The suite is latency-bound, not throughput-bound: `workers: 1` is
  measured, not cautious — two workers dropped a walking test, four turned
  ten-second tests into five-minute timeouts.
- **A phase ends with its next instruction spoken a beat later**, so
  `waitForQuiet` alone can pass in the gap *before* it starts and whatever the
  test does next gets talked over a second afterwards. Barks are dropped rather
  than queued while a real line is in the air, so for anything asserting a bark
  the wait has to be "that line was said, and then quiet" — `afterInstruction`
  in `quest.spec`.
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
