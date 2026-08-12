/**
 * The visual audit trail.
 *
 * These tests exist to leave pictures in `tests/screenshots/` — one per place
 * worth looking at — so the planner can see what the world looks like without
 * playing every corner of it. They stand her at each landmark rather than
 * walking her there: the exterior is four thousand pixels across and walking it
 * costs minutes per test, and `world.spec.ts` already proves on foot that the
 * places connect. Nothing here asserts anything a screenshot cannot show.
 *
 * All three are `@slow`, and this file is the reason that tag exists: twenty-one
 * framings between them, six assertions, and an output nothing reads until
 * somebody writes a report. `npm run test:slow` is what regenerates them.
 */

import { test, expect } from '@playwright/test';
import { bootGame, fromAbove, readHooks, snap, standAt, walkThroughDoorway } from './harness';

test('the exterior, landmark by landmark', { tag: '@slow' }, async ({ page }) => {
  const { errors } = await bootGame(page);

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
    await snap(page, file);
  }

  // The whole map at once. Everything above is a close-up, and "the world
  // should look composed, like someone arranged it" is not a claim a close-up
  // can settle either way.
  await fromAbove(page, () => snap(page, '32-overview.png'));

  const seen = await readHooks(page);
  expect(seen.room, 'still outside after the tour').toBe('outside');
  expect(seen.player.artLoaded, 'every texture the world asked for arrived').toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * The third zone, which is one room and is photographed like one.
 *
 * A tour of its own rather than two more stops on the exterior's, because it is
 * on the far side of a door: the exterior tour teleports between landmarks and
 * cannot leave the zone it is in. Nothing about the ritual is in here — the
 * circle, the coloured dots and the faeries all need a quest three phases in,
 * and `quest.spec` is where that is driven and asserted. This is the empty room.
 */
test('the Secret Cave, empty', { tag: '@slow' }, async ({ page }) => {
  const { errors } = await bootGame(page);
  // Stood at the mouth before pressing it. The mountain path is most of the
  // width of the map from her own front door and walking it takes twenty
  // seconds — which is `world.spec`'s business, not a picture's.
  await standAt(page, 'cave');
  await walkThroughDoorway(page, 'outside_to_cave');

  await standAt(page, 'cave_fire');
  await snap(page, '40-cave-fire.png');
  await standAt(page, 'cave_chamber');
  await snap(page, '41-cave-chamber.png');

  // And the whole chamber, which at twenty tiles by eleven is very nearly what
  // is already on screen — the point of the wide shot here is the frame of wall
  // round it, not the floor.
  await fromAbove(page, () => snap(page, '42-cave.png'));

  const seen = await readHooks(page);
  expect(seen.room, 'behind the mouth in the cliff is its own zone').toBe('cave');
  expect(seen.player.artLoaded).toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the house, room by room', { tag: '@slow' }, async ({ page }) => {
  const { errors } = await bootGame(page);
  await walkThroughDoorway(page, 'outside_to_house');

  const rooms: [string, string][] = [
    ['bedroom', '25-bedroom.png'],
    ['kitchen', '26-kitchen.png'],
    ['living_room', '27-living-room.png'],
    ['playroom', '28-playroom.png'],
  ];

  for (const [id, file] of rooms) {
    await standAt(page, id);
    await snap(page, file);
  }

  // The whole floor plan at once. Four close-ups cannot show whether the rooms
  // hang together, and "one arrangement per room with real floor between them"
  // is a claim about the plan rather than about any one room in it.
  await fromAbove(page, () => snap(page, '35-house.png'));

  const seen = await readHooks(page);
  expect(seen.room, 'the whole house is one map — no transitions inside it').toBe('house');
  expect(seen.player.artLoaded).toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
