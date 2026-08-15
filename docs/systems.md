# Systems

Where each subsystem lives. One section per thing, entry points first. Read the
file's own header comment for the reasoning — this page is only a map.

Written 2026-08-13, from the code.

## Session store — what the game remembers while the page is open

`src/state/session.ts` — one `SessionState`, exported as `session`.

Three halves, split by what they are *about*:

| Half | Holds | Cleared by |
| --- | --- | --- |
| `run` | the quest, the quests already finished today, items in hand, tools a quest lent her, whether the faeries are out, which bunny is following her | a night |
| `world` | per-zone deltas — which trees are felled, keyed by zone id | a night |
| `persistent` | coins (`COIN_SLOTS` = 3) | only `reset()` |

Nothing here touches disk and nothing is planned to. A page reload is a fresh
morning. `snapshot()` hands out a deep copy — that is what `hooks.session()`
returns. The seam between "cleared by a night" and "kept" is
`resetForSleep()` vs `reset()`.

## Quest engine

`src/quest/QuestEngine.ts` (rules, no Phaser), `src/quest/Quest.ts` (types),
`src/quest/quests.ts` (the table — `faerie`, `bunny` and `story`).

One quest at a time; there is no quest log. **Three quests, three givers, three
thought bubbles** — Sneak the faeries, Dad the bunnies, Hazel the story, one job
each (Matt, 2026-08-15). `offerFrom` still *searches* for the first of a
person's quests she has not done today, so a second job for somebody is a row in
the table and no code; nobody has one, so it never serialises. Accepting
anything takes every bubble off the sky. **Finishing one puts the others back**, that instant and
wherever she is standing: the day refuses only what she has already done, which
is `run.completed` on the store and is written by `advance` when a quest parks
(Matt, 2026-08-13). Anything a finished quest left in the world — the ring, the
bunnies at the den — outlives her taking the next job; see `inPlay`.
A quest is phases with a `goal` of kind `fetch` /
`collect` / `travel` / `ritual` / `fell` / `gather` / `lure` / `book` / `park`.
`park` is the goal that cannot finish, which is what `finished` reads. Progress
lives in the store, so walking through a doorway rebuilds the picture and never
the progress. The engine also owns the *offer* counter (`nextOfferLine`,
`forgetOffers`) and `gather`, which moves NPCs into a zone for named phases —
applied at the next zone build, or immediately by `RoomScene.moveGuestsIn` when
the job is taken in the same field it happens in. That method also sends a guest
*away* from the zone she is standing in, which is how the story takes Hazel off
the grass and puts her indoors on the press that takes it.

Quest furniture (where a stone stands, where the bunny pen goes) is in
`quests.ts`, deliberately not in `content/world/` — so `world:build`'s
reachability gate never sees it, and `tests/quest.spec.ts` stands in for that
gate over the same collision grid. A zone that a quest may *draw* into still has
to carry the pictures: see `images` on a ZoneLayout.

## Bunnies

`src/world/Bunny.ts` — three of them, off the grid entirely: no collision, no
tile, no route, the faeries' rule. What each one is doing (`penned` / `loose` /
`following` / `home`) is worked out from the quest on every zone build rather
than stored; the store holds one string, which bunny is at her heels. **The art
is a frog** and that file is the only one that knows — see `engineering.md`.

## Sleep

`src/state/sleep.ts` — `nightPasses()` is the whole answer to "what does sleeping
reset": the store, the tool belt, the offer counters, the day clock. Coins are
the one exclusion and it lives in `SessionState.resetForSleep`.

The sequence is `RoomScene.goToSleep` (bed, two presses). Ordering matters: the
recap reads a store snapshot *before* the night clears it.

## Day clock

`src/state/dayClock.ts` — one number, milliseconds since she last woke.
`warp(ms)` is the test hook's. It drives ambience and gates nothing (Matt,
2026-08-13); the day never ends on its own.

## Dusk

`src/world/dusk.ts` — a screen-space blue sheet plus fireflies. Lamps and torches
coming on are `TileWorld.setDusk`, keyed off a `glow` flag on a catalog image.
Only zones in `OUTDOOR_ZONES` (`src/world/zones.ts`) have an evening.

## Nightfall

`src/world/nightfall.ts` — `playNightfall()` and `playSunrise()`, drawn in screen
space above the HUD (a camera fade would paint over the stars). No letters
anywhere in it; sleep is drawn as motes, not a Z.

## Recap

`src/state/recap.ts` — `snapshotDay()` then `recapFor(snapshot)`. A list of
predicate/line pairs over the store: no numbers, because every word is pre-cut
audio. Reported to tests as `hooks.recap`. At most two events plus goodnight;
the order is faeries, bunnies, **story**, errand, stones, trees — the three
finished-job lines first, biggest first.

## Voice

Content-time, never at runtime:

- Authored: `content/voice/lines.json` (id, speaker, `text`, optional `say`,
  `rate`, `note`) and `content/voice/voices.json` (speaker → provider voice).
- Built: `npm run voice:build` → `tools/voice/build.ts` → `providers/edgeTts.ts`.
  Incremental by fingerprint; `--force` redoes everything.
- Output: `public/voice/manifest.json` plus mp3s. **The game may only read the
  manifest** — no file under `src/` may know the provider exists.
