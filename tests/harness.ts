import { expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Screenshots go somewhere predictable rather than into Playwright's
 * run-scoped output dir — they are how the planner visually audits changes.
 */
const SHOTS = path.join('tests', 'screenshots');
export const shot = (name: string) => path.join(SHOTS, name);

/** The greeting the title screen speaks; see GREETING in TitleScene. */
export const GREETING_LINE = 'seraphina_hello';

/** Mirrors src/testHooks.ts. */
export type Hooks = {
  ready: boolean;
  scene: 'title' | 'room' | null;
  room: string | null;
  transitioning: boolean;
  audio: string;
  player: { x: number; y: number };
  interactables: { id: string; x: number; y: number }[];
  doorways: { id: string; x: number; y: number; to: string }[];
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

export interface OpenOptions {
  /**
   * Skip the title screen's spoken greeting — about 2.5 s a test. The press is
   * still real, so only the sentence is skipped, not the entry path.
   */
  fast?: boolean;
}

/**
 * Load the page and stop at the title screen, which is where the game now
 * starts. Nothing is playable yet — that needs a press.
 */
export async function openTitle(page: Page, { fast = false }: OpenOptions = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(fast ? '/?fastBoot=1' : '/');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina?: Hooks }).__seraphina?.scene === 'title',
    undefined,
    { timeout: 20_000 },
  );

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box, 'canvas should have layout').not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  // Focuses the page for keyboard input. Deliberately not a start press: the
  // title screen only opens for the pad's A or one of its named keys.
  await canvas.click({ position: { x: 20, y: 20 } });

  return { canvas, errors };
}

/**
 * Press through the title screen and wait for the room. Without ?fastBoot the
 * greeting plays in full first, so this is a couple of seconds, not instant.
 */
export async function pressStart(page: Page) {
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.ready === true,
    undefined,
    { timeout: 20_000 },
  );
  // The room fades in out of the title's flash. Screenshot before it lands and
  // the visual audit trail is a picture of the flash.
  await page.waitForTimeout(400);
}

/**
 * The usual starting point for a test that cares about a room, not the door.
 * Fast by default — the front door has its own spec, and everything else was
 * paying to hear the same greeting a dozen times a run.
 */
export async function bootGame(page: Page, options: OpenOptions = { fast: true }) {
  const { canvas, errors } = await openTitle(page, options);
  await pressStart(page);
  return { canvas, errors };
}

/** Hold a key for a while so the character actually covers some ground. */
export async function walk(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Steer to a point in short hops, re-reading position each time. Walking for a
 * hardcoded duration bakes in the walk speed and the layout, so it breaks the
 * moment either is tuned — which for this game is constantly.
 *
 * `arrived` is checked before every hop, which is also how a test steers into
 * something that ends the room it is standing in.
 */
async function steer(
  page: Page,
  target: (hooks: Awaited<ReturnType<typeof readHooks>>) => { x: number; y: number },
  arrived: (hooks: Awaited<ReturnType<typeof readHooks>>) => boolean,
  what: string,
) {
  for (let hop = 0; hop < 50; hop++) {
    const hooks = await readHooks(page);
    if (arrived(hooks)) return;

    const { x, y } = target(hooks);
    const dx = x - hooks.player.x;
    const dy = y - hooks.player.y;

    if (Math.abs(dy) > 20) await walk(page, dy > 0 ? 'ArrowDown' : 'ArrowUp', 100);
    if (Math.abs(dx) > 20) await walk(page, dx > 0 ? 'ArrowRight' : 'ArrowLeft', 100);
  }

  const { player, room } = await readHooks(page);
  throw new Error(`never reached ${what}: player ${player.x},${player.y} in ${room}`);
}

/** Walk up to a prop — the named one, or whichever the room lists first. */
export async function walkToProp(page: Page, id?: string) {
  const pick = (hooks: Awaited<ReturnType<typeof readHooks>>) => {
    const prop = id ? hooks.interactables.find((p) => p.id === id) : hooks.interactables[0];
    if (!prop) throw new Error(`no prop ${id ?? '[first]'} in ${hooks.room}`);
    return prop;
  };

  await steer(
    page,
    pick,
    (hooks) => {
      const prop = pick(hooks);
      // Stop comfortably inside the radius rather than right on its edge.
      return Math.hypot(prop.x - hooks.player.x, prop.y - hooks.player.y) <=
        hooks.interactRadius * 0.5;
    },
    `prop ${id ?? '[first]'}`,
  );
}

/**
 * Walk into a doorway and come out the other side. Returns the room she landed
 * in. Doorways are walk-through, so there is no press here by design.
 */
export async function walkThroughDoorway(page: Page, id?: string) {
  const from = (await readHooks(page)).room;

  await steer(
    page,
    (hooks) => {
      const door = id ? hooks.doorways.find((d) => d.id === id) : hooks.doorways[0];
      if (!door) throw new Error(`no doorway ${id ?? '[first]'} in ${hooks.room}`);
      return door;
    },
    (hooks) => hooks.transitioning || hooks.room !== from,
    `doorway ${id ?? '[first]'}`,
  );

  await page.waitForFunction(
    (before) => {
      const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
      return h.room !== before && !h.transitioning;
    },
    from,
    { timeout: 20_000 },
  );

  // Let the arrival flourish land, or the screenshot is of the colour wash.
  await page.waitForTimeout(520);
  return (await readHooks(page)).room;
}

/** The voice manifest loads after boot; nothing voice-shaped works before it. */
export async function waitForVoice(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.loaded === true,
    undefined,
    { timeout: 20_000 },
  );
}
