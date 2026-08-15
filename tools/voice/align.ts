/**
 * Turning provider word timings into timings for the text on screen.
 *
 * The provider times what it *said*: bare words, no punctuation, no em dashes.
 * The game highlights what is *shown*: "Sparky!" including the bang, because a
 * word that loses its punctuation when it lights up looks broken. This module
 * is the join between the two, and it is deliberately strict — a silent
 * misalignment means a four-year-old watches the wrong word light up, which is
 * worse than a failed build.
 */

import type { TimedWord } from './types.js';

/** Tokens are whitespace-separated; that keeps `words.join(' ') === text`. */
export function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** A token the provider will have spoken — anything with a letter or digit in it. */
export function isSpeakable(token: string): boolean {
  return /[\p{L}\p{N}]/u.test(token);
}

/** For comparing "Sparky!" against the provider's "Sparky". */
function normalize(token: string): string {
  return token
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, '');
}

export class AlignmentError extends Error {}

/**
 * @param text   what is displayed
 * @param spoken provider tokens, in spoken order
 * @param loose  skip the word-for-word check, for lines whose `say` text
 *               intentionally differs from what is shown
 */
export function align(text: string, spoken: TimedWord[], loose = false): TimedWord[] {
  const tokens = tokenize(text);
  const speakable = tokens.filter(isSpeakable);

  if (speakable.length !== spoken.length) {
    throw new AlignmentError(
      `expected ${speakable.length} spoken words for ${JSON.stringify(text)}, ` +
        `provider timed ${spoken.length}: [${spoken.map((w) => w.word).join(' ')}]`,
    );
  }

  const out: TimedWord[] = [];
  let cursor = 0;
  let lastEnd = 0;

  for (const token of tokens) {
    if (!isSpeakable(token)) {
      // Punctuation-only, e.g. an em dash. Zero-length window, so [start, end)
      // is empty and it never highlights — it just holds its place in the text.
      out.push({ word: token, start: lastEnd, end: lastEnd });
      continue;
    }

    const timed = spoken[cursor++]!;
    if (!loose && normalize(token) !== normalize(timed.word)) {
      throw new AlignmentError(
        `word ${cursor} of ${JSON.stringify(text)} is ${JSON.stringify(token)} ` +
          `but the provider said ${JSON.stringify(timed.word)} — ` +
          `if that is intended, author the line with a separate "say" field`,
      );
    }

    out.push({ word: token, start: timed.start, end: Math.max(timed.end, timed.start) });
    lastEnd = timed.end;
  }

  return out;
}