- Runtime: `src/voice/VoiceBank.ts` loads it; `src/ui/WordRibbon.ts` is the
  highlight itself — one Text per word, a slab behind the live one — and
  `src/ui/SpeechBubble.ts` is the balloon drawn round it. The book reader uses
  the same ribbon at storybook size, which is the only reason there is one.
- Per-line prosody: a `rate` on a line in `lines.json` **replaces** the speaker's
  rather than compounding with it. The four `book_pip_moon_*` pages are the only
  lines that use it, at `-22%` against her usual `-8%`.
- Checking: `npm run voice:inspect` compares word boundaries against the real
  waveform and reports phonics shape, without anybody listening.

`src/voice/barks.ts` — the low kind of speech: one word, her own voice, dropped
rather than queued. Naming barks are derived from ids (`ruby` → `seraphina_ruby`),
so a new stone is a line in `lines.json` and nothing else.

## The book reader

`src/ui/BookReader.ts` — the takeover: a two-page spread, a picture on the left,
one sentence on the right reading itself with the word being spoken lit up. The
spread is one measured rectangle of the UI pack's `Book_UI.png`
(`BOOK_SPREAD` in `src/ui/toolIcons.ts`); the highlight is `WordRibbon`, shared
with the balloon.

The books are authored data: `content/books/index.ts`, read by the game directly
because there is nothing to generate. Adding book #2 is an entry in `BOOKS`.
Page pictures are site-root-relative paths under `public/books/<id>/pageN.png`
and **may be missing** — the reader draws a placeholder card instead, so
dropping the real PNGs in needs no code change. See `public/books/README.md`.

While it is open `RoomScene.update` asks the world nothing: no walking, no
doorways, no dot. The day clock keeps running. Green is ignored mid-sentence and
turns the page after; yellow re-reads; red closes, and reopening resumes at the
same page because the pages are the phase's progress keys in the store. The HUD
rows are hidden by `showHud` rather than drawn over.

## Trees

`src/world/Tree.ts` — shake, fall, stump, gone. Two sizes, `BIG_TREE` and
`TINY_TREE`, and a `TreeStyle` is the whole difference between them: blows to
fell, blows to clear, which stump is left, and how much mess it makes. One code
path for both. The wood's come out of the map file; the bunny pen's are
synthesised by `RoomScene.buildPen` and are otherwise identical.

## Footings and collision

`tools/world/footing.ts` is the one rule: a prop's solid cells sit centred under
the part of it that touches the ground, in whole tiles, with a half-tile nudge
allowed on the sprite. `tools/world/catalog.ts` is every measured rectangle and
its `blocks`. `npm run world:footings` checks each catalog hitbox against the
pixels; holding **B** in game draws the same thing (`src/world/DebugHitboxes.ts`).

Movement: `RoomScene` substeps at `MAX_STEP = TILE_SIZE / 4` (16 px), one axis at
a time, so a wall taken diagonally slides rather than sticks.

## Interior rooms

`content/world/house/` — `shell.ts` is the floor plan (four rooms, one storey);
`kitchen/living-room/bedroom/playroom.ts` are furniture lists; `index.ts`
composes them. A room is written as the *floor*; the generator raises the walls.
Passages between rooms are `openings` and are walked through with no transition;
`src/world/Doorway.ts` handles the ones that change zone.

The cave is `content/world/cave/index.ts`. Zones are listed in
`src/world/zones.ts` — adding one is a layout, a `world:build`, and a name.

## Build gates

`npm run world:build` (`tools/world/build.ts`) refuses to write a world that
fails any of:

- every spawn, landmark, npc, doorway and prop reachable by flood fill from the
  spawn (`assertReachable`);
- the boundary sealed, checked three ways — with everything solid, with only what
  is *drawn*, and with only what is drawn *and every choppable tree felled*
  (`sealed`, plus `sealed.soft` for cells declared soft by name);
- every catalog rectangle inside its PNG, every tileset a whole number of tiles.

`--check` runs all of it and writes nothing. `npm run build` runs `typecheck`
first.

## Test harness and hooks

`src/testHooks.ts` — the only surface Playwright may touch, `window.__seraphina`.
`tests/harness.ts` mirrors its type and adds the steering (`standByProp`,
`standByRock`, `standNear`, `walkThroughDoorway`, `standAt`, `warpDay`,
`waitForVoice`, `waitForQuiet`).

`?fastBoot=1` skips the title screen's spoken greeting; the press itself still
happens, because that is what unlocks audio.

Two suites — see CLAUDE.md, "The two test suites". `npm test` is the fast one and
must be green before a commit; `npm run test:slow` is the picture tours and the
long walk.

## HUD

`src/ui/ButtonDot.ts` is the single source for every button prompt: a coloured
dot, never a letter. Three rows, bottom-left, all `setScrollFactor(0)`:

| Row | File | What |
| --- | --- | --- |
| tools | `ui/ToolRow.ts` | four boxes, the held one lit; blue dot cycles |
| quest | `ui/QuestRow.ts` | what this phase wants; yellow dot repeats the job |
| coins | `ui/CoinRow.ts` | three boxes, always on screen, no button |

`src/ui/toolIcons.ts` holds every 16-px icon rectangle the HUD draws from — the
game's side of the fence, mirroring `tools/world/catalog.ts`.
