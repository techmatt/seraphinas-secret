import { test, expect, type Page } from '@playwright/test';
import {
  bootGame,
  isBlocked,
  readHooks,
  standAt,
  standByProp,
  standByRock,
  standByTree,
  standNear,
  standOnTile,
  tap,
  waitForQuiet,
  waitForVoice,
  walk,
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
 *
 * Waits on the id of the job rather than on there being one, because a day can
 * have two: the second one is taken while the first is still sitting in the
 * store, finished, and "she has a quest" is true before the first press.
 */
async function acceptQuest(page: Page, who = 'sneak', becomes = 'faerie') {
  await standNear(page, who, { y: 72 });
  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).quest.id === becomes) return;
    await tap(page, 'KeyZ');
  }
  throw new Error(who + ' never handed the job over');
}

/**
 * Press one of the ritual's buttons and wait for him to ask for the next one.
 *
 * Waiting on the step rather than on a stopwatch, for the usual reason: the
 * stone's flight into the fire is the thing between a press and the next
 * instruction, and how long a tween takes on a page running at fifteen frames a
 * second is not something a test may guess at.
 */
async function ritualPress(page: Page, key: string, becomes: string) {
  await tap(page, key);
  await page.waitForFunction(
    (want) => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.step === want,
    becomes,
    { timeout: 20_000 },
  );
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
 * Wait for a phase's instruction to have been said, and then for the quiet
 * after it.
 *
 * A phase ends with its new instruction spoken *a beat later* — see
 * `sayInstructionAfter` — so "wait until nobody is talking" on its own can pass
 * in the gap before it starts, and whatever the test says next gets talked over
 * a second afterwards. The little things she says to herself are dropped rather
 * than queued while a real line is in the air, so for any test about a bark this
 * is not tidiness, it is the difference between asking the question and not.
 */
async function afterInstruction(page: Page, line: string) {
  await page.waitForFunction(
    (want) => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId === want,
    line,
    { timeout: 20_000 },
  );
  await waitForQuiet(page);
}

/**
 * The whole quest, end to end, in an order the quest did not ask for.
 *
 * Free order is the design (Matt): each stone fills its own slot and no slot
 * cares which one arrived first, so this deliberately breaks them in an order
 * the data does not list — sapphire, ruby, malachite against the quest's
 * malachite, ruby, sapphire. A test that took them in order would pass just as
 * well against a queue.
 *
 * It also checks, as each phase puts its things out, that they are standing
 * somewhere she can stand. The stones and the hammer live in `src/quest/quests.ts`
 * rather than in the layout, so the build's own reachability gate never sees
 * them; this is what stands in for it, over the same collision grid the game
 * walks on. A stone inside a hedge is a quest that cannot be finished, and no
 * screenshot would show it.
 *
 * In the fast suite despite the length of it. It is the only thing that proves
 * the three layers (store, engine, scene) agree with each other from one end of
 * a quest to the other, which is exactly what the fast suite is for.
 */
test('the faerie quest, from the offer to the cave', async ({ page }) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  // Before anything: a boy with a cloud over his head, and no quest.
  const idle = await readHooks(page);
  expect(idle.quest.id, 'nothing is on yet').toBeNull();
  // Three people with something to ask, which is what three quests looks like
  // from the yard: a boy on his doorstep, a girl by the pond and a father by his
  // shed. One of them can be said yes to, and saying yes to any takes every
  // cloud off the sky.
  expect(idle.quest.offers.sort(), 'all three of them are asking').toEqual([
    'dad',
    'morgana',
    'sneak',
  ]);
  expect(idle.quest.markers, 'with a thought bubble apiece, actually built').toBe(3);
  expect(idle.tools.slots, 'she has the axe and three empty boxes').toEqual([
    'axe',
    null,
    null,
    null,
  ]);
  expect(idle.coins, 'and an empty purse, on a row that is on screen anyway').toBe(0);

  await acceptQuest(page);

  const taken = await readHooks(page);
  expect(taken.quest.id, 'the job is hers').toBe('faerie');
  expect(taken.quest.phase, 'and it starts with the hammer').toBe('hammer');
  expect(taken.quest.offers, 'nobody is offering anything any more').toEqual([]);
  expect(taken.quest.markers, 'so every bubble has gone').toBe(0);
  expect(taken.quest.instruction, 'and the job is a line he can say again').toBe(
    'sneak_quest_hammer',
  );
  expect(taken.quest.slots, 'nothing to collect in this phase').toEqual([]);

  const hammer = taken.quest.objects.find((o) => o.id === 'hammer');
  expect(hammer, 'the hammer is out while phase one is on').toBeDefined();
  expect(isBlocked(taken, hammer!.x, hammer!.y), 'and it is lying somewhere open').toBe(false);

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
  expect(armed.session.run.granted, 'the store knows the quest lent it to her').toEqual(['hammer']);
  expect(armed.quest.instruction, 'and the job has changed').toBe('sneak_quest_crack');
  expect(
    armed.quest.slots.map((s) => s.id),
    'three ghosted slots, one per stone, in the quest’s order',
  ).toEqual(['malachite', 'ruby', 'sapphire']);
  expect(armed.quest.slots.every((s) => !s.filled), 'and every one of them empty').toBe(true);

  expect(armed.quest.objects.map((o) => o.id).sort(), 'three stones, out together').toEqual([
    'malachite',
    'ruby',
    'sapphire',
  ]);
  for (const stone of armed.quest.objects) {
    expect(isBlocked(armed, stone.x, stone.y), `${stone.id} is standing on open ground`).toBe(false);
    // And it is a walk, not a hunt: none of them is on top of her.
    expect(
      Math.hypot(stone.x - armed.player.x, stone.y - armed.player.y),
      `${stone.id} is far enough away to be worth walking to`,
    ).toBeGreaterThan(armed.world.tile * 4);
  }

  // Out of order, on purpose.
  await crack(page, 'sapphire');
  const one = await readHooks(page);
  expect(one.quest.slots.find((s) => s.id === 'sapphire')?.filled, 'the blue one is in').toBe(true);
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

  // --- and the rest of it: the cave, the ritual, the faeries ----------------
  //
  // Teleported to the cave mouth rather than walked up the mountain path. That
  // the world is crossable on foot is `world.spec`'s claim and it costs a minute
  // to make; this test is about what happens at the far end of the walk.
  await standByProp(page, 'outside_to_cave');
  expect(await walkThroughDoorway(page, 'outside_to_cave'), 'in through the mouth').toBe('cave');

  const arrived = await readHooks(page);
  expect(arrived.quest.phase, 'walking in is the whole of what that phase wanted').toBe('ritual');
  expect(
    arrived.npcs.map((n) => n.id).sort(),
    'and the two of them went on ahead — they are in here, not out there',
  ).toEqual(['morgana', 'sneak']);
  expect(arrived.quest.circle, 'there is a circle on the floor').toBe(true);
  expect(arrived.quest.inCircle, 'and she has not reached it yet').toBe(false);
  expect(
    arrived.quest.slots.map((s) => s.id),
    'the row re-arms as three buttons, in the order he asks for them',
  ).toEqual(['red', 'green', 'blue']);
  expect(
    arrived.quest.slots.every((s) => s.kind === 'button' && !s.filled),
    'every one of them a coloured dot, and every one of them empty',
  ).toBe(true);

  // Into the circle. `cave_fire` is the layout's own name for the spot in front
  // of the fire, two tiles inside a ring two and a half across — so standing at
  // it is standing in the ring, which is the same moment the face buttons
  // change hands.
  await standAt(page, 'cave_fire');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.inCircle,
    undefined,
    { timeout: 20_000 },
  );
  const atFire = await readHooks(page);
  expect(atFire.quest.step, 'red is the first of the three').toBe('red');
  expect(atFire.voice.lineId, 'and he asks for it out loud').toBe('sneak_press_red');
  expect(atFire.voice.bubble.speaker, 'out of his own mouth').toBe('sneak');

  // The wrong button, on purpose. It has to be a whole press of a real button
  // that does something — not silence — and it has to cost her nothing.
  await tap(page, 'KeyZ');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.ritualMisses > 0,
    undefined,
    { timeout: 20_000 },
  );
  const missed = await readHooks(page);
  expect(missed.quest.step, 'green when he said red: still red').toBe('red');
  expect(
    missed.quest.slots.every((s) => !s.filled),
    'nothing filled in, nothing lost',
  ).toBe(true);
  expect(missed.quest.held.sort(), 'and all three stones still hers').toEqual([
    'malachite',
    'ruby',
    'sapphire',
  ]);
  expect(missed.voice.lineId, 'he names the colour again, and never says no').toBe('sneak_try_red');

  // Red, green, blue. `KeyC` is the red button — see setupInput for why the B
  // key could not be.
  await ritualPress(page, 'KeyC', 'green');
  const oneIn = await readHooks(page);
  expect(
    oneIn.quest.slots.find((s) => s.id === 'red')?.filled,
    'the red dot fills in',
  ).toBe(true);
  expect(oneIn.quest.held.sort(), 'and the ruby is in the fire, not in her pocket').toEqual([
    'malachite',
    'sapphire',
  ]);

  await ritualPress(page, 'KeyZ', 'blue');
  await tap(page, 'KeyX');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'done',
    undefined,
    { timeout: 20_000 },
  );

  const summoned = await readHooks(page);
  expect(summoned.quest.instruction, 'nothing left for him to ask for').toBeNull();
  expect(summoned.quest.held, 'all three stones went into the fire').toEqual([]);
  expect(summoned.faeries.length, 'and three faeries came out of it').toBe(3);
  expect(summoned.session.run.faeries, 'which the store now knows about').toBe(true);
  expect(summoned.tools.slots, 'the hammer was lent, and it goes back').toEqual([
    'axe',
    null,
    null,
    null,
  ]);
  expect(summoned.tools.holding, 'so she is holding her own axe again').toBe('axe');
  expect(summoned.session.run.granted, 'and the store has let go of it too').toEqual([]);

  // The coin is hers the instant the spell works, whatever she does next — see
  // `RoomScene.summon`. The flourish waits for the boy to hand it over.
  expect(summoned.coins, 'and finishing the job is worth a coin').toBe(1);
  expect(
    summoned.session.persistent.coins,
    'kept on the far side of the seam, where a night cannot reach it',
  ).toBe(1);

  // ...which he does, at the end of the celebration, out loud. Waited for here
  // rather than walked away from, because the chain stops if she leaves, and the
  // last sentence of the game's first quest is worth proving arrives.
  await page.waitForFunction(
    () =>
      (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId === 'sneak_coin',
    undefined,
    { timeout: 30_000 },
  );
  const paid = await readHooks(page);
  expect(paid.voice.bubble.speaker, 'out of his own mouth — he is giving her something').toBe(
    'sneak',
  );
  expect(paid.voice.words.length, 'with words on screen to light up').toBeGreaterThan(0);
  expect(paid.coins, 'and the count did not move again on the way past').toBe(1);

  // Out of the cave. The faeries are a session flag, not a zone's furniture.
  expect(await walkThroughDoorway(page), 'back out under the sky').toBe('outside');
  const after = await readHooks(page);
  expect(after.faeries.length, 'and all three came through the door with her').toBe(3);
  expect(
    after.npcs.map((n) => n.id).sort(),
    'while Sneak and Morgana are back at their own spots, and Dad never left his',
  ).toEqual(['dad', 'morgana', 'sneak']);
  expect(after.quest.circle, 'the cave keeps the circle; the village never had one').toBe(false);

  // And he has his own two lines back — the first thing he has been able to say
  // for himself since he handed the job out.
  await standNear(page, 'sneak', { y: 72 });
  await tap(page, 'KeyZ');
  const chatting = await readHooks(page);
  expect(
    ['sneak_faeries', 'sneak_secrets'],
    'his idle chatter, which the quest has been standing on all afternoon',
  ).toContain(chatting.voice.lineId);

  expect(errors, 'no uncaught page errors').toEqual([]);
});


