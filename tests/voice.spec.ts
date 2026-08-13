import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { bootGame, readHooks, standByProp, waitForVoice, type Hooks } from './harness';

interface ManifestLine {
  id: string;
  speaker: string;
  text: string;
  audio: string;
  words: { word: string; start: number; end: number }[];
  duration: number;
}

const authored = JSON.parse(
  readFileSync(path.join('content', 'voice', 'lines.json'), 'utf8'),
) as { id: string; speaker: string; text: string }[];

const manifest = JSON.parse(
  readFileSync(path.join('public', 'voice', 'manifest.json'), 'utf8'),
) as { version: number; provider: string; lines: ManifestLine[] };

/** The line the yard's star speaks; see the `star` prop in world/rooms.ts. */
const STONE_LINE = 'seraphina_secret';

/**
 * The prop this test pokes, and what it says. The vector star retired with the
 * tile world; the well is what stands near her front door now.
 */
const POKED_PROP = 'well';
const POKED_LINE = 'seraphina_well';

test('the manifest has a timed word for every word that will be shown', () => {
  expect(manifest.lines.length, 'a manifest entry per authored line').toBe(authored.length);

  for (const line of authored) {
    const entry = manifest.lines.find((l) => l.id === line.id);
    expect(entry, `manifest is missing "${line.id}"`).toBeDefined();

    const expected = line.text.trim().split(/\s+/);
    expect(entry!.words.map((w) => w.word), `word list for "${line.id}"`).toEqual(expected);

    // The game rebuilds the line from the words, so this has to round-trip.
    expect(entry!.words.map((w) => w.word).join(' ')).toBe(entry!.text);

    // Timings must run forwards, or the highlight jumps backwards mid-line.
    let previous = 0;
    for (const word of entry!.words) {
      expect(word.start, `${line.id} "${word.word}" starts after the last word`).toBeGreaterThanOrEqual(previous);
      expect(word.end).toBeGreaterThanOrEqual(word.start);
      previous = word.start;
    }

    // Every speakable word gets real time; only bare punctuation may be empty.
    for (const word of entry!.words) {
      if (/[\p{L}\p{N}]/u.test(word.word)) {
        expect(word.end, `${line.id} "${word.word}" has a duration`).toBeGreaterThan(word.start);
      }
    }
  }
});

/**
 * The highlight, from all three angles, in one boot.
 *
 * They were three tests: a poked prop lights the right word, the highlight moves
 * on its own, and it visits every word in turn. The middle one is the only claim
 * the other two cannot make — scrubbing proves the mapping from time to word,
 * not that anything is driving the clock — so all three are still asserted. The
 * two extra page loads are what has gone.
 */
test('a spoken line lights one word at a time, and the audio clock drives it', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  expect((await readHooks(page)).voice.lineId, 'nothing is being said yet').toBeNull();

  // Stood by rather than walked to: this is about which word is lit, and
  // `world.spec` already walks up to this same well on foot and presses it.
  await standByProp(page, POKED_PROP);
  await page.keyboard.press('KeyZ');

  const speaking = await readHooks(page);
  expect(speaking.voice.lineId, 'pressing Z should start the line').toBe(POKED_LINE);

  const poked = manifest.lines.find((l) => l.id === POKED_LINE)!;
  expect(speaking.voice.words, 'the bubble shows every word of the line').toEqual(
    poked.words.map((w) => w.word),
  );

  // Aim at the middle of the middle word. Real-time playback cannot be trusted
  // to still be on it by the time an assertion crosses the wire, so freeze the
  // line's clock there instead.
  const target = Math.floor(poked.words.length / 2);
  const word = poked.words[target]!;
  const middle = (word.start + word.end) / 2;

  await page.evaluate(
    (t) => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.scrub(t),
    middle,
  );

  const lit = await readHooks(page);
  expect(lit.voice.highlighted, `word ${target} ("${word.word}") should be lit at ${middle}s`).toBe(
    target,
  );
  expect(lit.voice.words[lit.voice.highlighted]).toBe(word.word);

  // Left alone, the highlight advances on the audio clock. Deliberately loose:
  // this guards that playback drives the highlight at all, which the scrubbing
  // cannot see. Exactly which word is lit after a wall-clock wait is not
  // something a test should be asked to promise.
  await page.evaluate(
    (id) => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.say(id),
    STONE_LINE,
  );
  const line = manifest.lines.find((l) => l.id === STONE_LINE)!;
  const wait = 1.5;
  await page.waitForTimeout(wait * 1000);

  const running = await readHooks(page);
  expect(running.voice.lineId, 'still on the line').toBe(STONE_LINE);
  expect(running.voice.highlighted, `some way into it after ${wait}s`).toBeGreaterThan(1);
  expect(running.voice.highlighted).toBeLessThan(line.words.length);

  // And every word of it gets its own turn, in order.
  const seen: number[] = [];
  for (const [index, entry] of line.words.entries()) {
    if (entry.end <= entry.start) continue;
    const highlighted = await page.evaluate((t) => {
      const hooks = (window as unknown as { __seraphina: Hooks }).__seraphina;
      hooks.voice.scrub(t);
      return hooks.voice.highlighted;
    }, (entry.start + entry.end) / 2);
    seen.push(highlighted);
    expect(highlighted, `at the middle of "${entry.word}"`).toBe(index);
  }

  expect(seen.length, 'every timed word got its turn').toBe(
    line.words.filter((w) => w.end > w.start).length,
  );

  // Before the first word there is nothing to light up.
  const before = await page.evaluate(() => {
    const hooks = (window as unknown as { __seraphina: Hooks }).__seraphina;
    hooks.voice.scrub(0);
    return hooks.voice.highlighted;
  });
  expect(before, 'the line starts with no word lit').toBe(-1);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
