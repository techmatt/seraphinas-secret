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

## The world

The map is generated, not hand-placed. It goes:

```
content/world/layout.ts     what the world is: regions, roads, "the shed goes there"
        │  npm run world:build
        ▼
public/world/*.json         tile indices, collision, sprites, doorways, props
        │  fetched at runtime
        ▼
src/world/TileWorld.ts      a culled tile layer, y-sorted sprites, a collision bitmap
```

`tools/world/catalog.ts` is the only place that knows which rectangle of which
pack PNG a tree or a wardrobe is. `content/world/layout.ts` names those keys and
never a tile index, so moving a building is an edit there and a rebuild — never
a hand-placed tile.

The generated JSON **is** committed; the pack pixels it was measured from are
not. Re-run `npm run world:build` after editing the layout or the catalog. The
build refuses to write a map whose spawns, doorways, props or landmarks cannot
be walked to, so a wall across the only path to the wood fails the build rather
than the play.

Coordinates in the map files are in **pack pixels** (16 to a tile). `WORLD_SCALE`
in `src/config.ts` is the one number that turns those into screen pixels, and it
scales the tiles, the buildings and Seraphina together.
