import { test, expect, type Page } from '@playwright/test';
import {
  bootGame,
  isBlocked,
  readHooks,
  standByProp,
  standByRock,
  standByTree,
  standNear,
  tap,
  waitForVoice,
  walkThroughDoorway,
  type Hooks,
  type Snapshot,
} from './harness';

/**
 * One blow, landed — not one press, sent.
 *
 * The same shape as `chopping.spec`'s, and for the same reason: a press during a
 * swing is swallowed, because holding the green button is meant to be a rhythm
 * rather than a stutter. So this waits for her feet to be under her, presses, and
 * waits for the game to say a blow landed. Waiting on the number the game keeps
 * rather than on a stopwatch is the only version of this that is not a guess
 * about the frame rate.
 */
async function whack(page: Page) {
  const before = (await readHooks(page)).whacks;

  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForFunction(
      () => {
        const anim = (window as unknown as { __seraphina: Hooks }).__seraphina.player.anim;
        return !anim.startsWith('chop') && !anim.startsWith('hammer');
      },
      undefined,
      { timeout: 20_000 },
    );
    await tap(page, 'KeyZ');
    try {
      await page.waitForFunction(
        (n) => (window as unknown as { __seraphina: Hooks }).__seraphina.whacks > n,
        before,
        { timeout: 2_500 },
      );
      return;
    } catch {
      // Swallowed by a swing already running. That is the game working.
    }
  }

  throw new Error('nothing landed');
}

/** Crack one stone open, and wait for its gem to reach the row. */
async function crack(page: Page, id: string) {
  await standByRock(page, id);
  for (let blow = 0; blow < 4; blow++) {
    const now = await readHooks(page);
    if (now.quest.objects.find((o) => o.id === id)?.broken) break;
    await whack(page);
  }
  await page.waitForFunction(
    (gem) => {
      const q = (window as unknown as { __seraphina: Hooks }).__seraphina.quest;
      return q.held.includes(gem) && q.slots.every((s) => s.id !== gem || s.filled);
    },
    id,
    { timeout: 20_000 },
  );
}

/**
 * Take the job: two presses, both of them him talking.
 *
 * Pressed until it takes rather than exactly twice, for the same reason `whack`
 * retries — a press that lands inside the frame the page skipped is gone, and
 * there is nothing here a repeat could break: an offer already accepted is an
 * npc with nothing to offer, so the extra press is only ever him saying the job
 * again.
 */
async function acceptQuest(page: Page) {
  await standNear(page, 'sneak', { y: 72 });
  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).quest.id) return;
    await tap(page, 'KeyZ');
  }
  throw new Error('he never handed the job over');
}

/** Walk up to the hammer and pick it up. */
async function fetchHammer(page: Page) {
  await standByProp(page, 'hammer');
  for (let press = 0; press < 5; press++) {
    if ((await readHooks(page)).quest.phase === 'gems') return;
    await tap(page, 'KeyZ');
  }
  throw new Error('she never picked the hammer up');
}

/**
 * The nearest tree she can hit on its own: clear of everything with a green dot,
 * and clear of the quest's own stones, so a swing aimed at it cannot land on one
 * of those instead — the swing picks the nearest of the trees and the stones
 * together.
 */
function pickTree(hooks: Snapshot) {
  const away = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const tree = hooks.trees
    .filter((t) => t.choppable && t.state === 'standing')
    .filter((t) => hooks.interactables.every((i) => away(i, t) > hooks.world.tile * 5))
    .filter((t) => hooks.quest.objects.every((o) => away(o, t) > hooks.world.tile * 5))
    .sort((a, b) => away(a, hooks.player) - away(b, hooks.player))[0];

  if (!tree) throw new Error('no choppable tree clear of everything else');
  return tree;
}

const rock = (hooks: Snapshot, id: string) => hooks.quest.objects.find((o) => o.id === id);

