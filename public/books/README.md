# Book pictures

One folder per book, named for the book's `id` in `content/books/`, and one PNG
per page inside it:

```
public/books/<book-id>/page<N>.png      N counting from 1
public/books/pip-moon/page1.png         ...so book #1's four pages are these
public/books/pip-moon/page2.png
public/books/pip-moon/page3.png
public/books/pip-moon/page4.png
```

The exact paths are written down once, in each page's `image` field in
`content/books/index.ts`, site-root-relative — the same arrangement the voice
manifest's `audio` field has. Nothing under `src/` names a file.

**Dropping the real pictures in requires no code change.** Until a file is there
the reader draws a placeholder card in its place — a pastel shape on paper, with
one dot along the bottom per page — and the moment it is there, it is the page.
Any size works: the picture is scaled to fit the left-hand page, which is drawn
376 x 440 design pixels, so roughly square and around 512 px square is the
comfortable shape.

These are **not** pack art. They are Matt's own, so unlike everything under
`public/assets/` they may be committed — which is exactly why they live here and
not there: `public/assets/` is the gitignored mirror `npm run assets:sync`
rebuilds, and anything put in it is deleted the next time it runs.
