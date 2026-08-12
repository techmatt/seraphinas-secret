import { test, expect } from '@playwright/test';
import { bootGame, freeze, readHooks, snap, tap, walk, walkToProp } from './harness';

test('boots, renders a canvas, and walks on arrow keys', async ({ page }) => {
  const { errors } = await bootGame(page);

  await snap(page, '03-boot.png');

  const before = await readHooks(page);
  await walk(page, 'ArrowRight', 500);
  await walk(page, 'ArrowDown', 300);
  const after = await readHooks(page);

  expect(after.player.x, 'ArrowRight should move the character right').toBeGreaterThan(
    before.player.x + 20,
  );
  expect(after.player.y, 'ArrowDown should move the character down').toBeGreaterThan(
    before.player.y + 10,
  );

  await snap(page, '04-walked.png');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('walking up to the well and pressing Z fires the sparkle burst', async ({ page }) => {
  const { errors } = await bootGame(page);

  expect((await readHooks(page)).sparkles, 'nothing has sparkled yet').toBe(0);

  // The well stands on her own street, a hop from where the title screen puts
  // her down — which is the point of it being there.
  await walkToProp(page, 'well');

  // Close enough that the well asks to be pressed. The prompt is a green dot,
  // never a letter — this is the frame that proves it.
  await snap(page, '05-prompt.png');

  await tap(page, 'KeyZ');

  // Let the burst spread, then freeze it. A screenshot round trip outlives the
  // particles, so without the pause the shot is of an empty room.
  await page.waitForTimeout(120);
  await freeze(page);

  await snap(page, '06-sparkle.png');

  const after = await readHooks(page);
  expect(after.sparkles, 'Z near the well should sparkle').toBe(1);
  expect(after.peakParticles, 'the burst should put particles on screen').toBeGreaterThan(0);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
