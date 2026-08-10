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
import { bootGame, readHooks, shot, standAt, walkThroughDoorway } from './harness';

test('the exterior, landmark by landmark', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  const places: [string, string][] = [
    ['house_front', '20-house-front.png'],
    ['facades', '21-facades.png'],
    ['cave', '22-cave.png'],
    ['woods', '23-woods.png'],
    ['pond', '24-pond.png'],
  ];

  for (const [id, file] of places) {
    await standAt(page, id);
    await canvas.screenshot({ path: shot(file) });
  }

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

  const seen = await readHooks(page);
  expect(seen.room, 'the whole house is one map — no transitions inside it').toBe('house');
  expect(seen.player.artLoaded).toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
