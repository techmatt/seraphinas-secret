import { test, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  bootGame,
  freeze,
  isBlocked,
  readHooks,
  snap,
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

/** Her tile, and a tree's. Everything below is about whether they can be equal. */
const cellOf = (hooks: Snapshot, x: number, y: number) => ({
  col: Math.floor(x / hooks.world.tile),
  row: Math.floor(y / hooks.world.tile),
});

const treeNow = (hooks: Snapshot, id: string) => hooks.trees.find((t) => t.id === id)!;

/**
 * A tree she can get to and hit *on its own*.
 *
 * Two conditions, and both come from the game's own rule that the nearest
 * interactable wins. She has to be able to stand next to it — a trunk walled in
 * by the trees behind it is scenery, not a target — and nothing else may be
 * standing close enough to take the dot off it. Both matter: the west wall is
 * one trunk in every row, so "an unchoppable tree" and "an unchoppable tree she
 * can aim at" are genuinely different sets, and a test that picked from the
 * first would be flaky about which trunk it hit.
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
    .filter((t) =>
      hooks.interactables.every((other) => other.id === t.id || away(other, t) > tile * 2.5),
    )
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
  expect(isBlocked(felled, target.x, target.y), 'a stump still stands in the trunk’s tile').toBe(
    true,
  );
  await snap(page, '52-felled.png');

  await chop(page, 2);

  const cleared = await readHooks(page);
  expect(treeNow(cleared, target.id).state, 'two more and the stump pops').toBe('gone');
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
