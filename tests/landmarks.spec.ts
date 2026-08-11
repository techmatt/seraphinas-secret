/**
 * The visual audit trail.
 *
 * These tests exist to leave pictures in `tests/screenshots/` — one per place
 * worth looking at — so the planner can see what the world looks like without
 * playing every corner of it. They stand her at each landmark rather than
 * walking her there: the exterior is four thousand pixels across and walking it
 * costs minutes per test, and `world.spec.ts` already proves on foot that the
 * places connect. Nothing here asserts anything a screenshot cannot show.
 */

import { test, expect } from '@playwright/test';
import { bootGame, fromAbove, readHooks, shot, standAt, walkThroughDoorway } from './harness';

test('the exterior, landmark by landmark', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  const places: [string, string][] = [
    ['house_front', '20-house-front.png'],
    ['facades', '21-facades.png'],
    ['cave', '22-cave.png'],
    ['cliff', '36-cliff.png'],
    ['woods', '23-woods.png'],
    ['woods_gap', '33-woods-gap.png'],
    ['clearing', '37-clearing.png'],
    ['fence_east', '38-fence-east.png'],
    ['fence_south', '39-fence-south.png'],
    ['pond', '24-pond.png'],
    ['square', '29-square.png'],
    ['green', '30-green.png'],
    ['shed', '31-shed.png'],
    ['farm', '34-farm.png'],
  ];

  for (const [id, file] of places) {
    await standAt(page, id);
    await canvas.screenshot({ path: shot(file) });
  }

  // The whole map at once. Everything above is a close-up, and "the world
  // should look composed, like someone arranged it" is not a claim a close-up
  // can settle either way.
  await fromAbove(page, () => canvas.screenshot({ path: shot('32-overview.png') }));

  const seen = await readHooks(page);
  expect(seen.room, 'still outside after the tour').toBe('outside');
  expect(seen.player.artLoaded, 'every texture the world asked for arrived').toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the house, room by room', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);
  await walkThroughDoorway(page, 'outside_to_house');

  const rooms: [string, string][] = [
    ['bedroom', '25-bedroom.png'],
    ['kitchen', '26-kitchen.png'],
    ['living_room', '27-living-room.png'],
    ['playroom', '28-playroom.png'],
  ];

  for (const [id, file] of rooms) {
    await standAt(page, id);
    await canvas.screenshot({ path: shot(file) });
  }

  // The whole floor plan at once. Four close-ups cannot show whether the rooms
  // hang together, and "one arrangement per room with real floor between them"
  // is a claim about the plan rather than about any one room in it.
  await fromAbove(page, () => canvas.screenshot({ path: shot('35-house.png') }));

  const seen = await readHooks(page);
  expect(seen.room, 'the whole house is one map — no transitions inside it').toBe('house');
  expect(seen.player.artLoaded).toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
