import { test, expect, type Page } from '@playwright/test';
import {
  bootGame,
  isBlocked,
  readHooks,
  standByProp,
  standNear,
  standOnTile,
  tap,
  waitForQuiet,
  waitForVoice,
  walkThroughDoorway,
  type Hooks,
} from './harness';

/** The reading nook, in tiles. See NOOK in `src/quest/quests.ts`. */
const NOOK = { x: 28.5, y: 7.5 };

/**
 * Book #1's sentences, written out so this test is a second opinion rather than
 * a second copy: they are canon (Matt, 2026-08-14), and what is being checked is
 * that `content/books/`, the voice manifest and the page on screen all still say
 * the same words.
 */
const PAGES = [
  'Pip the dog zoomed up to the moon!',
  'On the moon Pip met a baby dragon!',
  'The dragon sneezed sparkles all over Pip!',
  'Now Pip and the dragon are best friends!',
];

/**
 * Wait for something the game keeps to become true.
 *
 * The predicate runs *in the page*, so it may not close over anything out here —
 * every one below reaches for the hooks itself, which is the same shape every
 * wait in this suite has. Waiting on numbers the game keeps rather than on a
 * stopwatch is the only version of this that is not a guess about the frame
 * rate, and a page of a book takes as long as its clip takes.
 */
const until = (page: Page, pred: () => boolean, timeout = 30_000) =>
  page.waitForFunction(pred, undefined, { timeout });

/**
 * Turn the page she is on, once it will let her.
 *
 * Pressed until the turn counter moves rather than exactly once, the same as
 * every other press in this suite: one that lands inside a frame the page
 * skipped is gone, and a repeat can do nothing worse than turn a page that has
 * already turned — which the counter is what rules out.
 */
async function turnPage(page: Page) {
  await until(
    page,
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.book.turnable,
  );
  const before = (await readHooks(page)).book.turns;

  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).book.turns > before) return;
    await tap(page, 'KeyZ');
  }
  throw new Error(`the page never turned: ${JSON.stringify((await readHooks(page)).book)}`);
}

/**
 * Storytime, end to end: the book off the shelf, the walk to the rug, and four
 * pages read aloud with the word being spoken lit up.
 *
 * One boot for the whole quest, the way the other two are, and for the same
 * reason: what is worth proving is that the store, the engine, the reader and
 * the scene agree from the offer to the coin, and no phase can be asked that in
 * isolation. Everything the walk is not about is teleported past — that the
 * village is crossable on foot is `world.spec`'s claim, and this test's subject
 * starts at the bookshelf.
 *
 * **The morning is stood in for.** Hazel carries two of the three quests and one
 * head wears one thought bubble, so the story is only ever offered on an
 * afternoon the bunnies are already home — see `QuestEngine.offerFrom`.
 * `quest.spec` plays that afternoon honestly and it costs a minute and a half;
 * `finishQuest` writes it down instead, which is the same standing-in
 * `grantCoin` is and for the same reason: the state is otherwise unreachable
 * from a fresh page inside one test's budget.
 *
 * The three things asked hardest are the three the design is actually about:
 * green during a read does *nothing* and costs her nothing, the word being
 * spoken is the word lit up, and closing the book comes back to the page she
 * left. A test that only counted pages turning would pass against a reader with
 * none of the three.
 */