/**
 * An afternoon's worth of a quest, in one sitting: the button that remembers it,
 * the tools that do not work, the ones that do, and a doorway that undoes none
 * of it.
 *
 * The yellow button says the job again, from anywhere. She is four and she will
 * forget, and the version of this game where forgetting means walking back
 * across the village to ask is a game with a chore in it. So the instruction is a
 * button — the yellow one, which is a yellow dot on screen and never the letter
 * Y — and the balloon comes up over *her*, in his voice, because she is the one
 * remembering what he said.
 *
 * The wrong tool is never a wrong answer. Both halves, because they are the same
 * rule seen from either end: the axe on a stone and the hammer in a tree. Each
 * one lands a real blow — the thing wobbles and the game answers — and neither
 * one moves anything an inch. There is no buzzer, no damage and no going
 * backwards; the swing simply does not bite. See CLAUDE.md, "No fail states".
 * What it does instead is *say* which tool would have: the shake is the same as
 * it ever was, and over it she names the axe. Then the same tree and the same
 * kind of stone with the right tool in her hand, which is what makes the first
 * half evidence rather than a stuck game — and the blue button that gets her
 * there names what it handed her, because every tool she picks up or switches to
 * is a word she is being taught.
 *
 * And then she goes indoors and comes out to the world she left, which is the
 * whole reason the session store exists. A zone is rebuilt from the generated
 * map file every time she walks into it, and that file has every tree standing
 * and every stone whole — so without the store, going in for a moment undoes an
 * afternoon. Four things have to survive one doorway: how far through the quest
 * she is, what she is carrying, what the quest lent her, and the two holes she
 * has actually made in the world.
 *
 * And then she goes to bed, and none of the four survives that — which is the
 * same claim from the other end, and is why it is asked here rather than from a
 * boot of its own. A night's sleep is the one thing in the game that undoes an
 * afternoon on purpose, and the only honest way to prove it undid one is to
 * have had one.
 */
