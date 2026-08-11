/**
 * The hitbox overlay, and the pictures taken through it.
 *
 * Two jobs. The first is a normal test: holding B shows the collision grid,
 * letting go hides it, and nothing about the game changes either way. The second
 * is the audit trail — three tree-dense framings photographed with the overlay
 * up, which is the only way anyone can see whether a trunk is standing on the
 * tile that stops her.
 */

import { test, expect } from '@playwright/test';
import { bootGame, readHooks, snap, standAt, withHitboxes, type Hooks } from './harness';

test('holding B shows the collision grid, and changes nothing else', async ({ page }) => {
  const { errors } = await bootGame(page);

  const before = await readHooks(page);
  expect(before.hitboxes, 'the overlay is off until it is asked for').toBe(false);

  // The keyboard's B, not the pad's — the pad's red button is her cancel.
  await page.keyboard.down('KeyB');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.hitboxes === true,
    undefined,
    { timeout: 5_000 },
  );
  const held = await readHooks(page);
  expect(held.player.x, 'holding it does not move her').toBeCloseTo(before.player.x, 0);
  expect(held.player.y).toBeCloseTo(before.player.y, 0);
  expect(held.sparkles, 'and it is not an interaction').toBe(before.sparkles);

  await page.keyboard.up('KeyB');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.hitboxes === false,
    undefined,
    { timeout: 5_000 },
  );

  expect(errors, 'no uncaught page errors').toEqual([]);
});

// @slow: seven framings, and its output is pictures rather than assertions. The
// test above it is the one that fails when the overlay breaks.
test('the wood, with its hitboxes showing', { tag: '@slow' }, async ({ page }) => {
  const { errors } = await bootGame(page);

  // The densest stands of trees in the world, and one framing per edge of it.
  // Whatever a tree's collision does wrong it does seventy times over in the
  // first three; the last four are the boundary, where what the overlay has to
  // show is a *continuous* run of solid cells with no walkable air in it.
  const places: [string, string][] = [
    ['woods', '40-hitboxes-woods.png'],
    ['woods_gap', '41-hitboxes-woods-gap.png'],
    ['clearing', '42-hitboxes-clearing.png'],
    ['cave', '43-hitboxes-cliff-cave.png'],
    ['cliff', '44-hitboxes-cliff.png'],
    ['fence_east', '45-hitboxes-fence-east.png'],
    ['fence_south', '46-hitboxes-fence-south.png'],
  ];

  for (const [id, file] of places) {
    await standAt(page, id);
    await withHitboxes(page, () => snap(page, file));
  }

  const seen = await readHooks(page);
  expect(seen.hitboxes, 'the overlay is put away after the tour').toBe(false);
  expect(seen.room, 'and she is still where she was left').toBe('outside');

  expect(errors, 'no uncaught page errors').toEqual([]);
});