test('storytime: a book off the shelf, and four pages read aloud on the rug', async ({
  page,
}) => {
  const { errors } = await bootGame(page);
  await waitForVoice(page);

  const morning = await readHooks(page);
  expect(morning.quest.offers.sort(), 'two people with something to ask').toEqual([
    'hazel',
    'sneak',
  ]);

  // This morning's job, written down rather than lived. Hazel's first is the
  // bunnies and her second is the story, and one cloud cannot offer both.
  await page.evaluate(() =>
    (window as unknown as { __seraphina: Hooks }).__seraphina.finishQuest('bunny'),
  );

  const afternoon = await readHooks(page);
  expect(afternoon.session.run.completed, 'the bunnies are down as done').toEqual(['bunny']);
  expect(
    afternoon.quest.offers.sort(),
    'and she is asking again, for the other one',
  ).toEqual(['hazel', 'sneak']);

  // Take it. Two presses, both of them her talking.
  await standNear(page, 'hazel', { y: 72 });
  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).quest.id) break;
    await tap(page, 'KeyZ');
  }

  const taken = await readHooks(page);
  expect(taken.quest.id, 'the second of her jobs is hers').toBe('story');
  expect(taken.quest.phase, 'and it starts at the bookshelf').toBe('getBook');
  expect(taken.quest.giver, 'hers to repeat, in her voice').toBe('hazel');
  expect(taken.quest.instruction).toBe('hazel_story_book');
  expect(taken.quest.offers, 'and nothing is on offer while it runs').toEqual([]);
  // She has gone on ahead — and ahead is through a door this time, which is the
  // first quest that moves somebody out of the zone the job was taken in.
  expect(
    taken.npcs.map((n) => n.id),
    'so she is not standing by the pond any more',
  ).not.toContain('hazel');

  // --- phase one: the book off the shelf ------------------------------------
  await standByProp(page, 'outside_to_house');
  expect(await walkThroughDoorway(page, 'outside_to_house'), 'indoors').toBe('house');

  const indoors = await readHooks(page);
  const hazel = indoors.npcs.find((n) => n.id === 'hazel');
  expect(hazel, 'and she is in here, on the rug').toBeDefined();
  const tile = indoors.world.tile;
  expect(
    Math.hypot(hazel!.x - NOOK.x * tile, hazel!.y - NOOK.y * tile),
    'a stride from the spot the story gets read on',
  ).toBeLessThan(tile * 2.5);

  const shelved = indoors.quest.objects.find((o) => o.id === 'storybook');
  expect(shelved, 'the storybook is out').toBeDefined();
  expect(isBlocked(indoors, shelved!.x, shelved!.y), 'somewhere she can stand').toBe(false);
  expect(
    indoors.quest.slots.map((s) => s.kind),
    'one box on the row, and it is a book',
  ).toEqual(['storybook']);

  await standByProp(page, 'storybook');
  await waitForQuiet(page);

  // She names it as she straightens up, in her own balloon. The watcher is armed
  // *before* the press and polls every frame: picking it up ends the phase, a
  // phase ends with its next instruction spoken a beat later, and a reading
  // taken after a round trip to a page running at a dozen frames a second lands
  // on either side of that beat at random. See `afterInstruction` in quest.spec
  // for the same trap from the other end.
  const named = until(page, () => {
    const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
    return h.voice.lineId === 'seraphina_storybook' && h.voice.bubble.speaker === 'seraphina';
  });

  for (let press = 0; press < 5; press++) {
    if ((await readHooks(page)).quest.held.includes('storybook')) break;
    await tap(page, 'KeyZ');
  }
  await named;
  expect((await readHooks(page)).quest.held, 'it is hers').toContain('storybook');

  // --- phase two: across the room -------------------------------------------
  await until(
    page,
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'toHazel',
  );
  await standOnTile(page, NOOK.x, NOOK.y);
  await until(
    page,
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'read',
  );

  const sat = await readHooks(page);
  expect(sat.quest.instruction, 'and the job is the green button').toBe('hazel_story_read');
  expect(
    sat.quest.objects.find((o) => o.id === 'storybook'),
    'the book is lying open on the rug',
  ).toBeDefined();

  // --- phase three: the story -----------------------------------------------
  //
  // The dot has to be over the *book* and not over Hazel sitting beside her:
  // green is a promise, and the two of them are two tiles apart precisely so
  // that standing on one puts the other out of reach. `standByProp` does not
  // return until the book is the nearest thing to her.
  await standByProp(page, 'storybook');
  await waitForQuiet(page);
  expect((await readHooks(page)).promptDot, 'with a green dot over it').toBe(true);

  await tap(page, 'KeyZ');
  await until(page, () => (window as unknown as { __seraphina: Hooks }).__seraphina.book.open);

  const opened = await readHooks(page);
  expect(opened.book.id, 'book number one').toBe('pip-moon');
  expect(opened.book.pages, 'four pages').toBe(4);
  expect(opened.book.page, 'open at the first').toBe(0);
  expect(opened.book.reading, 'and reading itself the moment it opens').toBe(true);
  expect(opened.book.line).toBe('book_pip_moon_1');
  expect(opened.book.words.join(' '), 'with the sentence on the page').toBe(PAGES[0]);
  expect(opened.voice.lineId, 'and that is what the game reports as being spoken').toBe(
    'book_pip_moon_1',
  );

  // The mechanic the whole feature exists for: the word being said is the word
  // lit up, driven by the audio clock, on a page rather than in a balloon.
  await until(
    page,
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.book.highlighted > 0,
  );
  const lit = await readHooks(page);
  expect(
    lit.book.words[lit.book.highlighted],
    'some way into the sentence, one word at a time',
  ).toBe(PAGES[0]!.split(' ')[lit.book.highlighted]);

  // Green, mid-sentence. It does nothing, and nothing is the correct amount to
  // happen: she cannot skip a sentence and she is never told she pressed early.
  await tap(page, 'KeyZ');
  const mashed = await readHooks(page);
  expect(mashed.book.page, 'still the first page').toBe(0);
  expect(mashed.book.turns, 'and nothing was turned').toBe(0);

  // The sentence finishes on its own, and only then does green mean anything.
  await until(
    page,
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.book.turnable,
  );
  expect((await readHooks(page)).book.reading, 'the page has read itself out').toBe(false);

  // Yellow reads it again — the same thing yellow does everywhere else in this
  // game. Asked here rather than mid-sentence because "reading again" is only a
  // claim you can make of a page that had stopped: the transition it has to
  // produce is finished-and-turnable back to reading-and-not.
  await tap(page, 'KeyY');
  await until(page, () => {
    const book = (window as unknown as { __seraphina: Hooks }).__seraphina.book;
    return book.reading && !book.turnable;
  }, 5_000);
  expect((await readHooks(page)).book.line, 'the same page, from the top').toBe(
    'book_pip_moon_1',
  );

  // Over the page. Hazel says what she thought of it before the next one starts.
  await turnPage(page);
  await until(
    page,
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.book.page === 1,
  );
  await until(
    page,
    () =>
      (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId ===
      'hazel_book_moon',
  );

  const cheered = await readHooks(page);
  expect(cheered.voice.bubble.speaker, 'out of her own mouth').toBe('hazel');
  expect(cheered.book.reading, 'and the new page waits until she has finished').toBe(false);
  expect(cheered.book.words.join(' '), 'while showing what it is about to read').toBe(
    PAGES[1],
  );

  // --- red: never a failure, and never a step backwards ---------------------
  await tap(page, 'KeyC');
  await until(page, () => !(window as unknown as { __seraphina: Hooks }).__seraphina.book.open);

  const shut = await readHooks(page);
  expect(shut.quest.phase, 'the quest is exactly where it was').toBe('read');
  expect(shut.session.run.quest?.done, 'with the page she finished written down').toEqual([
    'page_1',
  ]);
  expect(
    shut.interactables.some((i) => i.id === 'storybook'),
    'and the book still lying there with a dot over it',
  ).toBe(true);

  await tap(page, 'KeyZ');
  await until(page, () => (window as unknown as { __seraphina: Hooks }).__seraphina.book.open);
  expect((await readHooks(page)).book.page, 'reopening comes back to the same page').toBe(1);

  // --- the rest of the story ------------------------------------------------
  for (const index of [1, 2, 3]) {
    const showing = await readHooks(page);
    expect(showing.book.words.join(' '), `page ${index + 1} says its own sentence`).toBe(
      PAGES[index],
    );
    await turnPage(page);
    if (index < 3) {
      await page.waitForFunction(
        (want) => (window as unknown as { __seraphina: Hooks }).__seraphina.book.page === want,
        index + 1,
        { timeout: 30_000 },
      );
    }
  }

  // --- and the end of it ----------------------------------------------------
  await until(
    page,
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.quest.phase === 'done',
  );
  const done = await readHooks(page);
  expect(done.book.open, 'the book closes into the end of the quest').toBe(false);
  expect(done.quest.instruction, 'so the yellow button has nothing left to say').toBeNull();
  expect(done.session.run.completed, 'and the day has both jobs down as done').toEqual([
    'bunny',
    'story',
  ]);
  // The coin is hers the instant the last page turns, whatever she does next —
  // the split both the other quests established.
  expect(done.coins, 'finishing the job is worth a coin').toBe(1);
  expect(done.session.persistent.coins, 'on the side of the seam a night cannot reach').toBe(
    1,
  );

  await until(
    page,
    () =>
      (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId ===
      'hazel_story_coin',
  );
  const paid = await readHooks(page);
  expect(paid.voice.bubble.speaker, 'handed over out of her own mouth').toBe('hazel');
  expect(paid.voice.words.length, 'with words on screen to light up').toBeGreaterThan(0);
  expect(paid.coins, 'and the count did not move again on the way past').toBe(1);

  // --- and then she goes to bed and says what her day was -------------------
  //
  // Two finished jobs and only two slots, so this settles the story line's place
  // in the order as well as the fact of it: the bunnies first, the story under
  // them, and goodnight after both. See `src/state/recap.ts`.
  await standByProp(page, 'bed');
  for (let press = 0; press < 6; press++) {
    if ((await readHooks(page)).sleeps > 0) break;
    await tap(page, 'KeyZ');
  }
  await until(
    page,
    () =>
      (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId ===
      'seraphina_goodnight',
  );
  expect((await readHooks(page)).recap, 'the bunnies, then the story, then goodnight').toEqual(
    ['seraphina_recap_bunnies', 'seraphina_recap_story', 'seraphina_goodnight'],
  );

  expect(errors, 'no uncaught page errors').toEqual([]);
});
