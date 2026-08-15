# Book pictures

They live in the **side-load**, beside the art pack and not in this repo, in
Matt's own format (Matt, 2026-08-15). One folder per book, named for the book's
`id` in `index.ts`, and one PNG per page inside it:

```
C:\Code\seraphinas-assets\stories\<book_id>\page<N>.png      N counting from 1
C:\Code\seraphinas-assets\stories\pip_moon\page1.png         ...so book #1 is these four
C:\Code\seraphinas-assets\stories\pip_moon\page2.png
C:\Code\seraphinas-assets\stories\pip_moon\page3.png
C:\Code\seraphinas-assets\stories\pip_moon\page4.png
```

(`SERAPHINA_ASSETS` overrides the root, exactly as it does for the pack.)

`npm run assets:sync` — a `predev` and `prebuild` step — mirrors `stories/` into
the gitignored `public/assets/stories/`, and the game fetches
`/assets/stories/pip_moon/page1.png`. The exact paths are written down once, in
each page's `image` field in `index.ts`. Nothing under `src/` names a file.

**Book ids use underscores**, because the id *is* the folder name and it matches
the voice line ids (`book_pip_moon_1`) sitting next to it.

## A book with no art yet

Nothing fails. Two things happen instead:

- The reader draws a placeholder card in place of the picture — a pastel shape
  on paper with one dot along the bottom per page. Real art appearing at the
  path is the whole of the swap; no code changes.
- `npm run assets:sync` (or `npm run books:placeholders` on its own) creates the
  folder and writes a placeholder PNG for every page that has none, so adding
  book #2 to `index.ts` and starting the game hands Matt a directory to paint
  into. **Existing files are never touched.**

Any size works: the picture is scaled to fit the left-hand page, which is drawn
376 x 440 design pixels — so roughly square, and around 512 px square is the
comfortable shape. That is the size the placeholders are written at.

`public/books/` no longer exists; that was the contract before the side-load
gained a `stories/` folder.
