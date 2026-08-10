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