test('the yellow button remembers, the wrong tool cannot spoil it, a doorway does not undo it, and a night does', async ({
  page,
}) => {
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
  expect(said.voice.bubble.speaker, 'which is hers — she is the one remembering').toBe('seraphina');
  expect(
    Math.abs(said.voice.bubble.x - said.player.x),
    'sitting over her, not over the boy across the village',
  ).toBeLessThan(60);

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

  // And she says which tool would have worked. Naming the fix is the whole
  // point: a shake on its own says only that it did not work, which is the half
  // she can already see.
  //
  // Asked of a quiet moment and a fresh blow rather than of the four above.
  // Picking the hammer up ended a phase, a phase ends with its new instruction
  // spoken a beat later, and a bark is dropped rather than queued while anything
  // else is talking — that is the rule and not a race. Five blows in, the beat
  // has long since passed and there is nothing left pending to talk over her.
  await waitForQuiet(page);
  await whack(page);
  const corrected = await readHooks(page);
  expect(corrected.voice.lineId, 'the hammer in a tree asks for the axe').toBe(
    'seraphina_need_axe',
  );
  expect(corrected.voice.bubble.visible, 'out loud and on screen, as everything is').toBe(true);

  // The axe, on a stone. And the blue button names what it just put in her hand.
  await tap(page, 'KeyX');
  const switched = await readHooks(page);
  expect(switched.tools.holding, 'back to the axe').toBe('axe');
  expect(switched.voice.lineId, 'and she says so').toBe('seraphina_axe');
  expect(switched.voice.bubble.speaker, 'in her own balloon').toBe('seraphina');
  expect(
    switched.player.y - switched.voice.bubble.y,
    'sitting over her head, where her own words go',
  ).toBeGreaterThan(0);

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

  // Now the right tool in each hand, so the two above are a tool that does not
  // bite rather than a game that has stopped listening. A different stone from
  // the one she failed to crack, because the claim below is that the one she
  // left whole is still whole after a doorway.
  await tap(page, 'KeyX');
  expect((await readHooks(page)).tools.holding, 'the hammer again').toBe('hammer');
  await crack(page, 'ruby');

  // And the same tree, knocked all the way out, so there is a hole in the
  // collision grid as well as a missing sprite.
  await tap(page, 'KeyX');
  expect((await readHooks(page)).tools.holding, 'and the axe again').toBe('axe');
  await standByTree(page, tree.id);
  for (let blow = 0; blow < 5; blow++) {
    const now = await readHooks(page);
    if (now.trees.find((t) => t.id === tree.id)?.state === 'gone') break;
    await whack(page);
  }
  const felled = await readHooks(page);
  expect(
    felled.trees.find((t) => t.id === tree.id)?.state,
    'the tree the hammer could not dent is gone',
  ).toBe('gone');
  expect(
    isBlocked(felled, tree.x, tree.y),
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

  expect(back.trees.find((t) => t.id === tree.id)?.state, 'the tree is still gone').toBe('gone');
  expect(
    isBlocked(back, tree.x, tree.y),
    'and the ground it was standing on is still hers',
  ).toBe(false);

  // --- a pocketful of coins, which is the one thing a night leaves alone ----
  //
  // Handed over rather than earned: the only thing in the game that gives her a
  // coin is the end of a whole quest, and this test deliberately never finishes
  // one. `grantCoin` is the same standing-in as `giveTool` and it drives the
  // real path — store, row and noise — so what survives the night below is a
  // coin that arrived the way coins arrive.
  //
  // Four of them, because three is the whole purse and the fourth is the only
  // way to ask what happens when there is no room. Nothing is lost, nothing is
  // said, and nothing anywhere is a failure — see CLAUDE.md, "No fail states".
  const purse = await page.evaluate(() => {
    const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
    return [h.grantCoin(), h.grantCoin(), h.grantCoin(), h.grantCoin()];
  });
  expect(purse, 'three land, and the fourth bounces off a full pocket').toEqual([
    true,
    true,
    true,
    false,
  ]);
  const rich = await readHooks(page);
  expect(rich.coins, 'three is all there is room for').toBe(3);
  expect(rich.session.persistent.coins, 'and the store agrees with the row').toBe(3);

  // --- and then she goes to bed, and none of it survives the night ----------
  //
  // The other half of the same claim, and the reason it is folded in here
  // rather than booted on its own: everything above exists to build a state
  // worth destroying. She is halfway through a quest, carrying a stone it gave
  // her, holding a hammer it lent her, and there is a hole in the wood where a
  // tree used to be. A night takes all four (Matt, 2026-08-12: everything
  // resets, no exceptions) and the axe stays, because the axe is hers.
  //
  // Two presses on the bed, and the first one has to *not* be enough — a bed
  // that ends the day the moment she leans on it is a bed she will stop walking
  // past. See `poke`.
  await standByProp(page, 'outside_to_house');
  expect(await walkThroughDoorway(page, 'outside_to_house'), 'indoors for the night').toBe('house');

  await standByProp(page, 'bed');
  await tap(page, 'KeyZ');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId === 'seraphina_bed',
    undefined,
    { timeout: 20_000 },
  );
  const asked = await readHooks(page);
  expect(asked.sleeps, 'one press asks the question and nothing else').toBe(0);
  expect(asked.voice.bubble.speaker, 'in her own voice, over her own head').toBe('seraphina');

  // Pressed until it takes rather than exactly once, the same as `acceptQuest`:
  // a press that lands inside a frame the page skipped is gone, and a repeat
  // only ever asks again.
  for (let press = 0; press < 5; press++) {
    if ((await readHooks(page)).sleeps > 0) break;
    await tap(page, 'KeyZ');
  }

  // The day gets read back to her before it is taken away.
  //
  // Which sentences she gets is the only part of the recap worth pinning, and
  // this is the one place in the suite with a day worth reciting: she is halfway
  // through a quest, carrying a stone she cracked, and there is a hole in the
  // wood where a tree used to be. The store is snapshotted before the night
  // clears it — that ordering is the whole contract of `state/recap.ts` — so a
  // recap that came back empty here would mean it was read a moment too late.
  //
  // Three of the four things she did qualify and only two are said: the tree is
  // the one dropped, because the order is fixed and a felled tree is the least
  // of what happened today. Then goodnight, which is said every night whatever
  // else was. How the three are *paced* over the starfield is Matt's eyes.
  await page.waitForFunction(
    () =>
      (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId ===
      'seraphina_goodnight',
    undefined,
    { timeout: 30_000 },
  );
  const bedtime = await readHooks(page);
  expect(bedtime.recap, 'two things that happened, then goodnight').toEqual([
    'seraphina_recap_errand',
    'seraphina_recap_stones',
    'seraphina_goodnight',
  ]);
  expect(bedtime.voice.bubble.visible, 'said out loud over the stars').toBe(true);
  expect(bedtime.voice.bubble.speaker, 'in her own voice — it is her day').toBe('seraphina');
  expect(bedtime.voice.words.length, 'with words on screen to light up').toBeGreaterThan(0);

  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
      return h.sleeps > 0 && h.ready && !h.transitioning;
    },
    undefined,
    { timeout: 20_000 },
  );

  const morning = await readHooks(page);
  expect(morning.room, 'she wakes in the room she went to sleep in').toBe('house');
  const bed = morning.interactables.find((p) => p.id === 'bed')!;
  expect(
    Math.hypot(bed.x - morning.player.x, bed.y - morning.player.y),
    'standing beside her own bed',
  ).toBeLessThanOrEqual(morning.interactRadius);

  expect(morning.session.run.quest, 'the quest she was halfway through is gone').toBeNull();
  expect(morning.session.run.items, 'and so is the stone she was carrying for it').toEqual([]);
  expect(morning.session.run.granted, 'and the record of what it lent her').toEqual([]);
  expect(morning.session.world, 'and every mark she left on the world').toEqual({});
  expect(morning.tools.slots, 'the hammer went back overnight; the axe never does').toEqual([
    'axe',
    null,
    null,
    null,
  ]);
  expect(morning.tools.holding, 'so the axe is what she wakes up holding').toBe('axe');
  expect(morning.quest.phase, 'no phase, so no row and nothing to remember').toBeNull();
  expect(morning.quest.slots).toEqual([]);
  expect(morning.quest.instruction, 'and the yellow button has nothing to say').toBeNull();

  // And the one exception, which is the whole point of coins: everything else
  // she had yesterday is gone and her three are still in her pocket. The row is
  // drawn from the store on every zone build, so `coins` here is the picture and
  // `persistent.coins` is the thing the night was supposed to leave alone —
  // asserting both is what tells a surviving coin from a stale HUD.
  expect(morning.coins, 'her coins are the one thing the night leaves her').toBe(3);
  expect(morning.session.persistent.coins, 'on both sides of the seam').toBe(3);

  // Teleported across the house to the front door rather than walked. That she
  // can get from her bedroom to the yard is not this test's claim and it costs
  // twenty-odd tiles of hopping to make; what is on the far side of the door is.
  await standAt(page, 'playroom');
  expect(await walkThroughDoorway(page), 'out into the new day').toBe('outside');
  const newDay = await readHooks(page);
  expect(newDay.quest.offers.sort(), 'and every job is going again').toEqual([
    'dad',
    'morgana',
    'sneak',
  ]);
  expect(newDay.quest.markers, 'with the thought bubbles back over their heads').toBe(3);
  expect(
    newDay.trees.find((t) => t.id === tree.id)?.state,
    'the tree she felled grew back while she slept',
  ).toBe('standing');
  expect(isBlocked(newDay, tree.x, tree.y), 'and its tile is solid again').toBe(true);
  expect(
    newDay.quest.objects,
    'and the quest has taken its stones home with it',
  ).toEqual([]);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The bunny rescue, end to end: a ring that was not there this morning, four
 * trees down, three carrots, and three walks home.
 *
 * One test for the whole quest, the way the faerie one is, and for the same
 * reason: what is worth proving is that the three layers — store, engine, scene
 * — agree with each other from the offer to the coin, and there is no way to ask
 * that of a phase in isolation. Page startup is the dominant cost in this suite,
 * so this is one boot with every question the wood can answer asked inside it.
 *
 * The walking is teleported past wherever the walk is not the claim. One place
 * it is: she is put down five tiles west of the ring and walks the rest, because
 * arriving is the whole of that phase's job and a teleport into the circle would
 * be asserting on the teleport.
 *
 * The two refusals are asked as hard as the successes. One bunny at a time is
 * *enforced*, and a test that only counted the boxes filling up would pass just
 * as well against a phase that let her tag all three and walk home once.
 *
 * And then the other job, in the same boot, because a two-quest day is the only
 * place two of this game's claims can be asked at all: that finishing one quest
 * hands the other one back rather than ending the afternoon (Matt, 2026-08-13),
 * and that what the first one left in the world survives the second one being
 * taken. It ends on the recap, which is the only sentence that can say both
 * halves of a day like that happened.
 *
 * **Three minutes rather than the suite's two and a half.** It is the longest
 * test in the fast suite by a distance — two whole quests and a night — and it
 * came in at 1.7 min on a good run and touched the 150 s cap on one run in
 * three. The cap it is given is its own; the suite-wide default stays where it
 * is, because nothing else is anywhere near it.
 */
test('the bunny rescue, the faerie quest after it, and a night that says both', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  const penTrees = (hooks: Snapshot) => hooks.trees.filter((t) => t.id.startsWith('pen_'));
  const bunnyState = (hooks: Snapshot, id: string) => {
    const found = hooks.bunnies.find((b) => b.id === id);
    if (!found) throw new Error(`no bunny ${id}`);
    return found.state;
  };

  // Before anything: a clearing with nothing in it. The pen is the quest's
  // furniture, so it must not exist on an afternoon nobody took the job.
  const morning = await readHooks(page);
  expect(morning.quest.offers, 'he is one of the three asking').toContain('dad');
  expect(penTrees(morning), 'and there is no ring in the wood yet').toEqual([]);
  expect(morning.bunnies, 'and no bunnies anywhere').toEqual([]);

  const shed = morning.npcs.find((n) => n.id === 'dad')!;

  // Take it. Two presses, both of them him talking.
  await standNear(page, 'dad', { y: 72 });
  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).quest.id) break;
    await tap(page, 'KeyZ');
  }

  const taken = await readHooks(page);
  expect(taken.quest.id, 'the job is hers').toBe('bunny');
  expect(taken.quest.phase, 'and it starts with the walk out').toBe('toThePen');
  expect(taken.quest.giver, 'his to repeat, in his voice').toBe('dad');
  expect(taken.quest.instruction).toBe('dad_quest_pen');
  expect(taken.quest.offers, 'and none of them is offering anything now').toEqual([]);

  // The ring, sixteen of it, standing and solid — and every one of them a tree
  // she is allowed to fell, which is what makes the phase after this possible.
  const ring = penTrees(taken);
  expect(ring.length, 'a hollow five-by-five ring is sixteen trees').toBe(16);
  expect(
    ring.every((t) => t.choppable && t.state === 'standing'),
    'all of them standing, and all of them hers',
  ).toBe(true);
  for (const tree of ring) {
    expect(isBlocked(taken, tree.x, tree.y), tree.id + ' is solid from the moment it spawns').toBe(
      true,
    );
  }

  // Three bunnies inside it, and inside is inside: every one of them is nearer
  // the middle of the ring than the ring itself is.
  const tile = taken.world.tile;
  const middle = {
    x: ring.reduce((sum, t) => sum + t.x, 0) / ring.length,
    y: ring.reduce((sum, t) => sum + t.y, 0) / ring.length,
  };
  expect(taken.bunnies.length, 'three of them').toBe(3);
  expect(taken.bunnies.every((b) => b.state === 'penned'), 'all penned').toBe(true);
  for (const b of taken.bunnies) {
    expect(
      Math.hypot(b.x - middle.x, b.y - middle.y),
      b.id + ' is inside the ring, not beside it',
    ).toBeLessThan(tile * 2);
  }

  // And Dad has gone on ahead to the den, which is a long way from his shed.
  const atDen = taken.npcs.find((n) => n.id === 'dad')!;
  expect(
    Math.hypot(atDen.x - shed.x, atDen.y - shed.y),
    'he is not where the map put him any more',
  ).toBeGreaterThan(tile * 10);

  // --- phase one: the walk out ---------------------------------------------
  await standOnTile(page, Math.round(middle.x / tile) - 5, Math.round(middle.y / tile));
  expect(
    (await readHooks(page)).quest.phase,
    'standing a few tiles short is not standing there',
  ).toBe('toThePen');

  for (let hop = 0; hop < 10; hop++) {
    if ((await readHooks(page)).quest.phase !== 'toThePen') break;
    await walk(page, 'ArrowRight', 200);
  }
  const arrived = await readHooks(page);
  expect(arrived.quest.phase, 'walking up to it is the whole of that job').toBe('freeThem');
  expect(arrived.quest.instruction, 'and the job is now the axe').toBe('dad_quest_chop');
  expect(
    arrived.quest.slots.map((s) => s.kind),
    'four boxes, one per fall, all the same picture',
  ).toEqual(['tree', 'tree', 'tree', 'tree']);
  expect(arrived.quest.slots.every((s) => !s.filled), 'and every one of them empty').toBe(true);

  // --- phase two: four of the sixteen --------------------------------------
  //
  // Two blows each rather than the wood's three, which is the whole of what a
  // TINY_TREE is.
  //
  // *Any* four, which is why this counts falls rather than naming trees. The
  // sixteen stand a tile apart, so a swing aimed at one of them regularly lands
  // on the one beside it — and that is the design working rather than a miss:
  // a fall fills a box and no box cares which tree it was. A test that insisted
  // on four named trees would be asserting a rule the quest does not have.
  const fallen = (hooks: Snapshot) => penTrees(hooks).filter((t) => t.state !== 'standing').length;
  let felling = await readHooks(page);
  for (let round = 0; round < 10 && felling.quest.phase === 'freeThem'; round++) {
    const standing = penTrees(felling).filter((t) => t.state === 'standing');
    await standByTree(page, standing[round % standing.length]!.id);
    const before = fallen(await readHooks(page));
    for (let blow = 0; blow < 4; blow++) {
      await whack(page);
      felling = await readHooks(page);
      if (fallen(felling) > before) break;
    }
  }

  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'carrots',
    undefined,
    { timeout: 20_000 },
  );
  const freed = await readHooks(page);
  expect(
    fallen(freed),
    'four of them are down, and the other twelve are still standing',
  ).toBe(4);
  expect(
    freed.bunnies.every((b) => b.state === 'loose'),
    'and the bunnies are out through the gap',
  ).toBe(true);
  expect(freed.quest.instruction, 'the job is carrots now').toBe('dad_quest_carrots');
  expect(freed.quest.slots.map((s) => s.id), 'three of them, in the quest’s order').toEqual([
    'carrot_1',
    'carrot_2',
    'carrot_3',
  ]);
  expect(freed.treeGaps, 'and no frame had a felled tree with nothing drawn for it').toBe(0);

  // The gentle refusal, at the one moment it can happen: three bunnies hopping
  // about and nothing in her pocket. It costs her nothing and it names the fix
  // rather than the failure, which is what every "no" in this game does.
  await afterInstruction(page, 'dad_quest_carrots');
  await standByProp(page, freed.bunnies[0]!.id);
  await tap(page, 'KeyZ');
  const empty = await readHooks(page);
  expect(empty.voice.lineId, 'the bunny wants a carrot, says she').toBe('seraphina_need_carrot');
  expect(empty.quest.following, 'and nothing is following her').toBeNull();

  // --- phase three: three carrots, in an order the quest did not ask for ----
  for (const id of ['carrot_2', 'carrot_1', 'carrot_3']) {
    const before = await readHooks(page);
    const carrot = before.quest.objects.find((o) => o.id === id);
    expect(carrot, id + ' is lying out there').toBeDefined();
    expect(isBlocked(before, carrot!.x, carrot!.y), id + ' is on open ground').toBe(false);

    await standByProp(page, id);
    for (let press = 0; press < 5; press++) {
      if ((await readHooks(page)).quest.held.includes(id)) break;
      await tap(page, 'KeyZ');
    }
    expect((await readHooks(page)).quest.held, id + ' is hers').toContain(id);
  }

  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'lure',
    undefined,
    { timeout: 20_000 },
  );
  const carrying = await readHooks(page);
  expect(carrying.quest.held.length, 'all three carrots').toBe(3);
  expect(carrying.quest.instruction, 'and the job is the walk home').toBe('dad_quest_lure');
  expect(carrying.quest.slots.map((s) => s.kind), 'three bunny boxes now').toEqual([
    'bunny',
    'bunny',
    'bunny',
  ]);
  expect(carrying.quest.objects, 'and there is nothing left lying in the grass').toEqual([]);

  // --- phase four: one at a time, three times -------------------------------
  await afterInstruction(page, 'dad_quest_lure');
  const den = { x: Math.round(atDen.x / tile), y: Math.round(atDen.y / tile) };

  for (let trip = 1; trip <= 3; trip++) {
    const loose = (await readHooks(page)).bunnies.filter((b) => b.state === 'loose');
    expect(loose.length, String(4 - trip) + ' of them still out there').toBe(4 - trip);

    await standByProp(page, loose[0]!.id);
    for (let press = 0; press < 5; press++) {
      if ((await readHooks(page)).quest.following) break;
      await tap(page, 'KeyZ');
    }

    const tagged = await readHooks(page);
    expect(tagged.quest.following, 'one of them is walking behind her').toBe(loose[0]!.id);
    expect(bunnyState(tagged, loose[0]!.id)).toBe('following');
    expect(tagged.quest.held.length, 'and the carrot went with it').toBe(3 - trip);

    // The funny refusal, on the first trip only — once is the claim, and asking
    // it three times is three page round trips for the same answer.
    if (trip === 1 && loose[1]) {
      await standByProp(page, loose[1].id);
      await waitForQuiet(page);
      await tap(page, 'KeyZ');
      const second = await readHooks(page);
      expect(second.voice.lineId, 'one bunny at a time, and she says so').toBe(
        'seraphina_one_bunny',
      );
      expect(second.quest.following, 'the first one is still the one following').toBe(loose[0]!.id);
      expect(second.quest.held.length, 'and no second carrot was spent').toBe(3 - trip);
      expect(bunnyState(second, loose[1].id), 'the second one is still loose').toBe('loose');
    }

    // Home. Walking into the den is the whole of the deposit; there is nothing
    // to press at the far end.
    await standOnTile(page, den.x, den.y);
    // Boxes filling up, until the last one — which does not fill a box, it ends
    // the quest, and a parked phase has no row at all. That the row empties on
    // the third arrival rather than showing three ticks is the point: the job is
    // over, so there is nothing left to be told about it.
    await page.waitForFunction(
      (want) => {
        const q = (window as unknown as { __seraphina: Hooks }).__seraphina.quest;
        return want < 3 ? q.slots.filter((s) => s.filled).length === want : q.phase === 'done';
      },
      trip,
      { timeout: 20_000 },
    );

    const dropped = await readHooks(page);
    expect(dropped.quest.following, 'nothing is following her now').toBeNull();
    expect(bunnyState(dropped, loose[0]!.id), 'that one lives here').toBe('home');

    // ...and Dad counts down what is left, in a clip cut knowing the number.
    if (trip < 3) {
      await page.waitForFunction(
        (want) => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId === want,
        trip === 1 ? 'dad_two_more' : 'dad_one_more',
        { timeout: 20_000 },
      );
    }
  }

  // --- and the end of it ----------------------------------------------------
  const done = await readHooks(page);
  expect(done.quest.phase, 'the quest parks').toBe('done');
  expect(done.quest.instruction, 'so the yellow button has nothing left to say').toBeNull();
  expect(done.session.run.completed, 'the day has it down as done').toEqual(['bunny']);
  // Everything she has not done today is on offer again, the instant this one
  // parks rather than tomorrow morning: finishing one quest must not cost her
  // another. Sneak is across the village with the faeries and Morgana is at the
  // pond with the story; the man standing right here has nothing left to ask,
  // which is the other half of the same rule. See `QuestEngine.offerFrom`.
  expect(done.quest.offers.sort(), 'and everything else is going again').toEqual([
    'morgana',
    'sneak',
  ]);
  expect(done.quest.markers, 'with a thought bubble apiece, actually rebuilt').toBe(2);
  expect(done.bunnies.every((b) => b.state === 'home'), 'all three live at the den').toBe(true);
  // The coin is hers the instant the third one is home, whatever she does next —
  // the split the first quest established. See `RoomScene.bunniesAllHome`.
  expect(done.coins, 'finishing the job is worth a coin').toBe(1);
  expect(done.session.persistent.coins, 'on the side of the seam a night cannot reach').toBe(1);

  await page.waitForFunction(
    () =>
      (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId === 'dad_bunny_coin',
    undefined,
    { timeout: 30_000 },
  );
  const paid = await readHooks(page);
  expect(paid.voice.bubble.speaker, 'out of his own mouth — he is handing it over').toBe('dad');
  expect(paid.voice.words.length, 'with words on screen to light up').toBeGreaterThan(0);
  expect(paid.coins, 'and the count did not move again on the way past').toBe(1);

  // The ring lingers. It is the afternoon she had, and tidying it away the
  // instant the last bunny was home would be the game taking it back.
  expect(penTrees(paid).length, 'twelve trees and four stumps, still standing there').toBe(16);

  // A doorway undoes none of it. The bunnies live in the wood rather than in the
  // world, so the house has none — and coming back out finds all of it as it was.
  await standByProp(page, 'outside_to_house');
  expect(await walkThroughDoorway(page, 'outside_to_house'), 'indoors').toBe('house');
  expect((await readHooks(page)).bunnies, 'no bunnies in the kitchen').toEqual([]);
  expect(await walkThroughDoorway(page), 'and back out').toBe('outside');

  const back = await readHooks(page);
  expect(back.quest.phase, 'still finished').toBe('done');
  expect(back.bunnies.every((b) => b.state === 'home'), 'still all home').toBe(true);
  expect(
    fallen(back),
    'and the four she felled are still down',
  ).toBe(4);
  // Dad has walked back to his shed, now the quest has let go of him.
  const walkedBack = back.npcs.find((n) => n.id === 'dad')!;
  expect(
    Math.hypot(walkedBack.x - shed.x, walkedBack.y - shed.y),
    'and he is back where the map put him',
  ).toBeLessThan(tile);

  // --- and then the other job, on the same afternoon ------------------------
  //
  // The whole faerie quest, on top of a finished one, because the ruling is that
  // an afternoon holds both in either order — and the cheap half of proving it,
  // his cloud coming back, was asserted sixty lines up. What is left is that the
  // offer *grammar* came back with it: two presses and she is on an errand
  // again, with the store carrying this morning's finished job beside the live
  // one.
  //
  // Folded into this boot rather than given one of its own for the suite's own
  // rule: page startup is the dominant cost, and the second quest of a two-quest
  // day cannot be reached from a fresh page anyway.
  await acceptQuest(page);
  const second = await readHooks(page);
  expect(second.quest.id, 'the second job of the day is hers').toBe('faerie');
  expect(second.quest.phase, 'and it starts where it always starts').toBe('hammer');
  expect(second.quest.giver, 'his, to repeat').toBe('sneak');
  expect(second.session.run.completed, 'with the morning still down as done').toEqual(['bunny']);
  expect(second.quest.offers, 'and nothing left on offer while it runs').toEqual([]);

  await fetchHammer(page);
  for (const stone of ['ruby', 'malachite', 'sapphire']) await crack(page, stone);
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'meetAtCave',
    undefined,
    { timeout: 20_000 },
  );

  // Teleported to the cave mouth, the way the faerie test does it: that the
  // mountain path is walkable is `world.spec`'s claim and not this one's.
  await standByProp(page, 'outside_to_cave');
  expect(await walkThroughDoorway(page, 'outside_to_cave'), 'in through the mouth').toBe('cave');
  await standAt(page, 'cave_fire');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.inCircle,
    undefined,
    { timeout: 20_000 },
  );
  await ritualPress(page, 'KeyC', 'green');
  await ritualPress(page, 'KeyZ', 'blue');
  await tap(page, 'KeyX');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'done',
    undefined,
    { timeout: 20_000 },
  );

  const bothDone = await readHooks(page);
  expect(bothDone.session.run.completed, 'both jobs, in the order she did them').toEqual([
    'bunny',
    'faerie',
  ]);
  expect(bothDone.faeries.length, 'three faeries out of the fire').toBe(3);
  expect(bothDone.coins, 'and a coin apiece, which is two of her three boxes').toBe(2);
  // Two of the three jobs are behind her and the third is Morgana's, so there is
  // exactly one cloud left in the sky and it is over the girl who wants a story.
  // Neither Sneak nor Dad has anything left to ask.
  expect(bothDone.quest.offers, 'and Morgana still has a story to be read').toEqual(['morgana']);
  expect(bothDone.quest.markers, 'one cloud left, and only one').toBe(1);

  // Out of the cave, and back to the wood she cleared this morning. This is the
  // rebuild that would have swallowed it: the ring and the bunnies belong to a
  // quest that is not the active one any more, and they are still hers.
  expect(await walkThroughDoorway(page), 'back out under the sky').toBe('outside');
  const wood = await readHooks(page);
  expect(penTrees(wood).length, 'the ring is still standing in the clearing').toBe(16);
  expect(fallen(wood), 'four of it still down').toBe(4);
  expect(
    wood.bunnies.every((b) => b.state === 'home'),
    'and the three she walked home still live at the den',
  ).toBe(true);

  // --- and then she goes to bed and says what her day was ------------------
  //
  // Folded in here rather than booted on its own, for the reason the faerie
  // night test gives: everything above exists to build a day worth reciting,
  // and this is the only afternoon in the suite that has bunnies in it. Three
  // things happened — the faeries, the bunnies, and four trees down — and only
  // two are ever said, so this settles the order as well as the count: both
  // finished jobs are said and the wood is the one that gets cut.
  await standByProp(page, 'outside_to_house');
  expect(await walkThroughDoorway(page, 'outside_to_house'), 'indoors for the night').toBe('house');
  await standByProp(page, 'bed');
  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).sleeps > 0) break;
    await tap(page, 'KeyZ');
  }
  await page.waitForFunction(
    () =>
      (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId ===
      'seraphina_goodnight',
    undefined,
    { timeout: 30_000 },
  );
  expect(
    (await readHooks(page)).recap,
    'the faeries, then the bunnies, then goodnight — and the wood cut for room',
  ).toEqual(['seraphina_recap_faeries', 'seraphina_recap_bunnies', 'seraphina_goodnight']);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
