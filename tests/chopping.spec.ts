import { test, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  bootGame,
  freeze,
  isBlocked,
  readHooks,
  snap,
  standByProp,
  standByTree,
  tap,
  walk,
  type Hooks,
  type Snapshot,
} from './harness';

/**
 * One blow, landed — not one press, sent.
 *
 * The two are deliberately not the same thing. A press during a swing is
 * swallowed and a press during a fall spends the swing without landing
 * anything, because holding the green button is meant to be a rhythm rather
 * than a stutter. So this waits for her to have her feet under her, presses,
 * and then waits for the game to say a blow landed — and presses again if it
 * did not. Waiting on the number the game keeps rather than on a stopwatch is
 * the only version of this that is not a guess about the frame rate.
 */
async function whack(page: Page) {
  const before = (await readHooks(page)).whacks;

  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForFunction(
      () => !(window as unknown as { __seraphina: Hooks }).__seraphina.player.anim.startsWith('chop'),
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
      // The press landed inside a swing, or inside the fall it started. Both
      // are the game working; go round again.
    }
  }

  throw new Error('the axe never landed');
}

async function chop(page: Page, times: number) {
  for (let i = 0; i < times; i++) await whack(page);
}

/**
 * Every distinct frame each visible layer draws across one whole swing.
 *
 * Sampled inside the page, once per rendered frame. The swing is half a second
 * of six frames and a round trip to this page is most of a frame, so a sampler
 * living in node would be reading three or four points off it and calling the
 * gaps evidence. It starts collecting before the press and stops when the swing
 * does, so the window is the swing itself rather than a guess at how long one
 * takes on a machine rendering this slowly.
 *
 * Retried, because a press can still be swallowed — see `whack` above.
 */
async function framesAcrossASwing(page: Page): Promise<Record<string, number[]>> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForFunction(
      () => !(window as unknown as { __seraphina: Hooks }).__seraphina.player.anim.startsWith('chop'),
      undefined,
      { timeout: 20_000 },
    );

    const sampling = page.evaluate((capMs) => {
      return new Promise<Record<string, number[]>>((resolve) => {
        const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
        const seen: Record<string, Set<number>> = {};
        const deadline = performance.now() + capMs;
        let swinging = false;

        const tick = () => {
          const now = h.player.anim.startsWith('chop');
          if (now) {
            swinging = true;
            for (const [layer, frame] of Object.entries(h.player.frames)) {
              (seen[layer] ??= new Set<number>()).add(frame);
            }
          }
          // Done when the swing she was started for has finished, or when it
          // never began — a swallowed press is the caller's problem, not a hang.
          if ((swinging && !now) || performance.now() > deadline) {
            resolve(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v]])));
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, 2_500);

    await tap(page, 'KeyZ');
    const drawn = await sampling;
    if (Object.keys(drawn).length > 0) return drawn;
  }

  throw new Error('she never swung');
}

/**
 * The emptiest tile in the zone: the one furthest from anything the green
 * button could be about.
 *
 * "Nothing in reach" is a hard thing to arrange by hand in a world with two
 * hundred trees and ten props in it, and a spot picked by eye would quietly stop
 * being empty the first time somebody moved a bench. So it is searched for, over
 * the same collision grid the game uses, and the distance it found is returned
 * with it — a caller that needs real clearance can insist on it rather than hope.
 */
function emptyGround(hooks: Snapshot): { x: number; y: number; clear: number } {
  const { tile, cols, rows } = hooks.world;
  const standing = hooks.trees.filter((t) => t.state !== 'gone');
  let best = { x: 0, y: 0, clear: -1 };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * tile + tile / 2;
      const y = row * tile + tile / 2;
      if (isBlocked(hooks, x, y)) continue;

      let clear = Infinity;
      for (const thing of hooks.interactables) {
        clear = Math.min(clear, Math.hypot(thing.x - x, thing.y - y));
      }
      for (const tree of standing) {
        clear = Math.min(clear, Math.hypot(tree.x - x, tree.y - y));
      }
      if (clear > best.clear) best = { x, y, clear };
    }
  }

  if (best.clear < hooks.interactRadius) {
    throw new Error(`nowhere in ${hooks.room} is out of reach of everything`);
  }
  return best;
}

