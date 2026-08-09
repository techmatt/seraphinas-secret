import { test, expect } from '@playwright/test';
import { bootGame, readHooks, shot, walk, walkToStone, type Hooks } from './harness';

test('boots, renders a canvas, and walks on arrow keys', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  await canvas.screenshot({ path: shot('03-boot.png') });

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

  await canvas.screenshot({ path: shot('04-walked.png') });

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('walking up to the stone and pressing Z fires the sparkle burst', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  expect((await readHooks(page)).sparkles, 'nothing has sparkled yet').toBe(0);

  await walkToStone(page);

  await page.keyboard.press('KeyZ');

  // Let the burst spread, then freeze it. A screenshot round trip outlives the
  // particles, so without the pause the shot is of an empty room.
  await page.waitForTimeout(120);
  await page.evaluate(() =>
    (window as unknown as { __seraphina: Hooks }).__seraphina.pause(),
  );

  await canvas.screenshot({ path: shot('05-sparkle.png') });

  const after = await readHooks(page);
  expect(after.sparkles, 'Z near the stone should sparkle').toBe(1);
  expect(after.peakParticles, 'the burst should put particles on screen').toBeGreaterThan(0);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
