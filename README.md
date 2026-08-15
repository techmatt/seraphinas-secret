# seraphinas-secret

Reading video game.

## Art assets

The game's art is the **Cute Fantasy RPG** pack by **Kenmi** —
<https://kenmi-art.itch.io/cute-fantasy-rpg>.

**The pack is not in this repo.** Its licence allows use in commercial and
non-commercial projects but forbids redistribution, even modified, so it is
side-loaded: buy it, extract it, and put the extracted folders (`Cute_Fantasy`,
`Cute_Fantasy_Characters`, …) in

```
C:\Code\seraphinas-assets
```

or anywhere else, with `SERAPHINA_ASSETS` pointing at it.

`npm run assets:sync` mirrors just the categories the game uses into
`public/assets/`, which is gitignored and disposable. It runs automatically as
`predev` and `prebuild`, so `npm run dev` and `npm run build` both take care of
it. Which categories get copied is the `CATEGORIES` list in
`tools/assets/config.ts`.

If the side-load is missing, the sync stops with a message saying so rather than
letting the game 404 its way to a blank screen.

The side-load also holds **Matt's own book pictures**, which are not pack art:
`stories/<book_id>/page<N>.png`, mirrored by the same command. That folder is
optional on both ends — a book nobody has drawn yet is normal, the reader draws
a placeholder card, and the sync writes a stand-in PNG for Matt to paint over
rather than failing. See `content/books/README.md`.

## The world

The map is generated, not hand-placed. It goes:

```
content/world/                what the world is: regions, roads, "the shed goes there"
   layout.ts                  the composition — one line per zone, nothing else
   outside/                   plan, roads, prefabs, perimeter, woods-edge,
                              village, farm-garden, pond
   house/                     shell, kitchen, living-room, bedroom, playroom
        │  npm run world:build
        ▼
public/world/*.json         tile indices, collision, sprites, doorways, props
        │  fetched at runtime
        ▼
src/world/TileWorld.ts      culled tile layers, y-sorted sprites, a collision bitmap
```

Inside `outside/`, only `plan.ts` is imported by its siblings — it holds the map
size, the region rectangles, the road polylines and where each building stands,
and that is what keeps eight modules from importing each other. Roads are
polylines with a width; the perimeter is a band spec with a gap in it; and
`prefabs.ts` holds the named clusters — pots at a door, a hedge along a wall, a
bench beside a path — so rearranging an area moves calls, not hundreds of
entries. Each region seeds its own scatter, so editing the farm cannot churn the
woods.

Inside `house/`, a room is written as the **floor** she can walk on, and the
generator derives the walls from it: three tiles of wall face at the head of the
room, a dark timber beam capping that, and the same timber down both sides and
along the foot. Wall-hung things — windows, a clock, a pot rack, a picture —
are ordinary placements on the face rows. Rooms that share a wall name floors a
trim's width apart and both paint the same column.

`tools/world/catalog.ts` is the only place that knows which rectangle of which
pack PNG a tree or a wardrobe is, and how many frames follow it across the sheet
if it animates. The layout names those keys and never a tile index, so moving a
building is an edit there and a rebuild — never a hand-placed tile. The pack's
interior sheets are not on one grid and its readmes are license text, so those
rectangles were measured: `npm run world:measure -- <pack-relative.png>` prints
the bounding box of everything actually drawn on a sheet.

A catalog entry also says which part of its picture is **solid**, and that half
is measured too — `npm run world:footings` prints every hitbox against the
pixels it claims to describe, because a hitbox is the one thing in this world
with no picture and nothing on screen can tell you it is in the wrong place.
Those rectangles may name a half tile: the pack centres a tree's trunk on its
own slot, so no whole tile is ever under one, and `tools/world/footing.ts`
nudges the sprite by that half tile when it puts it down. Hold **B** while
playing to see the whole grid — solid cells, each sprite's footprint, and her
own collision box.

Ground is two tile layers. The lower one is terrain — grass, dirt roads, water,
ploughed earth, interior floors and walls. The upper one is for ground variants
and is **empty today**: a tile may only sit beside the base outdoor grass if its
own background is that same green, and none of the pack's other three greens is.
See `OVERLAYS` in the catalog. Anything the pack ships as an animation strip —
water, fire, chests, grass tufts, lilypads, the fountain — is resolved to frames
at build time and played at runtime.

The generated JSON **is** committed; the pack pixels it was measured from are
not. Re-run `npm run world:build` after editing the layout or the catalog. The
build refuses to write a map whose spawns, doorways, props or landmarks cannot
be walked to, or one with something solid standing in a road — so a wall across
the only path to the wood, or a lamp post in the middle of the high street,
fails the build rather than the play.

Doors follow Stardew's convention: you **walk out** of a building and **press
green to walk in**. A `press` doorway becomes an interactable like any prop —
same proximity radius, same green dot — so nothing about it is written twice.

Coordinates in the map files are in **pack pixels** (16 to a tile). `WORLD_SCALE`
in `src/config.ts` is the one number that turns those into screen pixels, and it
scales the tiles, the buildings and Seraphina together.