const teleport = (page: Page, to: { x: number; y: number }) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [to.x, to.y],
  );

/** Her tile, and a tree's. Everything below is about whether they can be equal. */
const cellOf = (hooks: Snapshot, x: number, y: number) => ({
  col: Math.floor(x / hooks.world.tile),
  row: Math.floor(y / hooks.world.tile),
});

const treeNow = (hooks: Snapshot, id: string) => hooks.trees.find((t) => t.id === id)!;

/**
 * A tree she can get to and hit *on its own*.
 *
 * Two conditions. She has to be able to stand next to it — a trunk walled in by
 * the trees behind it is scenery, not a target — and nothing the green button
 * would rather press may be anywhere near it. The second is stricter than it
 * used to be, because the button's rule is: a dotted thing in reach wins, and
 * only when there is none does the axe come out. Five tiles of clearance is
 * enough that standing within arm's reach of the trunk still leaves every prop
 * further from her than the button's own radius.
 *
 * The west wall is one trunk in every row, so "an unchoppable tree" and "an
 * unchoppable tree she can aim at" are genuinely different sets, and a test that
 * picked from the first would be flaky about which trunk it hit.
 */
function pickTree(hooks: Snapshot, choppable: boolean, skip: string[] = []) {
  const { tile, cols, rows } = hooks.world;
  const standable = (col: number, row: number) =>
    col >= 0 &&
    row >= 0 &&
    col < cols &&
    row < rows &&
    !isBlocked(hooks, col * tile + tile / 2, row * tile + tile / 2);

  const away = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const tree = hooks.trees
    .filter((t) => t.choppable === choppable && t.state === 'standing' && !skip.includes(t.id))
    .filter((t) => {
      const { col, row } = cellOf(hooks, t.x, t.y);
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) =>
        standable(col + dc!, row + dr!),
      );
    })
    .filter((t) => hooks.interactables.every((other) => away(other, t) > tile * 5))
    .sort((a, b) => away(a, hooks.player) - away(b, hooks.player))[0];

  if (!tree) throw new Error(`no reachable ${choppable ? '' : 'un'}choppable tree in ${hooks.room}`);
  return tree;
}

