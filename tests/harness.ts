import { expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Screenshots go somewhere predictable rather than into Playwright's
 * run-scoped output dir — they are how the planner visually audits changes.
 */
const SHOTS = path.join('tests', 'screenshots');
export const shot = (name: string) => path.join(SHOTS, name);

/** Mirrors src/testHooks.ts. */
export type Hooks = {
  ready: boolean;
  player: { x: number; y: number };
  stone: { x: number; y: number };
  interactRadius: number;
  sparkles: number;
  aliveParticles: number;
  peakParticles: number;
  pause: () => void;
  voice: {
    loaded: boolean;
    ids: string[];
    lineId: string | null;
    words: string[];
    highlighted: number;
    say: (id: string) => void;
    scrub: (seconds: number) => void;
    timings: (id: string) => { word: string; start: number; end: number }[];
  };
};

export const readHooks = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
    // Functions do not survive the serialisation back to node; drop them.
    const { pause, voice, ...rest } = h;
    const { say, scrub, timings, ...voiceRest } = voice;
    return { ...rest, voice: voiceRest };
  });

export async function bootGame(page: Page) {
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
export async function walk(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Steer to the stone in short hops, re-reading position each time.
 * Walking for a hardcoded duration bakes in the walk speed and the layout, so
 * it breaks the moment either is tuned — which for this game is constantly.
 */
export async function walkToStone(page: Page) {
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

/** The voice manifest loads after boot; nothing voice-shaped works before it. */
export async function waitForVoice(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.loaded === true,
    undefined,
    { timeout: 20_000 },
  );
}
