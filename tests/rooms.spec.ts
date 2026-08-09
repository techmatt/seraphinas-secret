import { test, expect } from '@playwright/test';
import {
  bootGame,
  readHooks,
  shot,
  walk,
  walkThroughDoorway,
  walkToProp,
  type Hooks,
} from './harness';

test('the game opens in the yard, with a doorway and the star in it', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  const yard = await readHooks(page);
  expect(yard.room, 'the title screen opens onto the yard').toBe('yard');
  expect(yard.doorways.map((d) => d.to), 'the yard has a way into the house').toEqual(['house']);
  expect(yard.interactables.map((p) => p.id), 'the star stayed in the yard').toEqual(['star']);

  // The archway has to be findable with no text at all, so the picture is the
  // thing under audit here.
  await canvas.screenshot({ path: shot('08-yard.png') });

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('walking into the archway carries her into the house and back', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  expect((await readHooks(page)).room).toBe('yard');

  // No button press anywhere in here: walking in is the whole interaction.
  const inside = await walkThroughDoorway(page, 'yard_to_house');
  expect(inside, 'the archway leads to the house').toBe('house');

  const house = await readHooks(page);
  expect(house.ready, 'the house finished building').toBe(true);
  expect(house.transitioning, 'and the transition is over').toBe(false);
  expect(house.interactables.map((p) => p.id), 'the house has its own props').toEqual([
    'wardrobe',
    'bed',
  ]);

  // Arrival is stepped clear of the door she came through — standing in it
  // would bounce her straight back out, which is as near a fail state as this
  // game gets.
  const door = house.doorways.find((d) => d.id === 'house_to_yard')!;
  expect(Math.abs(house.player.x - door.x), 'she stands clear of the doorway').toBeGreaterThan(64);

  await canvas.screenshot({ path: shot('10-house.png') });

  // And it is a graph, not a one-way trip.
  const back = await walkThroughDoorway(page, 'house_to_yard');
  expect(back, 'the house door leads back to the yard').toBe('yard');
  expect((await readHooks(page)).interactables.map((p) => p.id)).toEqual(['star']);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the house props sparkle and speak, the same as the yard star', async ({ page }) => {
  const { errors } = await bootGame(page);
  await walkThroughDoorway(page, 'yard_to_house');

  expect((await readHooks(page)).sparkles, 'nothing has sparkled yet').toBe(0);

  await walkToProp(page, 'wardrobe');
  await page.keyboard.press('KeyZ');

  const poked = await readHooks(page);
  expect(poked.sparkles, 'the wardrobe takes a press').toBe(1);
  // Design law: nothing appears on screen without a voice behind it.
  expect(poked.voice.lineId, 'and says something').toBe('seraphina_wardrobe');
  expect(poked.voice.words.length, 'with words to highlight').toBeGreaterThan(0);

  await walkToProp(page, 'bed');
  await page.keyboard.press('KeyZ');

  const second = await readHooks(page);
  expect(second.sparkles, 'so does the bed').toBe(2);
  expect(second.voice.lineId).toBe('dad_bedtime');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the doorway transition is a flourish, not a cut', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  // From where the title screen puts her, left is the archway — so this is one
  // held key and no steering.
  await page.keyboard.down('ArrowLeft');

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

  await page.keyboard.up('ArrowLeft');

  expect(mid.transitioning, 'the doorway fired on the walk alone, with no press').toBe(true);
  expect(mid.room, 'the room does not swap until the wash covers the seam').toBe('yard');

  const frozen = await readHooks(page);
  expect(frozen.peakParticles, 'the threshold bursts on the way out').toBeGreaterThan(0);

  await canvas.screenshot({ path: shot('09-transition.png') });

  expect(errors, 'no uncaught page errors').toEqual([]);
});