test('three whacks fell a tree, two more give the ground back', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  const target = pickTree(start, true);
  const { col, row } = cellOf(start, target.x, target.y);
  expect(isBlocked(start, target.x, target.y), 'a standing trunk is solid').toBe(true);

  await standByTree(page, target.id);
  // Four boxes with the axe in the first and three drawn empty, and the blue
  // dot that says which button changes them. Evidence for the report.
  await snap(page, '50-tool-row.png');

  await chop(page, 3);

  const felled = await readHooks(page);
  expect(treeNow(felled, target.id).state, 'three whacks and it is a stump').toBe('stump');
  expect(felled.whacks, 'three blows landed').toBeGreaterThanOrEqual(3);
  // And the ground was never bare. A tree pivots out of its own tile in the
  // first fifth of its fall, so a stump raised when the fall *lands* leaves half
  // a second of grass where a tree was standing — one beat of the world
  // forgetting itself, which no screenshot can be pointed at. The game counts
  // every frame in which a tree that still exists has nothing drawn for it, and
  // the number this test is about is zero. See `treeGaps`.
  expect(
    felled.treeGaps,
    'and at no point was the trunk gone with no stump in its place',
  ).toBe(0);
  expect(isBlocked(felled, target.x, target.y), 'a stump still stands in the trunk’s tile').toBe(
    true,
  );
  await snap(page, '52-felled.png');

  await chop(page, 2);

  const cleared = await readHooks(page);
  expect(treeNow(cleared, target.id).state, 'two more and the stump pops').toBe('gone');
  expect(cleared.treeGaps, 'still nothing missing from the world').toBe(0);
  expect(
    isBlocked(cleared, target.x, target.y),
    'and the tile is walkable — the live grid, not the one the map file shipped',
  ).toBe(false);

  // The claim is not that a character in a string changed. It is that she can
  // walk where the tree was, so she walks there — one axis at a time, aiming at
  // the middle of the tile the trunk was standing in.
  for (let hop = 0; hop < 10; hop++) {
    const here = await readHooks(page);
    const at = cellOf(here, here.player.x, here.player.y);
    if (at.col === col && at.row === row) break;

    const dx = target.x - here.player.x;
    const dy = target.y - here.player.y;
    const alongX = Math.abs(dx) >= Math.abs(dy);
    await walk(
      page,
      alongX
        ? dx > 0
          ? 'ArrowRight'
          : 'ArrowLeft'
        : dy > 0
          ? 'ArrowDown'
          : 'ArrowUp',
      150,
    );
  }

  const stood = await readHooks(page);
  expect(
    cellOf(stood, stood.player.x, stood.player.y),
    'she is standing in the tile the tree was standing in',
  ).toEqual({ col, row });

  // And the swing itself, mid-flight, off a second tree — the first one is a
  // hole in the ground by now. Frozen, because the arc is drawn on one frame of
  // six and a screenshot round trip outlives the whole swing.
  const next = pickTree(stood, true, [target.id]);
  await standByTree(page, next.id);
  await tap(page, 'KeyZ');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.player.anim.startsWith('chop'),
    undefined,
    { timeout: 10_000 },
  );
  // Frozen the instant the swing is seen, with nothing waited out in between:
  // the whole swing is half a second and a round trip to this page is most of a
  // frame, so anything added here is the difference between a picture of the
  // axe and a picture of her standing next to a tree.
  await freeze(page);
  await snap(page, '51-chop.png');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a tree the boundary needs shakes, sheds leaves, and never comes down', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  const target = pickTree(start, false);
  await standByTree(page, target.id);

  const before = await readHooks(page);
  await chop(page, 3);
  const after = await readHooks(page);

  // Everything reacts. Nothing is a dead end. She will absorb "some trees are
  // too big" from this without being told, which is the only way she could.
  expect(after.whacks - before.whacks, 'every blow landed on it').toBe(3);
  expect(after.peakParticles, 'and threw leaves each time').toBeGreaterThan(0);

  expect(treeNow(after, target.id).state, 'but it is still a whole tree').toBe('standing');
  expect(isBlocked(after, target.x, target.y), 'and still solid').toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the blue button cycles the held tool, and the axe never leaves slot one', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  expect(start.tools.slots, 'four boxes, the axe in the first and three empty').toEqual([
    'axe',
    null,
    null,
    null,
  ]);
  expect(start.tools.held).toBe(0);
  expect(start.tools.holding).toBe('axe');

  // With one tool the button is a visible no-op — the row bounces and the held
  // box does not move. The path is real either way, which is the point: she has
  // to have found the button before there is anything to find with it.
  await tap(page, 'KeyX');
  const alone = await readHooks(page);
  expect(alone.tools.held, 'nothing to cycle to').toBe(0);
  expect(alone.tools.holding).toBe('axe');

  // The quest system's verb, ahead of the quest system.
  const slot = await page.evaluate(() =>
    (window as unknown as { __seraphina: Hooks }).__seraphina.giveTool('hammer'),
  );
  expect(slot, 'a granted tool goes in the first empty box').toBe(1);

  await tap(page, 'KeyX');
  const second = await readHooks(page);
  expect(second.tools.held, 'the blue button moves along the row').toBe(1);
  expect(second.tools.holding).toBe('hammer');

  await tap(page, 'KeyX');
  const wrapped = await readHooks(page);
  expect(wrapped.tools.held, 'and wraps back round, skipping the empty boxes').toBe(0);
  expect(wrapped.tools.holding).toBe('axe');

  // The axe is welded in. Whoever asks, however they ask.
  const tookAxe = await page.evaluate(() =>
    (window as unknown as { __seraphina: Hooks }).__seraphina.takeTool('axe'),
  );
  expect(tookAxe, 'the axe cannot be taken away').toBe(false);

  const tookHammer = await page.evaluate(() =>
    (window as unknown as { __seraphina: Hooks }).__seraphina.takeTool('hammer'),
  );
  expect(tookHammer, 'a granted tool can be').toBe(true);

  const end = await readHooks(page);
  expect(end.tools.slots).toEqual(['axe', null, null, null]);
  expect(end.tools.held, 'and the light never sits on an empty box').toBe(0);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The dot is a selection, and a tree is not one.
 *
 * She walks through two hundred trees; a dot hopping from trunk to trunk beside
 * her would be answering a question nobody asked, on every step of every wood.
 * The button still swings at the nearest one — which is the half of this worth
 * asserting, because "no dot" would be very easy to deliver by taking the tree
 * off the button as well.
 */