/**
 * Every spot the quest puts something in has to be somewhere she can stand.
 *
 * The stones and the hammer live in `src/quest/quests.ts` rather than in the
 * layout, so the build's own reachability gate never sees them — this is the
 * thing that stands in for it, over the same collision grid the game walks on.
 * A stone inside a hedge is a quest that cannot be finished, and no screenshot
 * would show it.
 */
test('every quest object stands somewhere she can stand', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  await acceptQuest(page);
  const withHammer = await readHooks(page);
  const hammer = withHammer.quest.objects.find((o) => o.id === 'hammer');
  expect(hammer, 'the hammer is out while phase one is on').toBeDefined();
  expect(isBlocked(withHammer, hammer!.x, hammer!.y), 'and it is lying somewhere open').toBe(
    false,
  );

  await fetchHammer(page);
  const withRocks = await readHooks(page);
  expect(withRocks.quest.objects.map((o) => o.id).sort(), 'three stones, out together').toEqual([
    'malachite',
    'ruby',
    'sapphire',
  ]);
  for (const stone of withRocks.quest.objects) {
    expect(isBlocked(withRocks, stone.x, stone.y), `${stone.id} is standing on open ground`).toBe(
      false,
    );
    // And it is a walk, not a hunt: no two of them are in the same place, and
    // none of them is on top of her.
    expect(
      Math.hypot(stone.x - withRocks.player.x, stone.y - withRocks.player.y),
      `${stone.id} is far enough away to be worth walking to`,
    ).toBeGreaterThan(withRocks.world.tile * 4);
  }

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The whole quest, end to end, in an order the quest did not ask for.
 *
 * Free order is the design (Matt): each stone fills its own slot and no slot
 * cares which one arrived first, so this deliberately breaks them in an order
 * the data does not list — sapphire, ruby, malachite against the quest's
 * malachite, ruby, sapphire. A test that took them in order would pass just as
 * well against a queue.
 *
 * In the fast suite despite the length of it. It is three walks across the
 * village and eight swings and it costs about twenty seconds, which is real
 * money against a two-and-a-half-minute suite — and it is the only thing that
 * proves the three layers this prompt built (store, engine, scene) agree with
 * each other from one end of a quest to the other. That is exactly what the fast
 * suite is for: everything that fails when the code is wrong.
 */
test('the faerie quest, from the offer to the cave', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  // Before anything: a boy with a cloud over his head, and no quest.
  const idle = await readHooks(page);
  expect(idle.quest.id, 'nothing is on yet').toBeNull();
  expect(idle.quest.offering, 'and Sneak is the one asking').toBe('sneak');
  expect(idle.quest.marker, 'with a thought bubble actually built').toBe(true);
  expect(idle.tools.slots, 'she has the axe and three empty boxes').toEqual([
    'axe',
    null,
    null,
    null,
  ]);

  await acceptQuest(page);

  const taken = await readHooks(page);
  expect(taken.quest.id, 'the job is hers').toBe('faerie');
  expect(taken.quest.phase, 'and it starts with the hammer').toBe('hammer');
  expect(taken.quest.offering, 'nobody is offering anything any more').toBeNull();
  expect(taken.quest.marker, 'so the bubble has gone').toBe(false);
  expect(taken.quest.instruction, 'and the job is a line he can say again').toBe(
    'sneak_quest_hammer',
  );
  expect(taken.quest.slots, 'nothing to collect in this phase').toEqual([]);

  await fetchHammer(page);

  const armed = await readHooks(page);
  expect(armed.tools.slots, 'the hammer lands in the first empty box').toEqual([
    'axe',
    'hammer',
    null,
    null,
  ]);
  expect(armed.tools.holding, 'and straight into her hand — no button to find first').toBe(
    'hammer',
  );
  expect(armed.session.run.granted, 'the store knows the quest lent it to her').toEqual([
    'hammer',
  ]);
  expect(armed.quest.instruction, 'and the job has changed').toBe('sneak_quest_crack');
  expect(
    armed.quest.slots.map((s) => s.id),
    'three ghosted slots, one per stone, in the quest’s order',
  ).toEqual(['malachite', 'ruby', 'sapphire']);
  expect(armed.quest.slots.every((s) => !s.filled), 'and every one of them empty').toBe(true);

  // Out of order, on purpose.
  await crack(page, 'sapphire');
  const one = await readHooks(page);
  expect(one.quest.slots.find((s) => s.id === 'sapphire')?.filled, 'the blue one is in').toBe(
    true,
  );
  expect(
    one.quest.slots.filter((s) => s.filled).length,
    'and it is the only one — the other two are still out there',
  ).toBe(1);
  expect(one.quest.phase, 'the phase is not over yet').toBe('gems');

  await crack(page, 'ruby');
  await crack(page, 'malachite');

  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'meetAtCave',
    undefined,
    { timeout: 20_000 },
  );

  const done = await readHooks(page);
  expect(done.quest.held.sort(), 'all three stones are hers').toEqual([
    'malachite',
    'ruby',
    'sapphire',
  ]);
  expect(done.quest.phase, 'and the quest parks at the cave').toBe('meetAtCave');
  expect(done.quest.instruction, 'where his line is the one about meeting him').toBe(
    'sneak_quest_cave',
  );
  expect(done.quest.slots, 'the row has nothing left to show, so it goes').toEqual([]);
  expect(done.quest.objects, 'and there is nothing left standing in the world').toEqual([]);
  expect(done.tools.slots, 'the hammer stays in her belt while it is parked').toEqual([
    'axe',
    'hammer',
    null,
    null,
  ]);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * She goes indoors halfway through and comes out to the world she left.
 *
 * The whole reason the session store exists. A zone is rebuilt from the
 * generated map file every time she walks into it, and that file has every tree
 * standing and every stone whole — so without the store, going in for a moment
 * undoes an afternoon. Four different things have to survive one doorway: how far
 * through the quest she is, what she is carrying, what the quest lent her, and
 * the two holes she has actually made in the world.
 */
test('a doorway does not undo an afternoon', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  await acceptQuest(page);
  await fetchHammer(page);
  await crack(page, 'ruby');

  // And a tree, knocked all the way out, so there is a hole in the collision
  // grid as well as a missing sprite. The nearest choppable one to her, felled
  // with the axe — which means putting the axe back in her hand, which is the
  // blue button doing its own job.
  await tap(page, 'KeyX');
  const armed = await readHooks(page);
  expect(armed.tools.holding, 'the blue button gets the axe back').toBe('axe');

  const target = pickTree(await readHooks(page));
  await standByTree(page, target.id);
  for (let blow = 0; blow < 5; blow++) {
    const now = await readHooks(page);
    if (now.trees.find((t) => t.id === target.id)?.state === 'gone') break;
    await whack(page);
  }
  const felled = await readHooks(page);
  expect(felled.trees.find((t) => t.id === target.id)?.state, 'the tree is gone').toBe('gone');
  expect(
    isBlocked(felled, target.x, target.y),
    'and its tile has been handed back to her',
  ).toBe(false);

  // In through the front door and straight back out of it.
  await standByProp(page, 'outside_to_house');
  expect(await walkThroughDoorway(page, 'outside_to_house'), 'she is indoors').toBe('house');
  expect(await walkThroughDoorway(page), 'and back out again').toBe('outside');

  const back = await readHooks(page);
  expect(back.quest.phase, 'still halfway through phase two').toBe('gems');
  expect(back.quest.held, 'still carrying the ruby').toEqual(['ruby']);
  expect(
    back.quest.slots.find((s) => s.id === 'ruby')?.filled,
    'and its slot is still filled in',
  ).toBe(true);
  expect(back.tools.slots, 'still has the hammer the quest lent her').toEqual([
    'axe',
    'hammer',
    null,
    null,
  ]);
  expect(rock(back, 'ruby')?.broken, 'the stone she cracked is still cracked').toBe(true);
  expect(rock(back, 'malachite')?.broken, 'and the two she did not are still whole').toBe(false);
  expect(rock(back, 'sapphire')?.broken).toBe(false);

  expect(back.trees.find((t) => t.id === target.id)?.state, 'the tree is still gone').toBe('gone');
  expect(
    isBlocked(back, target.x, target.y),
    'and the ground it was standing on is still hers',
  ).toBe(false);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The wrong tool is never a wrong answer.
 *
 * Both halves, because they are the same rule seen from either end: the axe on a
 * stone and the hammer in a tree. Each one lands a real blow — the thing wobbles
 * and the game answers — and neither one moves anything an inch. There is no
 * buzzer, no damage and no going backwards; the swing simply does not bite. See
 * CLAUDE.md, "No fail states".
 */
test('the wrong tool shakes things and breaks nothing', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  await acceptQuest(page);
  await fetchHammer(page);

  // The hammer, in a tree.
  const start = await readHooks(page);
  expect(start.tools.holding, 'the hammer is what she is carrying').toBe('hammer');
  const tree = pickTree(start);

  await standByTree(page, tree.id);
  const beforeTree = await readHooks(page);
  for (let blow = 0; blow < 4; blow++) await whack(page);
  const afterTree = await readHooks(page);

  expect(afterTree.whacks - beforeTree.whacks, 'four blows landed on it').toBe(4);
  expect(afterTree.peakParticles, 'and it shed something every time').toBeGreaterThan(0);
  expect(
    afterTree.trees.find((t) => t.id === tree.id)?.state,
    'but three of those would have felled it with an axe, and it is still a whole tree',
  ).toBe('standing');
  expect(isBlocked(afterTree, tree.x, tree.y), 'and still solid').toBe(true);

  // The axe, on a stone.
  await tap(page, 'KeyX');
  expect((await readHooks(page)).tools.holding, 'back to the axe').toBe('axe');

  await standByRock(page, 'malachite');
  const beforeRock = await readHooks(page);
  for (let blow = 0; blow < 4; blow++) await whack(page);
  const afterRock = await readHooks(page);

  expect(afterRock.whacks - beforeRock.whacks, 'four blows landed on that too').toBe(4);
  expect(
    rock(afterRock, 'malachite')?.broken,
    'but two of those would have opened it with the hammer, and it is whole',
  ).toBe(false);
  expect(afterRock.quest.held, 'so nothing has been collected').toEqual([]);
  expect(
    afterRock.quest.slots.every((s) => !s.filled),
    'and every slot on the row is still empty',
  ).toBe(true);
  expect(afterRock.quest.phase, 'and the quest has not moved').toBe('gems');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The yellow button says the job again, from anywhere.
 *
 * She is four and she will forget, and the version of this game where forgetting
 * means walking back across the village to ask is a game with a chore in it. So
 * the instruction is a button — the yellow one, which is a yellow dot on screen
 * and never the letter Y — and the balloon comes up over *her*, in his voice,
 * because she is the one remembering what he said.
 */
test('the yellow button replays the job, over her, in his voice', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  // Nothing on: the button says nothing, which is the only honest answer.
  await tap(page, 'KeyY');
  expect((await readHooks(page)).voice.lineId, 'no quest, nothing to remember').toBeNull();

  await acceptQuest(page);

  // Deliberately away from him, because "from anywhere" is the claim.
  await standByProp(page, 'well');
  const here = await readHooks(page);
  const sneak = here.npcs.find((n) => n.id === 'sneak')!;
  expect(
    Math.hypot(sneak.x - here.player.x, sneak.y - here.player.y),
    'and she is nowhere near him',
  ).toBeGreaterThan(here.interactRadius * 3);

  await tap(page, 'KeyY');
  const said = await readHooks(page);

  expect(said.voice.lineId, 'the phase’s own instruction, said again').toBe('sneak_quest_hammer');
  expect(said.voice.words.length, 'with words to light up').toBeGreaterThan(0);
  expect(said.voice.bubble.visible, 'and a balloon to put them in').toBe(true);
  expect(said.voice.bubble.speaker, 'which is hers — she is the one remembering').toBe(
    'seraphina',
  );
  expect(
    Math.abs(said.voice.bubble.x - said.player.x),
    'sitting over her, not over the boy across the village',
  ).toBeLessThan(60);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
