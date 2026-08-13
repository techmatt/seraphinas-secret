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
 * — so the second one has to work without a line of code of her own.
 *
 * Both of them have a job to hand out now, so the *cycle* — press again, get the
 * next thing, wrap for ever — is asked of Hazel after Sneak's job has been taken
 * off the board. Which is worth the reordering on its own: taking one quest is
 * what puts the other person back to being an ordinary person, and that is the
 * whole of "one quest at a time" seen from the pavement.
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
  // Her own job, not her own chatter: she has a cloud over her head too, and the
  // first thing a person with one says is what they want. Her lines come back
  // below, once somebody else's job has been taken.
  expect(her.voice.lineId, 'the first line of the job she is offering').toBe('hazel_quest_offer');
  expect(her.voice.bubble.speaker, 'her balloon, over her').toBe('hazel');
  expect(Math.abs(her.voice.bubble.x - hazel.x)).toBeLessThan(40);

  // And the boy with the other job, whose first line is his offer.
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

  // Take his job, which takes hers off the board — one quest at a time, and the
  // person left over goes back to being a person.
  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).quest.id) break;
    await tap(page, 'KeyZ');
  }
  const busy = await readHooks(page);
  expect(busy.quest.id, 'his job is hers now').toBe('faerie');
  expect(busy.quest.offers, 'so neither of them is offering anything').toEqual([]);

  // Pressing green at Hazel is the next thing she has to say, and it wraps for
  // ever: there is no end to a conversation and nothing in one to get wrong.
  await standNear(page, 'hazel', { y: 72 });
  await tap(page, 'KeyZ');
  expect((await readHooks(page)).voice.lineId, 'her own first line, at last').toBe(hazel.lines[0]);
  await tap(page, 'KeyZ');
  expect((await readHooks(page)).voice.lineId, 'pressing again says her second').toBe(
    hazel.lines[1],
  );
  expect(hazel.lines[1], 'which is a different line').not.toBe(hazel.lines[0]);
  await tap(page, 'KeyZ');
  expect((await readHooks(page)).voice.lineId, 'and then it wraps').toBe(hazel.lines[0]);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