test('a tree takes the green button without taking the green dot', async ({ page }) => {
  const { errors } = await bootGame(page);

  // The well first, so this says the dot still works rather than only that it
  // is missing here.
  await standByProp(page, 'well');
  expect((await readHooks(page)).promptDot, 'the well asks to be pressed').toBe(true);

  const choppable = pickTree(await readHooks(page), true);
  await standByTree(page, choppable.id);
  const atChoppable = await readHooks(page);
  expect(atChoppable.promptDot, 'a tree she can fell does not').toBe(false);
  await snap(page, '53-tree-no-dot.png');

  // And it is still hers to swing at.
  await whack(page);
  expect(
    (await readHooks(page)).whacks,
    'the green button still puts the axe in it',
  ).toBeGreaterThan(atChoppable.whacks);

  // The unchoppable ones too — they are a different flag in the layout, and the
  // dot was not theirs to keep either.
  const fixed = pickTree(await readHooks(page), false);
  await standByTree(page, fixed.id);
  expect((await readHooks(page)).promptDot, 'nor does one she cannot').toBe(false);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * Every swing animates — the second one as much as the first.
 *
 * She is a stack of seven sprites playing one animation between them, and the
 * axe is the only one of the seven that draws nothing outside the swing. So it
 * is the only one whose animation name does not change between swings, and the
 * only one a "do not restart what is already playing" guard can freeze on the
 * last frame of the previous swing. From the outside that is an axe that hangs
 * in the air while she chops, on every swing after the first, and the hooks say
 * `chop-down` throughout either way.
 *
 * Three swings at an unchoppable tree: it never changes state, so all three are
 * the same swing in the same direction at the same target, which is exactly the
 * repeat the guard used to swallow.
 */
test('every swing animates, not just the first', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  const target = pickTree(start, false);
  await standByTree(page, target.id);

  const swings = [
    await framesAcrossASwing(page),
    await framesAcrossASwing(page),
    await framesAcrossASwing(page),
  ];

  for (let i = 0; i < swings.length; i++) {
    const swing = swings[i]!;
    expect(Object.keys(swing), `swing ${i + 1}: the axe is in her hands`).toContain('seraphina-axe');
    for (const [layer, frames] of Object.entries(swing)) {
      expect(
        frames.length,
        `swing ${i + 1}: ${layer} drew frames ${frames.join(',')} — a swing is six of them`,
      ).toBeGreaterThanOrEqual(3);
    }
  }

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The green button is about the thing in front of her first, and the axe second.
 *
 * She carries the axe everywhere and there is no putting it down, so "green
 * swings" and "green opens the door" cannot both be unconditional. The order is
 * the one a four-year-old already expects from every other button she has
 * pressed: if there is something here, do that; only when there is nothing does
 * the tool come out. A door that had to be approached with an empty hand would be
 * a door she could lock herself out of.
 */
test('a door in reach takes the green button before the axe does', async ({ page }) => {
  const { errors } = await bootGame(page);

  await standByProp(page, 'outside_to_house');

  const outside = await readHooks(page);
  expect(outside.tools.holding, 'the axe is in her hand the whole time').toBe('axe');
  expect(outside.promptDot, 'and the door is the thing asking to be pressed').toBe(true);

  await tap(page, 'KeyZ');
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
      return h.room === 'house' && !h.transitioning;
    },
    undefined,
    { timeout: 20_000 },
  );

  const inside = await readHooks(page);
  expect(inside.room, 'green opened the door').toBe('house');
  expect(inside.swings, 'and she never swung at it').toBe(outside.swings);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * A swing at nothing is still a swing.
 *
 * The alternative — green doing nothing at all when nothing is in reach — is the
 * version that reads as a broken button, because from where she is sitting a
 * press that produces silence is indistinguishable from a game that has stopped
 * working. So the axe comes out in the middle of an empty field, the arc plays in
 * full, there is a breath of air, and the world is exactly as it was.
 *
 * The second half is the one worth guarding: a whiff that quietly hit something
 * off screen would pass every animation assertion here.
 */
test('green in an empty field swings at the air and changes nothing', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  await teleport(page, emptyGround(start));
  await page.waitForTimeout(200);

  const before = await readHooks(page);
  const near = (t: { x: number; y: number }) =>
    Math.hypot(t.x - before.player.x, t.y - before.player.y);
  expect(before.promptDot, 'nothing here asks to be pressed').toBe(false);
  expect(
    before.trees.filter((t) => t.state !== 'gone').every((t) => near(t) > before.interactRadius),
    'and no trunk is within reach either — the search found honest emptiness',
  ).toBe(true);

  const drawn = await framesAcrossASwing(page);
  expect(Object.keys(drawn), 'the axe is still drawn for a swing at nothing').toContain(
    'seraphina-axe',
  );
  for (const [layer, frames] of Object.entries(drawn)) {
    expect(
      frames.length,
      `${layer} drew frames ${frames.join(',')} — a whiff is the whole animation, not a stub`,
    ).toBeGreaterThanOrEqual(3);
  }

  const after = await readHooks(page);
  expect(after.swings, 'the swing was counted').toBe(before.swings + 1);
  expect(after.whacks, 'and nothing was hit by it').toBe(before.whacks);
  expect(
    after.trees.map((t) => t.state),
    'every tree in the zone is exactly as it was',
  ).toEqual(before.trees.map((t) => t.state));
  expect(after.sparkles, 'and nothing was poked').toBe(before.sparkles);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * Swing and walk at the same time, sampled inside the page.
 *
 * The swing used to nail her feet to the floor for half a second, which is the
 * smallest fail state a game can have and still have one: the controls stop
 * answering, and the only way to learn why is to already know. Now she keeps
 * walking, the blow stays aimed where it was aimed, and the picture is the
 * swing's for its whole duration — her feet slide, and that is the accepted cost.
 *
 * Both halves have to be asserted together. Displacement alone would also be
 * true of a swing that was cancelled the moment she moved, and frames alone would
 * be true of the old locked version. The sampler lives in the page for the same
 * reason `framesAcrossASwing`'s does: the window is half a second and a round trip
 * is most of a frame of it.
 */
async function swingWhileWalking(page: Page, key: string) {
  await page.keyboard.down(key);
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.waitForFunction(
        () =>
          !(window as unknown as { __seraphina: Hooks }).__seraphina.player.anim.startsWith('chop'),
        undefined,
        { timeout: 20_000 },
      );

      const sampling = page.evaluate((capMs) => {
        return new Promise<{
          from: { x: number; y: number } | null;
          to: { x: number; y: number };
          anims: string[];
          frames: Record<string, number[]>;
        }>((resolve) => {
          const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
          const seen: Record<string, Set<number>> = {};
          const anims = new Set<string>();
          const deadline = performance.now() + capMs;
          let from: { x: number; y: number } | null = null;
          let to = { x: 0, y: 0 };

          const tick = () => {
            const swinging = h.player.anim.startsWith('chop');
            if (swinging) {
              from ??= { x: h.player.x, y: h.player.y };
              to = { x: h.player.x, y: h.player.y };
              anims.add(h.player.anim);
              for (const [layer, frame] of Object.entries(h.player.frames)) {
                (seen[layer] ??= new Set<number>()).add(frame);
              }
            }
            if ((from && !swinging) || performance.now() > deadline) {
              resolve({
                from,
                to,
                anims: [...anims],
                frames: Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v]])),
              });
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }, 2_500);

      await tap(page, 'KeyZ');
      const swing = await sampling;
      if (swing.from) return swing as typeof swing & { from: { x: number; y: number } };
    }
    throw new Error('she never swung while walking');
  } finally {
    await page.keyboard.up(key);
  }
}

test('she can walk while she swings, and the swing keeps the picture', async ({ page }) => {
  const { errors } = await bootGame(page);

  // The same empty field the whiff uses: a swing that connected with something
  // would fell it, and a felled tree changes what is under her feet mid-test.
  const start = await readHooks(page);
  await teleport(page, emptyGround(start));
  await page.waitForTimeout(200);

  // Somewhere to actually go. Walking into a wall is nought pixels of
  // displacement, and would read here as a movement lock that is still in place.
  const here = await readHooks(page);
  const { tile } = here.world;
  const ways = [
    { key: 'ArrowRight', dx: 1, dy: 0 },
    { key: 'ArrowLeft', dx: -1, dy: 0 },
    { key: 'ArrowDown', dx: 0, dy: 1 },
    { key: 'ArrowUp', dx: 0, dy: -1 },
  ];
  const open = ways.find((way) =>
    [1, 2, 3].every(
      (step) =>
        !isBlocked(here, here.player.x + way.dx * tile * step, here.player.y + way.dy * tile * step),
    ),
  );
  if (!open) throw new Error('the emptiest field in the zone has nowhere to walk to');

  const swing = await swingWhileWalking(page, open.key);

  const moved = Math.hypot(swing.to.x - swing.from!.x, swing.to.y - swing.from!.y);
  expect(moved, 'she covered ground with the axe over her head').toBeGreaterThan(30);

  expect(Object.keys(swing.frames), 'and the axe was drawn while she did it').toContain(
    'seraphina-axe',
  );
  for (const [layer, frames] of Object.entries(swing.frames)) {
    expect(
      frames.length,
      `${layer} drew frames ${frames.join(',')} — the swing animated while she walked`,
    ).toBeGreaterThanOrEqual(3);
  }

  // And nothing else got a turn at the picture. A walk frame in here is the
  // guard in `apply()` letting a walk request through mid-chop, which is what
  // used to be prevented by taking her legs away instead.
  expect(
    swing.anims.every((anim) => anim.startsWith('chop')),
    `the chop owned the animation throughout — saw ${swing.anims.join(', ')}`,
  ).toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The build gate, run as a build.
 *
 * `--check` builds every zone and runs every assert without writing anything,
 * so this is the code path the world is actually generated by rather than a
 * second implementation of it that could agree with itself while both are
 * wrong. The pass it exists for is the third in `assertWalledIn`: the boundary
 * has to hold with every choppable tree in the world already felled, because
 * she has an axe and all the time in the world.
 */
test('she cannot chop her way out of the map', () => {
  // Straight to the generator, through the same runner `npm run world:build`
  // uses. Not through npm: its Windows entry point is a `.cmd`, which node will
  // only spawn through a shell, and a shell concatenates its arguments instead
  // of escaping them. This has no need of either.
  const tsx = createRequire(import.meta.url).resolve('tsx/cli');
  const built = spawnSync(process.execPath, [tsx, 'tools/world/build.ts', '--check'], {
    encoding: 'utf8',
  });

  const output = `${built.stdout ?? ''}${built.stderr ?? ''}`;
  expect(built.status, `world:build --check failed:\n${output}`).toBe(0);
  expect(output, 'the build ran every gate').toContain('every gate holds');

  // A gate with nothing to fell is a gate that passes for the wrong reason, and
  // a layout edit could make that true without anybody noticing.
  const choppable = Number(/(\d+) choppable/.exec(output)?.[1] ?? 0);
  expect(choppable, 'and had trees to fell while it held').toBeGreaterThan(0);
});
