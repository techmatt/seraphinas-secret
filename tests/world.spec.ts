import { test, expect } from '@playwright/test';
import {
  bootGame,
  isBlocked,
  readHooks,
  shot,
  standAt,
  walk,
  walkThroughDoorway,
  walkToLandmark,
  walkToProp,
  type Hooks,
} from './harness';

test('the game opens outside her house, in a world bigger than the screen', async ({ page }) => {
  const { errors } = await bootGame(page);

  const world = await readHooks(page);
  expect(world.room, 'the title screen opens onto the exterior').toBe('outside');
  expect(world.doorways.map((d) => d.to), 'her front door leads into the house').toEqual([
    'house',
  ]);

  // The point of the rebuild: it does not fit on one screen any more.
  expect(world.world.width, 'the exterior is several screens wide').toBeGreaterThan(
    world.camera.width * 2,
  );
  expect(world.world.height, 'and several tall').toBeGreaterThan(world.camera.height * 2);

  // Everything Matt named is somewhere in it.
  expect(world.landmarks.map((m) => m.id).sort()).toEqual([
    'cave',
    'facades',
    'house_front',
    'pond',
    'woods',
  ]);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the camera follows her, and stops at the edge of the world', async ({ page }) => {
  const { errors } = await bootGame(page);

  const before = await readHooks(page);

  // Walked in bursts until she has covered some ground, rather than for a fixed
  // time. How far a held key carries her depends on what the machine is doing —
  // the first second in a zone is its slowest, and a loaded CI box is slower
  // still — and the claim under test is that the camera follows, not how fast
  // she is.
  let after = before;
  for (let burst = 0; burst < 6 && after.player.x < before.player.x + 200; burst++) {
    await walk(page, 'ArrowRight', 900);
    after = await readHooks(page);
  }

  expect(after.player.x, 'she moved').toBeGreaterThan(before.player.x + 200);
  expect(after.camera.x, 'and the camera came with her').toBeGreaterThan(before.camera.x + 100);

  // The camera lags on purpose, so it is behind her rather than centred on her.
  const lead = after.player.x - (after.camera.x + after.camera.width / 2);
  expect(Math.abs(lead), 'but it is not welded to her').toBeGreaterThan(0);

  // Walk into the top-left corner of the world and the view has to stop dead
  // rather than showing the outside of the map.
  await page.evaluate(() =>
    (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(0, 0),
  );
  const corner = await readHooks(page);
  expect(corner.camera.x, 'the camera clamps to the west edge').toBe(0);
  expect(corner.camera.y, 'and to the north edge').toBe(0);

  await page.evaluate(
    ([w, h]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(w!, h!),
    [corner.world.width, corner.world.height],
  );
  const far = await readHooks(page);
  expect(far.camera.x + far.camera.width, 'and to the east edge').toBe(far.world.width);
  expect(far.camera.y + far.camera.height, 'and to the south edge').toBe(far.world.height);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('walking into her house stops her at the wall', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  const tile = start.world.tile;

  // Stand under the east end of the house, well clear of the doorway, and pick
  // the spot out of the collision grid rather than assuming where it is: the
  // layout is data and a test that hardcodes a wall breaks when it moves.
  const door = start.doorways.find((d) => d.id === 'outside_to_house')!;
  let approach: { x: number; y: number } | null = null;
  for (let step = 2; step <= 4 && !approach; step++) {
    const x = door.x + step * tile;
    for (let up = 1; up <= 4 && !approach; up++) {
      if (isBlocked(start, x, door.y - up * tile) && !isBlocked(start, x, door.y)) {
        approach = { x, y: door.y };
      }
    }
  }
  expect(approach, 'there is a stretch of house wall east of the door').not.toBeNull();

  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [approach!.x, approach!.y],
  );

  await walk(page, 'ArrowUp', 1600);
  const after = await readHooks(page);

  expect(after.room, 'she did not walk through the wall into the house').toBe('outside');
  expect(
    isBlocked(after, after.player.x, after.player.y - tile),
    'she is stopped with something solid directly in front of her',
  ).toBe(true);
  expect(
    isBlocked(after, after.player.x, after.player.y - 2),
    'and she is not inside it',
  ).toBe(false);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('she can walk into the house and back out again', async ({ page }) => {
  const { errors } = await bootGame(page);

  expect((await readHooks(page)).room).toBe('outside');

  // No button press anywhere in here: walking in is the whole interaction.
  const inside = await walkThroughDoorway(page, 'outside_to_house');
  expect(inside, 'her front door leads into the house').toBe('house');

  const house = await readHooks(page);
  expect(house.ready, 'the house finished building').toBe(true);
  expect(house.transitioning, 'and the transition is over').toBe(false);
  expect(house.interactables.map((p) => p.id), 'the house has its own props').toEqual([
    'bed',
    'wardrobe',
    'bookshelf',
    'toybox',
  ]);
  expect(house.world.width, 'the interior scrolls too').toBeGreaterThan(house.camera.width);

  // Arrival is stepped clear of the door she came through — standing in it
  // would bounce her straight back out, which is as near a fail state as this
  // game gets.
  const door = house.doorways.find((d) => d.id === 'house_to_outside')!;
  expect(Math.abs(house.player.y - door.y), 'she stands clear of the doorway').toBeGreaterThan(
    house.world.tile,
  );

  // And it is a graph, not a one-way trip.
  const back = await walkThroughDoorway(page, 'house_to_outside');
  expect(back, 'the front door leads back outside').toBe('outside');
  expect((await readHooks(page)).landmarks.map((m) => m.id)).toContain('woods');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the Mystic Woods can be reached on foot', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  const woods = start.landmarks.find((m) => m.id === 'woods')!;
  expect(
    Math.hypot(woods.x - start.player.x, woods.y - start.player.y),
    'the wood is a long way from her front door',
  ).toBeGreaterThan(start.camera.width);

  // No teleport: this is the test that says the world is actually connected.
  await walkToLandmark(page, 'woods', 120);

  const there = await readHooks(page);
  expect(there.room, 'she walked there, she did not fall out of the world').toBe('outside');
  expect(
    Math.hypot(woods.x - there.player.x, woods.y - there.player.y),
    'she is standing in the wood',
  ).toBeLessThanOrEqual(120);

  // And the wood has something in it worth having walked to.
  await walkToProp(page, 'woods_toadstool');
  await page.keyboard.press('KeyZ');
  const poked = await readHooks(page);
  expect(poked.sparkles, 'the toadstool takes a press').toBe(1);
  expect(poked.voice.lineId, 'and says something').toBe('seraphina_munchy');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a neighbour’s door knocks, and does not open', async ({ page }) => {
  const { errors } = await bootGame(page);

  // Stood on the road outside the neighbours' houses rather than walked there
  // from her own front door: the wood test already proves the world connects,
  // and this one is about what a knock does.
  await standAt(page, 'facades');

  // A facade is the one thing in the game allowed to answer with no words: the
  // design law is that text must speak, and a knock has no text.
  await walkToProp(page, 'shed_door');
  await page.keyboard.press('KeyZ');

  const knocked = await readHooks(page);
  expect(knocked.sparkles, 'the shed door reacts').toBe(1);
  expect(knocked.voice.lineId, 'but says nothing — there is no text to speak').toBeNull();
  expect(knocked.room, 'and it is not a way in').toBe('outside');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the house props sparkle and speak', async ({ page }) => {
  const { errors } = await bootGame(page);
  await walkThroughDoorway(page, 'outside_to_house');

  await walkToProp(page, 'bed');
  await page.keyboard.press('KeyZ');
  const bed = await readHooks(page);
  expect(bed.sparkles, 'the bed takes a press').toBe(1);
  // Design law: nothing appears on screen without a voice behind it.
  expect(bed.voice.lineId, 'and says something').toBe('dad_bedtime');
  expect(bed.voice.words.length, 'with words to highlight').toBeGreaterThan(0);

  await walkToProp(page, 'wardrobe');
  await page.keyboard.press('KeyZ');
  const wardrobe = await readHooks(page);
  expect(wardrobe.sparkles, 'so does the wardrobe').toBe(2);
  expect(wardrobe.voice.lineId).toBe('seraphina_wardrobe');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the doorway transition is a flourish, not a cut', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  // From where the title screen puts her, straight up is her front door — so
  // this is one held key and no steering.
  await page.keyboard.down('ArrowUp');

  // The flourish is under half a second end to end, which a round trip per
  // frame cannot reliably land inside. So the watching happens in the page: it
  // freezes the scene a beat after the doorway fires and reports what it saw.
  const mid = await page.evaluate(
    (holdMs) =>
      new Promise<{ room: string | null; transitioning: boolean }>((resolve) => {
        const hooks = (window as unknown as { __seraphina: Hooks }).__seraphina;
        const tick = () => {
          if (!hooks.transitioning) {
            requestAnimationFrame(tick);
            return;
          }
          window.setTimeout(() => {
            const seen = { room: hooks.room, transitioning: hooks.transitioning };
            hooks.pause();
            resolve(seen);
          }, holdMs);
        };
        tick();
      }),
    120,
  );

  await page.keyboard.up('ArrowUp');

  expect(mid.transitioning, 'the doorway fired on the walk alone, with no press').toBe(true);
  expect(mid.room, 'the zone does not swap until the wash covers the seam').toBe('outside');

  const frozen = await readHooks(page);
  expect(frozen.peakParticles, 'the threshold bursts on the way out').toBeGreaterThan(0);

  await canvas.screenshot({ path: shot('09-transition.png') });

  expect(errors, 'no uncaught page errors').toEqual([]);
});
