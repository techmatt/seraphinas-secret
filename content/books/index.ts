/**
 * The books she can be read, as authored data.
 *
 * A book is four things and none of them is code: the sentences, the voice line
 * that reads each one, the picture that goes beside it, and what Hazel says as
 * the page turns. Adding book #2 is another entry in `BOOKS` — no new file under
 * `src/`, no new branch in the reader.
 *
 * **Authored source, like `content/voice/` and `content/world/`** — but read by
 * the game directly rather than through a generator, because there is nothing to
 * generate: a sentence is already the thing the reader draws, and a build step
 * whose output was its input would only be a second copy to fall out of date.
 * The voice ids below are cut by `npm run voice:build` from
 * `content/voice/lines.json`, which is where the words are actually spoken.
 *
 * **Pictures are site-root-relative and may be missing.** `books/pip-moon/page1.png`
 * is `public/books/pip-moon/page1.png` on disk and `/books/pip-moon/page1.png` in
 * the browser — the same arrangement the voice manifest's `audio` field has. The
 * files are not in the repo yet: until they are, the reader draws a soft
 * placeholder card in their place, and dropping the real PNGs in at these exact
 * paths is the whole of the swap. Nothing under `src/` changes. They are not
 * pack art — they are Matt's own, so they may be committed, and they
 * deliberately do **not** live under `public/assets/`, which is the gitignored
 * mirror `npm run assets:sync` rebuilds and would wipe them.
 */

/** One page: a picture, a sentence, and the two voices either side of it. */
export interface BookPage {
  /**
   * What is shown on the right-hand page, verbatim.
   *
   * Kept here as well as in `lines.json` so a page can be drawn at all when the
   * voice manifest never arrived — the game plays on mute rather than blank.
   * The two must agree word for word; `voice.spec` checks every authored line
   * against the manifest, and `story.spec` checks these against what the reader
   * actually shows.
   */
  text: string;
  /** The voice line that reads it. Seraphina's, slowed to a storybook pace. */
  line: string;
  /** The left-hand page's picture, relative to the site root. May not exist yet. */
  image: string;
  /**
   * What Hazel says as this page is turned — her own voice, out of her own
   * mouth, before the next page starts reading itself.
   *
   * The last page's is the big one: nothing follows it but the book closing, so
   * it is the line that ends the story rather than one that bridges to a page.
   */
  cheer: string;
}

export interface Book {
  /** Stable key. The quest names it, and the picture folder is called this. */
  id: string;
  /**
   * The book's name. Not drawn anywhere — the spread is a picture and one
   * sentence, and a title on screen would be text with no voice line, which is a
   * bug (CLAUDE.md). It is here because a book without a name is a file.
   */
  title: string;
  pages: BookPage[];
}

/**
 * Book #1. Four pages, one sentence each, canon and Matt-approved.
 *
 * No mid-sentence `.` or `!` anywhere in them, which is not a style choice: a
 * mid-line stop buys about 0.9 s of a lit-up sentence with no word lit — see
 * `docs/engineering.md`. Trailing punctuation is free, so every one of them ends
 * on a bang and none of them has one in the middle.
 */
const PIP_MOON: Book = {
  id: 'pip-moon',
  title: 'Pip Goes to the Moon',
  pages: [
    {
      text: 'Pip the dog zoomed up to the moon!',
      line: 'book_pip_moon_1',
      image: 'books/pip-moon/page1.png',
      cheer: 'hazel_book_moon',
    },
    {
      text: 'On the moon Pip met a baby dragon!',
      line: 'book_pip_moon_2',
      image: 'books/pip-moon/page2.png',
      cheer: 'hazel_book_dragon',
    },
    {
      text: 'The dragon sneezed sparkles all over Pip!',
      line: 'book_pip_moon_3',
      image: 'books/pip-moon/page3.png',
      cheer: 'hazel_book_sparkles',
    },
    {
      text: 'Now Pip and the dragon are best friends!',
      line: 'book_pip_moon_4',
      image: 'books/pip-moon/page4.png',
      cheer: 'hazel_book_best',
    },
  ],
};

export const BOOKS: Book[] = [PIP_MOON];

/** The book a quest named, or null for an id nothing wrote down. */
export function bookById(id: string): Book | null {
  return BOOKS.find((book) => book.id === id) ?? null;
}
