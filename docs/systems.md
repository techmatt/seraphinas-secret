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
thought bubbles** — Sneak the faeries, Dad the bunnies, Morgana the story, one job
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
*away* from the zone she is standing in, which is how the story takes Morgana off
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
anywhere in it; sleep is drawn as motes, not a Z. `playSunrise` takes an
`onMorning` callback, fired once the last of the light is off the screen:
`RoomScene.arrive` hangs `seraphina_morning` on it, which is `seraphina_goodnight`'s
bookend and the only line tied to waking.

## Recap

`src/state/recap.ts` — `snapshotDay()` then `recapFor(snapshot)`. A list of
predicate/line pairs over the store: no numbers, because every word is pre-cut
audio. Reported to tests as `hooks.recap`. At most two events plus goodnight;
the order is faeries, bunnies, **story**, errand, stones, trees — the three
finished-job lines first, biggest first.

## Voice

Content-time, never at runtime:

- Authored: `content/voice/lines.json` (id, speaker, `text`, optional `say`,
  `rate`, `note`), `content/voice/voices.json` (speaker → edge-tts voice) and
  `content/voice/profiles.json` (speaker → *Firefly* voice and UI settings,
  plus the `storybook` profile the book pages are recorded under).
- Built: `npm run voice:build` → `tools/voice/build.ts`. Every line resolves
  one of two ways — an ingested Firefly clip whose stored spoken text still
  matches, or edge-tts synthesised on the spot. Incremental by fingerprint;
  `--force` redoes everything, `--no-clips` ignores the recordings.
- Output: `public/voice/manifest.json` plus mp3s. **The game may only read the
  manifest** — no file under `src/` may know the provider exists, and the
  manifest does not say which of the two filled a line in.
- Also output: `public/voice/debug.json`, a sidecar built by
  `tools/voice/debugSidecar.ts` that says exactly what the manifest may not —
  provider, batch, flags, and the doubted words' indices. Read by the sound
  debug view and nothing else. Delete it and the game is unchanged.
- Runtime: `src/voice/VoiceBank.ts` loads it; `src/ui/WordRibbon.ts` is the
  highlight itself — one Text per word, a slab behind the live one — and
  `src/ui/SpeechBubble.ts` is the balloon drawn round it. The book reader uses
  the same ribbon at storybook size, which is the only reason there is one.
- Per-line prosody: a `rate` on a line in `lines.json` **replaces** the speaker's
  rather than compounding with it. The four `book_pip_moon_*` pages are the only
  lines that use it, at `-22%` against her usual `-8%`.
- Checking: `npm run voice:inspect` compares word boundaries against the real
  waveform and reports phonics shape, without anybody listening.
- Timings without a provider that gives them: `tools/voice/align/` — a Python
  forced aligner (torchaudio CTC) that recovers word spans from the audio and
  the text alone, plus the cutter and `ingest.py`. See its README.

### Firefly: the manual recording loop

Adobe Firefly has no API, so a batch of lines is recorded by hand and the
machinery lives either side of the paste. `tools/voice/firefly.ts` is the
vocabulary all of it shares — profiles, the spoken-text hash, the clip store.

| Command | What |
| --- | --- |
| `npm run voice:batch` | Cuts paste-ready batch files into `voice-batches/`: a `.txt` of nothing but spoken text, and a `.json` sidecar of line ids in order. Coverage-first by default; `--stale`, `--ids`, `--speaker`, `--profile`. Never mixes two speakers or two profiles. |
| `npm run voice:ingest` | Takes `voice-batches/<batch>.wav` apart into one committed clip per line under `content/voice/clips/`, with provenance in `index.json`. |
| `npm run voice:status` | Coverage, stale lines, and the words the aligner was unsure of. Reads only `content/`. |
| `npm run voice:simulate` | Stands in for Matt: speaks a batch as one continuous edge-tts utterance and drops the WAV in as if it were a download. |
| `npm run voice:audit` | Every voiced line as one CSV on the drive — id, speaker, profile, *where it plays*, shown text, spoken text, length. For reading the script before committing it to a recording. |

`voice-batches/README.md` is Matt's copy of the loop and is the only file in
that folder that is committed — the batch text, the sidecar and the download
are inputs, and the clips are what gets kept.

**The hash is the only guard.** `spokenFor(line)` is what the batch file says
and what is stored beside the clip; `voice:build` compares the two and falls
back to edge-tts, loudly, on any mismatch. Alignment is never asked whether a
clip matches its line, because it answers wrongly and confidently.

**Latest ingest wins.** The clip store is keyed by line id, so re-recording one
line as a batch of one overwrites it. That is the patch mechanism.

`src/voice/barks.ts` — the low kind of speech: one word, her own voice, dropped
rather than queued. Naming barks are derived from ids (`ruby` → `seraphina_ruby`),
so a new stone is a line in `lines.json` and nothing else.

### The sound debug view

`src/debug/SoundDebugScene.ts` — the review surface for the ingest loop, opened
with the **V** key from any room and left with escape, red or the pad's B. It is
dev-only *because* the way in is a keyboard key: the pad is the game's input, so
Julia has no sequence of presses that arrives here.

Every manifest line in a list, with the coverage summary `voice:status` prints
along the top; filters over speaker/profile, provider, flag and batch (`1`–`4`,
`0` clears), which is what makes "review just what batch N ingested" one press.
Selecting and pressing enter plays the line through a **real `SpeechBubble` and
`WordRibbon`** — the point is auditing the highlight the game will draw, not the
audio — with the words the aligner doubted underlined in red
(`WordRibbon.markWords`, which nothing in the game calls).

`M` appends the selected id and the time to `scratch/voice-review.json` via a
dev-server route in `vite.config.ts`. Gitignored, append-only, and how a
listening session's verdicts reach the next prompt.

Its data is `public/voice/debug.json`, reached through `src/debug/voiceDebug.ts`
— **the one file under `src/` that knows a provider exists**, quarantined there
on purpose.

## The book reader

`src/ui/BookReader.ts` — the takeover: a two-page spread, a picture on the left,
one sentence on the right reading itself with the word being spoken lit up. The
spread is one measured rectangle of the UI pack's `Book_UI.png`
(`BOOK_SPREAD` in `src/ui/toolIcons.ts`); the highlight is `WordRibbon`, shared
with the balloon.

The books are authored data: `content/books/index.ts`, read by the game directly
because there is nothing to generate. Adding book #2 is an entry in `BOOKS`.

Page pictures come out of the **side-load**, in Matt's own format (Matt,
2026-08-15): `<pack>/stories/<book_id>/pageN.png`, mirrored to
`public/assets/stories/` by `assets:sync` as an *optional* category, and named in
each page's `image` field. So book ids use underscores — the id is a folder name.
A picture **may be missing**: the reader draws a placeholder card, and
`assets:sync` (or `npm run books:placeholders`) writes a stand-in PNG into the
side-load for every undrawn page, never overwriting one. `hooks.book.picture`
says which of the two the left page drew. See `content/books/README.md`.

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
