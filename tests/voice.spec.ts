import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { bootGame, readHooks, shot, waitForVoice, walkToStone, type Hooks } from './harness';

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

/** The line the stone speaks; see STONE_LINE in RoomScene. */
const STONE_LINE = 'seraphina_secret';

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

test('the stone speaks, and the right word is lit halfway through', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);
  await waitForVoice(page);

  expect((await readHooks(page)).voice.lineId, 'nothing is being said yet').toBeNull();

  await walkToStone(page);
  await page.keyboard.press('KeyZ');

  const speaking = await readHooks(page);
  expect(speaking.voice.lineId, 'pressing Z should start the line').toBe(STONE_LINE);

  const line = manifest.lines.find((l) => l.id === STONE_LINE)!;
  expect(speaking.voice.words, 'the bubble shows every word of the line').toEqual(
    line.words.map((w) => w.word),
  );

  // Aim at the middle of the middle word. Real-time playback cannot be trusted
  // to still be on it by the time an assertion crosses the wire, so freeze the
  // line's clock there instead.
  const target = Math.floor(line.words.length / 2);
  const word = line.words[target]!;
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

  await canvas.screenshot({ path: shot('07-speech-bubble.png') });

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('left alone, the highlight advances on the audio clock', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  await page.evaluate(
    (id) => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.say(id),
    STONE_LINE,
  );

  const line = manifest.lines.find((l) => l.id === STONE_LINE)!;
  // Deliberately loose: this guards that playback drives the highlight at all,
  // which the scrubbing tests cannot see. Exactly which word is lit after a
  // wall-clock wait is not something a test should be asked to promise.
  const wait = 1.5;
  await page.waitForTimeout(wait * 1000);

  const { voice } = await readHooks(page);
  expect(voice.lineId, 'still on the line').toBe(STONE_LINE);
  const expected = line.words.findIndex((w) => wait >= w.start && wait < w.end);
  expect(voice.highlighted, `about word ${expected} after ${wait}s`).toBeGreaterThan(1);
  expect(voice.highlighted).toBeLessThan(line.words.length);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the highlight walks the whole line, one word at a time', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  await page.evaluate(
    (id) => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.say(id),
    STONE_LINE,
  );

  const line = manifest.lines.find((l) => l.id === STONE_LINE)!;
  const seen: number[] = [];

  for (const [index, word] of line.words.entries()) {
    if (word.end <= word.start) continue;
    const highlighted = await page.evaluate((t) => {
      const hooks = (window as unknown as { __seraphina: Hooks }).__seraphina;
      hooks.voice.scrub(t);
      return hooks.voice.highlighted;
    }, (word.start + word.end) / 2);
    seen.push(highlighted);
    expect(highlighted, `at the middle of "${word.word}"`).toBe(index);
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
