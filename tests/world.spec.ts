import { test, expect, type Page } from '@playwright/test';
import {
  bootGame,
  isBlocked,
  readHooks,
  standAt,
  standByProp,
  tap,
  waitForVoice,
  walk,
  walkToLandmark,
  walkToProp,
  warpDay,
  type Hooks,
} from './harness';

const teleport = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([tx, ty]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(tx!, ty!),
    [x, y],
  );

/**
 * The exterior, from one boot: what is in it, that the camera behaves, that a
 * poked prop answers, that walls are walls and that the overlay which draws them
 * turns on and off.
 *
 * Seven tests once — one page load each, all of them asking a small question
 * about the same zone. Page startup is the dominant cost in this suite, so they
 * are one page load now. What is *reached on foot* rather than teleported to is
 * chosen deliberately: the well, because a prop she cannot reach is a prop that
 * does not exist, and Joey's door, because the road past the facades is the one
 * she walks most. Everything else is stood at.
 *
 * The evening is folded in at the end for the same reason and takes the same
 * shape: it is a fact about the exterior, this is the boot that is standing in
 * the exterior, and everything before it is the daylight control the dusk
 * assertions are read against.
 */
test('the world she wakes up in', async ({ page }) => {
  const { errors } = await bootGame(page);

  const start = await readHooks(page);
  expect(start.room, 'the title screen opens onto the exterior').toBe('outside');
  expect(
    start.doorways.map((d) => d.to).sort(),
    'two ways out of the exterior: her own front door, and the cave in the cliff',
  ).toEqual(['cave', 'house']);
  expect(start.sparkles, 'nothing has sparkled yet').toBe(0);

  // The point of the rebuild: it does not fit on one screen any more.
  expect(start.world.width, 'the exterior is several screens wide').toBeGreaterThan(
    start.camera.width * 2,
  );
  expect(start.world.height, 'and several tall').toBeGreaterThan(start.camera.height * 2);

  // Everything Matt named is somewhere in it.
  expect(start.landmarks.map((m) => m.id).sort()).toEqual([
    'cave',
    'clearing',
    'cliff',
    'facades',
    'farm',
    'fence_east',
    'fence_south',
    'green',
    'house_front',
    'pond',
    'shed',
    'square',
    'woods',
    'woods_gap',
  ]);

  // The well stands on her own street, a hop from where the title screen puts
  // her down — which is the point of it being there. Walked to, and the only
  // prop in the fast suite that is: this is where "the arrow keys move her and
  // the green button answers" is proved end to end.
  await walkToProp(page, 'well');
  await tap(page, 'KeyZ');
  const poked = await readHooks(page);
  expect(poked.sparkles, 'Z near the well should sparkle').toBe(1);
  expect(poked.peakParticles, 'and put particles on screen').toBeGreaterThan(0);

  // Walked in bursts until she has covered some ground, rather than for a fixed
  // time. How far a held key carries her depends on what the machine is doing —
  // the first second in a zone is its slowest — and the claim under test is that
  // the camera follows, not how fast she is.
  const before = await readHooks(page);
  let after = before;
  for (let burst = 0; burst < 6 && after.player.x < before.player.x + 200; burst++) {
    await walk(page, 'ArrowRight', 900);
    after = await readHooks(page);
  }
  expect(after.player.x, 'she moved').toBeGreaterThan(before.player.x + 200);
  expect(after.camera.x, 'and the camera came with her').toBeGreaterThan(before.camera.x + 100);
  // The camera lags on purpose, so it is behind her rather than centred on her.
  expect(
    Math.abs(after.player.x - (after.camera.x + after.camera.width / 2)),
    'but it is not welded to her',
  ).toBeGreaterThan(0);

  // Walk into the top-left corner of the world and the view has to stop dead
  // rather than showing the outside of the map.
  await teleport(page, 0, 0);
  const corner = await readHooks(page);
  expect(corner.camera.x, 'the camera clamps to the west edge').toBe(0);
  expect(corner.camera.y, 'and to the north edge').toBe(0);

  await teleport(page, corner.world.width, corner.world.height);
  const far = await readHooks(page);
  expect(far.camera.x + far.camera.width, 'and to the east edge').toBe(far.world.width);
  expect(far.camera.y + far.camera.height, 'and to the south edge').toBe(far.world.height);

  // The hitbox overlay: held, not toggled, and it is the keyboard's B rather
  // than the pad's — the pad's red button is her cancel. The pictures it takes
  // are `hitboxes.spec`'s job; that it turns on at all is this one's.
  await page.keyboard.down('KeyB');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.hitboxes === true,
    undefined,
    { timeout: 5_000 },
  );
  const held = await readHooks(page);
  expect(held.player.x, 'holding it does not move her').toBeCloseTo(far.player.x, 0);
  expect(held.sparkles, 'and it is not an interaction').toBe(far.sparkles);
  await page.keyboard.up('KeyB');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.hitboxes === false,
    undefined,
    { timeout: 5_000 },
  );

  // A wall is a wall. Stand under the east end of her house, well clear of the
  // doorway, and pick the spot out of the collision grid rather than assuming
  // where it is: the layout is data, and a test that hardcodes a wall breaks
  // when it moves.
  const tile = start.world.tile;
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

  await teleport(page, approach!.x, approach!.y);
  await walk(page, 'ArrowUp', 1600);
  const stopped = await readHooks(page);
  expect(stopped.room, 'she did not walk through the wall into the house').toBe('outside');
  expect(
    isBlocked(stopped, stopped.player.x, stopped.player.y - tile),
    'she is stopped with something solid directly in front of her',
  ).toBe(true);
  expect(
    isBlocked(stopped, stopped.player.x, stopped.player.y - 2),
    'and she is not inside it',
  ).toBe(false);

  // Buildings collide at the base only, which is the half of it a picture cannot
  // settle: the screenshot of Joey's house looks exactly the same whether his
  // roof is solid or not. Every building used to block a rectangle the size of
  // its own picture — roof, eaves and a column of bare grass down each side — so
  // the cell four tiles behind his door was inside his house, and there was
  // nowhere behind anything in the village to stand.
  //
  // Read off the grid rather than walked round to. Walking it was thirty-five
  // seconds of the suite, and the grid is what the walk was consulting.
  const joey = start.interactables.find((p) => p.id === 'joey_door')!;
  expect(isBlocked(start, joey.x, joey.y - 4 * tile), 'the back of his house is grass').toBe(false);
  expect(
    isBlocked(start, joey.x, joey.y - 2 * tile),
    'and the foot of his front wall is still a wall',
  ).toBe(true);

  // A facade is the one thing in the game allowed to answer with no words: the
  // design law is that text must speak, and a knock has no text.
  await standAt(page, 'facades');
  await walkToProp(page, 'joey_door');
  await tap(page, 'KeyZ');
  const knocked = await readHooks(page);
  expect(knocked.sparkles, 'Joey’s door reacts').toBe(poked.sparkles + 1);
  expect(knocked.voice.lineId, 'but says nothing — there is no text to speak').toBeNull();
  expect(knocked.room, 'and it is not a way in').toBe('outside');

  // --- and then the light goes -----------------------------------------------
  //
  // The evening, folded in here rather than booted on its own: it is a fact
  // about the exterior, and this is the test that is standing in the exterior.
  // Everything above happened in broad daylight, which is the control.
  //
  // Warped rather than waited for. Full daylight is eight minutes and the ramp
  // is two more, and the alternative to skipping the clock is either ten minutes
  // of suite or a shorter day than the one she actually plays. See `warpDay`.
  await waitForVoice(page);
  const noon = await readHooks(page);
  expect(noon.day.dusk, 'she has not been up long: full daylight').toBe(0);
  expect(noon.day.outdoors, 'and this is a zone with a sky over it').toBe(true);
  expect(noon.day.fireflies, 'so there is nothing out').toBe(0);
  expect(noon.day.lamps, 'the village has lamp posts standing in it').toBeGreaterThan(0);
  expect(noon.day.lampGlow, 'unlit, because at noon a lamp is a pole').toBe(0);
  expect(noon.day.dadCalled, 'and nobody has called her in').toBe(false);

  // Half a minute into the two-minute ramp. Measured off the clock rather than
  // guessed at, because the test has already spent some of the afternoon itself.
  await warpDay(page, 8 * 60_000 + 30_000 - noon.day.elapsed);
  const dimming = await readHooks(page);
  expect(dimming.day.dusk, 'the light has started to go').toBeGreaterThan(0);
  expect(dimming.day.dusk, 'but it is still going, not gone').toBeLessThan(1);
  expect(dimming.day.lampGlow, 'and the lamps have come on with it').toBeGreaterThan(0);
  expect(dimming.day.fireflies, 'and the fireflies are out').toBeGreaterThan(0);

  // Dad calls once, from a house that may be right across the village — so what
  // has to be true is that his words are *on screen*, not merely spoken. This is
  // the only line in the game with nobody standing behind it, and the balloon is
  // still his: it is anchored at his own front door and leans that way.
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.day.dadCalled === true,
    undefined,
    { timeout: 10_000 },
  );
  const called = await readHooks(page);
  expect(called.voice.lineId, 'Dad calls her in as the light goes').toBe('dad_bedtime');
  expect(called.voice.bubble.speaker, 'in his voice, not hers').toBe('dad');
  expect(called.voice.bubble.visible, 'with a balloon to put the words in').toBe(true);
  expect(called.voice.words.length, 'and words in it to light up').toBeGreaterThan(0);
  const view = { left: called.camera.x, top: called.camera.y };
  expect(
    called.voice.bubble.x - view.left,
    'which is on screen however far from the house she is standing',
  ).toBeGreaterThan(0);
  expect(called.voice.bubble.x - view.left).toBeLessThan(called.camera.width);
  expect(called.voice.bubble.y - view.top).toBeGreaterThan(0);
  expect(called.voice.bubble.y - view.top).toBeLessThan(called.camera.height);

  // All the way to the cozy floor, and it stops there. Dusk holds rather than
  // becoming night: there is no hour at which the game is too dark to play, and
  // nothing here has ended her day for her.
  await warpDay(page, 5 * 60_000);
  const evening = await readHooks(page);
  expect(evening.day.dusk, 'the evening is all the way in').toBe(1);
  expect(evening.day.lampGlow, 'the lamps are at full').toBe(1);
  expect(evening.day.dadCalled, 'and he has not called twice').toBe(true);
  expect(evening.sleeps, 'nothing put her to bed').toBe(0);
  expect(evening.transitioning, 'and nothing took the game off her').toBe(false);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * Watch a doorway fire, from inside the page.
 *
 * The flourish is under half a second end to end, which a round trip per frame
 * cannot reliably land inside. So the watching happens in the page: it waits for
 * the transition to start, looks a beat later, and reports what it saw —
 * including the particle high-water mark, which is read there rather than here
 * because the zone it belongs to is about to be torn down.
 */
