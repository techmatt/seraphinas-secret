import { test, expect } from '@playwright/test';
import {
  bootGame,
  readHooks,
  standNear,
  tap,
  waitForVoice,
  type Hooks,
  type Snapshot,
} from './harness';

const npc = (hooks: Snapshot, id: string) => {
  const who = hooks.npcs.find((n) => n.id === id);
  if (!who) throw new Error(`no npc ${id} in ${hooks.room}`);
  return who;
};

/**
 * The three things a person in this village is: something you can walk through,
 * something the green button is about, and somebody the balloon belongs to.
 *
 * One boot, because they are three questions about the same two children. The
 * half worth asserting hardest is the *anchor*: a balloon that always appears
 * over the player says nothing about who is talking, and which of the two people
 * on screen the words belong to is the one thing a pre-reader has to get out of
 * a conversation. So she is deliberately stood a tile clear of whoever she is
 * pressing — walking up to somebody with no collision would otherwise put her
 * inside them, where "over him" and "over her" are the same picture and the test
 * would pass whatever the code did.
 *
 * Hazel is the same machinery with a different child in it, which is why she is
 * asserted on at all: a person is data now — a sheet, a spot and a list of lines
 * — so the second one has to work without a line of code of her own. She is also
 * the one who still *cycles*; Sneak has a job to hand out and answers to the
 * quest's rule instead. See `quest.spec` for the offer itself.
 */
test('people can be walked through, pressed, and answer over their own heads', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  // No collision is deliberate: a four-year-old aiming a thumbstick pins herself
  // on anything that stands its ground, and being stuck behind her own sister is
  // a fail state with a friendly face on it.
  const start = await readHooks(page);
  const hazel = npc(start, 'hazel');
  const { tile, cols, blocked } = start.world;
  expect(
    blocked[Math.floor(hazel.y / tile) * cols + Math.floor(hazel.x / tile)],
    'the tile she is standing in is not solid — a person is not a wall',
  ).toBe('0');

  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [hazel.x, hazel.y],
  );
  await page.waitForTimeout(200);
  const inside = await readHooks(page);
  expect(
    Math.hypot(inside.player.x - hazel.x, inside.player.y - hazel.y),
    'she ends up where her sister is, not shoved out of the way',
  ).toBeLessThan(tile);

  // A tile below her, out in the street: near enough for the dot, far enough
  // that the balloon has two different places it could be.
  await standNear(page, 'hazel', { y: 72 });
  expect((await readHooks(page)).promptDot, 'a person asks to be pressed').toBe(true);

  await tap(page, 'KeyZ');
  const her = await readHooks(page);
  expect(her.voice.lineId).toBe(hazel.lines[0]);
  expect(her.voice.bubble.speaker, 'her balloon, over her').toBe('hazel');
  expect(Math.abs(her.voice.bubble.x - hazel.x)).toBeLessThan(40);

  // Pressing green again is the next thing somebody has to say, and it wraps for
  // ever: there is no end to a conversation and nothing in one to get wrong.
  await tap(page, 'KeyZ');
  expect((await readHooks(page)).voice.lineId, 'pressing again says her second line').toBe(
    hazel.lines[1],
  );
  expect(hazel.lines[1], 'which is a different line').not.toBe(hazel.lines[0]);
  await tap(page, 'KeyZ');
  expect((await readHooks(page)).voice.lineId, 'and then it wraps').toBe(hazel.lines[0]);

  // And the boy with the job, whose first line is the offer rather than his own.
  await standNear(page, 'sneak', { y: 72 });
  const before = await readHooks(page);
  const him = npc(before, 'sneak');
  expect(before.promptDot, 'he asks to be pressed the way a chest does').toBe(true);
  expect(
    Math.abs(before.player.y - him.y),
    'and she is standing clear of him, not inside him',
  ).toBeGreaterThan(40);

  await tap(page, 'KeyZ');

  const talking = await readHooks(page);
  expect(talking.voice.lineId, 'he says the first line of the job he is offering').toBe(
    'sneak_quest_offer',
  );
  expect(talking.voice.words.length, 'with words to light up').toBeGreaterThan(0);
  expect(talking.voice.bubble.visible, 'and a balloon to put them in').toBe(true);
  expect(talking.voice.bubble.speaker, 'which is his').toBe('sneak');

  // The claim, in pixels: the balloon is over him and not over her. Both
  // distances are measured because "near Sneak" on its own would also be true
  // of a balloon nailed to the middle of the screen.
  const toHer = Math.hypot(
    talking.voice.bubble.x - talking.player.x,
    talking.voice.bubble.y - talking.player.y,
  );
  expect(Math.abs(talking.voice.bubble.x - him.x), 'the balloon sits over the speaker').toBeLessThan(
    40,
  );
  expect(talking.voice.bubble.y, 'above his head, not through it').toBeLessThan(him.y);
  expect(
    Math.hypot(talking.voice.bubble.x - him.x, talking.voice.bubble.y - him.y),
    'and nearer him than her, which is the whole of the anchor',
  ).toBeLessThan(toHer);

  // He turns to look at whoever is talking to him.
  expect(npc(talking, 'sneak').facing, 'and he turns to face her').toBe('down');

  expect(errors, 'no uncaught page errors').toEqual([]);
});
