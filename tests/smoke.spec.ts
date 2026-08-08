import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Screenshots go somewhere predictable rather than into Playwright's
 * run-scoped output dir — they are how the planner visually audits changes.
 */
const SHOTS = path.join('tests', 'screenshots');
const shot = (name: string) => path.join(SHOTS, name);

/** Mirrors src/testHooks.ts. */
type Hooks = {
  ready: boolean;
  player: { x: number; y: number };
  stone: { x: number; y: number };
  interactRadius: number;
  sparkles: number;
  aliveParticles: number;
  peakParticles: number;
};

const readHooks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __seraphina: Hooks }).__seraphina);

async function bootGame(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina?: Hooks }).__seraphina?.ready === true,
    undefined,
    { timeout: 20_000 },
  );

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box, 'canvas should have layout').not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  // A click focuses the page for keyboard input and satisfies the audio gesture.
  await canvas.click({ position: { x: 20, y: 20 } });

  return { canvas, errors };
}

/** Hold a key for a while so the character actually covers some ground. */
async function walk(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Steer to the stone in short hops, re-reading position each time.
 * Walking for a hardcoded duration bakes in the walk speed and the layout, so
 * it breaks the moment either is tuned — which for this game is constantly.
 */
async function walkToStone(page: Page) {
  for (let hop = 0; hop < 40; hop++) {
    const { player, stone, interactRadius } = await readHooks(page);
    const dx = stone.x - player.x;
    const dy = stone.y - player.y;

    // Stop comfortably inside the radius rather than right on its edge.
    if (Math.hypot(dx, dy) <= interactRadius * 0.5) return;

    if (Math.abs(dx) > 24) await walk(page, dx > 0 ? 'ArrowRight' : 'ArrowLeft', 100);
    if (Math.abs(dy) > 24) await walk(page, dy > 0 ? 'ArrowDown' : 'ArrowUp', 100);
  }

  const { player, stone } = await readHooks(page);
  throw new Error(
    `never reached the stone: player ${player.x},${player.y} stone ${stone.x},${stone.y}`,
  );
}

test('boots, renders a canvas, and walks on arrow keys', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  await canvas.screenshot({ path: shot('01-boot.png') });

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

  await canvas.screenshot({ path: shot('02-walked.png') });

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
    (window as unknown as { __seraphina: Hooks & { pause: () => void } }).__seraphina.pause(),
  );

  await canvas.screenshot({ path: shot('03-sparkle.png') });

  const after = await readHooks(page);
  expect(after.sparkles, 'Z near the stone should sparkle').toBe(1);
  expect(after.peakParticles, 'the burst should put particles on screen').toBeGreaterThan(0);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