function watchTransition(page: Page) {
  return page.evaluate(
    (holdMs) =>
      new Promise<{ room: string | null; transitioning: boolean; peakParticles: number }>(
        (resolve) => {
          const hooks = (window as unknown as { __seraphina: Hooks }).__seraphina;
          const tick = () => {
            if (!hooks.transitioning) {
              requestAnimationFrame(tick);
              return;
            }
            window.setTimeout(
              () =>
                resolve({
                  room: hooks.room,
                  transitioning: hooks.transitioning,
                  peakParticles: hooks.peakParticles,
                }),
              holdMs,
            );
          };
          tick();
        },
      ),
    120,
  );
}

/** Wait out a doorway: the zone has swapped and the arrival flourish has landed. */
async function arrive(page: Page, from: string | null) {
  await page.waitForFunction(
    (before) => {
      const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
      return h.room !== before && !h.transitioning;
    },
    from,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(560);
  return readHooks(page);
}

/**
 * Her front door, both ways, and what is behind it.
 *
 * Four tests once: the press that opens it, the flourish it opens with, the
 * props in the house, and the walk that brings her back out. They are one
 * journey, so they are one test — and the two halves of the flourish are the
 * reason it cannot simply be `walkThroughDoorway` twice: what has to be caught
 * is the moment *during* the wash, when the zone has not swapped yet.
 *
 * Stardew's convention: the front door is a thing you press, and coming out of a
 * building has never needed one.
 */
test('a press to go in, a walk to come out, and the house in between', async ({ page }) => {
  const { errors } = await bootGame(page);

  const outside = await readHooks(page);
  const front = outside.doorways.find((d) => d.id === 'outside_to_house')!;
  expect(front.enter, 'her front door is entered with a press').toBe('press');
  expect(
    outside.interactables.map((i) => i.id),
    'and it takes its turn among the pokeable things',
  ).toContain('outside_to_house');
  // The title screen puts her on her own doorstep, so the green dot is already
  // showing over the door and the press needs no steering at all — which is also
  // how a four-year-old is taught what the green button is for.
  expect(
    Math.hypot(front.x - outside.player.x, front.y - outside.player.y),
    'she starts within reach of her own front door',
  ).toBeLessThanOrEqual(outside.interactRadius);

  // Standing in the opening is not enough, and that is the point: a door she
  // could fall through on the way past is the nearest thing to a fail state.
  await teleport(page, front.x, front.y);
  await page.waitForTimeout(600);
  const loitering = await readHooks(page);
  expect(loitering.room, 'standing in the doorway does not open it').toBe('outside');
  expect(loitering.transitioning).toBe(false);

  const goingIn = watchTransition(page);
  await tap(page, 'KeyZ');
  const inward = await goingIn;
  expect(inward.transitioning, 'the press opened the door').toBe(true);
  expect(inward.room, 'the zone does not swap until the wash covers the seam').toBe('outside');
  expect(inward.peakParticles, 'the threshold bursts on the way in').toBeGreaterThan(0);

  const house = await arrive(page, 'outside');
  expect(house.room, 'her front door leads into the house').toBe('house');
  expect(house.ready, 'the house finished building').toBe(true);
  expect(house.interactables.map((p) => p.id), 'the house has its own props').toEqual([
    'bed',
    'wardrobe',
    'bookshelf',
    'toybox',
  ]);
  expect(house.world.width, 'the interior scrolls too').toBeGreaterThan(house.camera.width);

  // Arrival is stepped clear of the door she came through — standing in it would
  // bounce her straight back out, which is as near a fail state as this game gets.
  const out = house.doorways.find((d) => d.id === 'house_to_outside')!;
  expect(Math.abs(house.player.y - out.y), 'she stands clear of the doorway').toBeGreaterThan(
    house.world.tile,
  );
  expect(out.enter, 'and coming out is a walk, not a press').toBe('walk');

  // Stood by rather than walked to: the claim here is that a poked prop sparkles
  // and speaks, and getting to things is the well's test and the wood's.
  await standByProp(page, 'bed');
  await tap(page, 'KeyZ');
  const bed = await readHooks(page);
  expect(bed.sparkles, 'the bed takes a press').toBe(1);
  // Design law: nothing appears on screen without a voice behind it.
  expect(bed.voice.lineId, 'and says something').toBe('seraphina_bed');
  expect(bed.voice.words.length, 'with words to highlight').toBeGreaterThan(0);

  await standByProp(page, 'wardrobe');
  await tap(page, 'KeyZ');
  const wardrobe = await readHooks(page);
  expect(wardrobe.sparkles, 'so does the wardrobe').toBe(2);
  expect(wardrobe.voice.lineId).toBe('seraphina_wardrobe');

  // And out again on her feet alone, with no press anywhere in it.
  await teleport(page, out.x, out.y - 2 * house.world.tile);
  const comingOut = watchTransition(page);
  await page.keyboard.down('ArrowDown');
  const outward = await comingOut;
  await page.keyboard.up('ArrowDown');
  expect(outward.transitioning, 'the doorway fired on the walk alone').toBe(true);
  expect(outward.room, 'the zone does not swap until the wash covers the seam').toBe('house');

  const back = await arrive(page, 'house');
  expect(back.room, 'the front door leads back outside').toBe('outside');
  expect(back.landmarks.map((m) => m.id), 'and it is the world she left').toContain('woods');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

// @slow, and the only one of these tagged for its own sake rather than for the
// pictures it takes: it walks the whole way across the exterior at her real
// speed, which is twenty seconds nothing can shorten without giving up the
// claim. Nothing in the fast suite proves the world is connected on foot.
test('the Mystic Woods can be reached on foot', { tag: '@slow' }, async ({ page }) => {
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
  await tap(page, 'KeyZ');
  const munched = await readHooks(page);
  expect(munched.sparkles, 'the toadstool takes a press').toBe(1);
  expect(munched.voice.lineId, 'and says something').toBe('seraphina_munchy');

  expect(errors, 'no uncaught page errors').toEqual([]);
});
