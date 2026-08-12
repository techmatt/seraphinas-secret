/**
 * The pictures taken through the hitbox overlay.
 *
 * The audit trail — tree-dense framings photographed with the overlay up, which
 * is the only way anyone can see whether a trunk is standing on the tile that
 * stops her. That the overlay turns on and off at all, and changes nothing while
 * it is up, is asserted in `world.spec`'s smoke test rather than here: it is two
 * key events and a boolean, and it was paying for a page load of its own.
 */

import { test, expect } from '@playwright/test';
import { bootGame, readHooks, snap, standAt, withHitboxes } from './harness';

// @slow: seven framings, and its output is pictures rather than assertions.
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
