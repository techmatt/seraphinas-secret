import { test, expect, type Page } from '@playwright/test';
import {
  bootGame,
  readHooks,
  snap,
  standNear,
  tap,
  waitForVoice,
  type Snapshot,
} from './harness';

const npc = (hooks: Snapshot, id: string) => {
  const who = hooks.npcs.find((n) => n.id === id);
  if (!who) throw new Error(`no npc ${id} in ${hooks.room}`);
  return who;
};

/**
 * Stand back and photograph somebody.
 *
 * Far enough that the green dot is not showing, because the dot's glow is drawn
 * over the whole world and a picture of a child under one is a picture of a
 * glow. For the report's evidence shots only; every claim here is made from the
 * hooks.
 */
async function photograph(page: Page, at: { x: number; y: number }, file: string) {
  await page.evaluate(
    ([x, y]) =>
      (window as unknown as { __seraphina: { teleport: (x: number, y: number) => void } })
        .__seraphina.teleport(x!, y!),
    [at.x, at.y + 240],
  );
  await page.waitForTimeout(500);
  await snap(page, file);
}

/**
 * A person is a thing the green button is about.
 *
 * The half worth asserting is the *anchor*. A balloon that always appears over
 * the player says nothing about who is talking, and which of the two people on
 * screen the words belong to is the one thing a pre-reader has to get out of a
 * conversation. So she is deliberately stood a tile clear of him before the
 * press — walking up to somebody with no collision would otherwise put her
 * inside him, where "over him" and "over her" are the same picture and the test
 * would pass whatever the code did.
 *
 * What he *says* is the quest's business now, not the map's: he is the one
 * person in the village with a job to hand out, and green at him is the offer
 * rather than his own two lines. So the line here is read off the quest hooks,
 * and the cycle-and-wrap claim has moved down to Hazel, who is still somebody
 * with nothing to ask for. See `quest.spec` for the offer itself.
 */
test('Sneak has a green dot, and the balloon is his', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  // Him on his own first, before anything is said, so the evidence shot is of a
  // boy on a doorstep and not of a speech balloon.
  await photograph(page, npc(await readHooks(page), 'sneak'), '62-sneak.png');

  // A tile below him, out in the street: near enough for the dot, far enough
  // that the balloon has two different places it could be.
  await standNear(page, 'sneak', { y: 72 });

  const before = await readHooks(page);
  const him = npc(before, 'sneak');
  expect(before.promptDot, 'a person asks to be pressed, the way a chest does').toBe(true);
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
  const toHim = Math.abs(talking.voice.bubble.x - him.x);
  const toHer = Math.hypot(
    talking.voice.bubble.x - talking.player.x,
    talking.voice.bubble.y - talking.player.y,
  );
  expect(toHim, 'the balloon sits over the speaker').toBeLessThan(40);
  expect(talking.voice.bubble.y, 'above his head, not through it').toBeLessThan(him.y);
  expect(
    Math.hypot(talking.voice.bubble.x - him.x, talking.voice.bubble.y - him.y),
    'and nearer him than her, which is the whole of the anchor',
  ).toBeLessThan(toHer);

  // He turns to look at whoever is talking to him.
  expect(npc(talking, 'sneak').facing, 'and he turns to face her').toBe('down');

  await snap(page, '60-sneak-bubble.png');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * Hazel is the same machinery with a different child in it — which is the point
 * of asserting on her at all. A person is data now: a sheet, a spot and a list
 * of lines, so the second one has to work without a line of code of her own.
 *
 * She is also the one who still *cycles*. Pressing green again is the next thing
 * somebody has to say and it wraps for ever: there is no end to a conversation
 * and nothing in one to get wrong. That claim used to be made about Sneak, who
 * has a job to hand out now and answers to a different rule.
 */
test('Hazel speaks too, in her own voice and from her own spot', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  await photograph(page, npc(await readHooks(page), 'hazel'), '63-hazel.png');
  await standNear(page, 'hazel', { y: 72 });

  const before = await readHooks(page);
  const her = npc(before, 'hazel');
  expect(before.promptDot).toBe(true);

  await tap(page, 'KeyZ');
  const talking = await readHooks(page);
  expect(talking.voice.lineId).toBe(her.lines[0]);
  expect(talking.voice.bubble.speaker, 'her balloon, over her').toBe('hazel');
  expect(Math.abs(talking.voice.bubble.x - her.x)).toBeLessThan(40);

  await snap(page, '61-hazel-bubble.png');

  await tap(page, 'KeyZ');
  const again = await readHooks(page);
  expect(again.voice.lineId, 'pressing again says her second line').toBe(her.lines[1]);
  expect(her.lines[1], 'which is a different line').not.toBe(her.lines[0]);

  await tap(page, 'KeyZ');
  expect((await readHooks(page)).voice.lineId, 'and then it wraps').toBe(her.lines[0]);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * She walks through people, and they notice.
 *
 * No collision is deliberate: a four-year-old aiming a thumbstick pins herself
 * on anything that stands its ground, and being stuck behind her own sister is
 * a fail state with a friendly face on it. So the only thing to prove here is
 * that walking through somebody is possible at all — the wobble is juice, and
 * juice does not get a test.
 */
test('nobody blocks her — she walks straight through her sister', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  const her = npc(start, 'hazel');

  const { tile, cols, blocked } = start.world;
  const col = Math.floor(her.x / tile);
  const row = Math.floor(her.y / tile);
  expect(
    blocked[row * cols + col],
    'the tile she is standing in is not solid — a person is not a wall',
  ).toBe('0');

  // And she can actually be stood in it, which is the same claim made by the
  // one thing that could disprove it: the game's own collision test.
  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: { teleport: (x: number, y: number) => void } })
      .__seraphina.teleport(x!, y!),
    [her.x, her.y],
  );
  await page.waitForTimeout(200);

  const inside = await readHooks(page);
  expect(
    Math.hypot(inside.player.x - her.x, inside.player.y - her.y),
    'she ends up where her sister is, not shoved out of the way',
  ).toBeLessThan(tile);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
