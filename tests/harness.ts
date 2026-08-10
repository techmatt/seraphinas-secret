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
  player: {
    x: number;
    y: number;
    facing: 'down' | 'up' | 'left' | 'right';
    anim: string;
    flipped: boolean;
    artLoaded: boolean;
  };
  camera: { x: number; y: number; width: number; height: number };
  world: {
    width: number;
    height: number;
    tile: number;
    cols: number;
    rows: number;
    blocked: string;
  };
  interactables: { id: string; x: number; y: number }[];
  doorways: { id: string; x: number; y: number; to: string; enter: 'walk' | 'press' }[];
  landmarks: { id: string; x: number; y: number }[];
  interactRadius: number;
  fps: number;
  sparkles: number;
  aliveParticles: number;
  peakParticles: number;
  pause: () => void;
  teleport: (x: number, y: number) => void;
  overview: (fit: boolean) => void;
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
    const { pause, teleport, overview, voice, ...rest } = h;
    const { say, scrub, timings, ...voiceRest } = voice;
    return { ...rest, voice: voiceRest };
  });

export type Snapshot = Awaited<ReturnType<typeof readHooks>>;

/** Is the world solid at this world-space point? */
export function isBlocked(hooks: Snapshot, x: number, y: number): boolean {
  const { tile, cols, rows, blocked } = hooks.world;
  const col = Math.floor(x / tile);
  const row = Math.floor(y / tile);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return true;
  return blocked[row * cols + col] === '1';
}

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
 * Press through the title screen and wait for the world. Without ?fastBoot the
 * greeting plays in full first, so this is a couple of seconds, not instant.
 */
export async function pressStart(page: Page) {
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.ready === true,
    undefined,
    { timeout: 20_000 },
  );
  // The world fades in out of the title's flash. Screenshot before it lands and
  // the visual audit trail is a picture of the flash.
  await page.waitForTimeout(400);
}

/**
 * The usual starting point for a test that cares about the world, not the door.
 * Fast by default — the front door has its own spec, and everything else was
 * paying to hear the same greeting a dozen times a run.
 */
export async function bootGame(page: Page, options: OpenOptions = { fast: true }) {
  const { canvas, errors } = await openTitle(page, options);
  await pressStart(page);
  return { canvas, errors };
}

/**
 * Wait until she is standing still, or until standing still has stopped being
 * a thing that can happen.
 *
 * Headless Chromium renders this game at somewhere around fifteen frames a
 * second, and a key-up can sit unprocessed for a couple of hundred milliseconds
 * at that rate. A position read straight after `keyboard.up` is therefore of
 * where she was, not where she is — and steering on stale readings walks her in
 * circles. Her idle animation is the game's own word for "I have seen the key
 * come up", so that is what gets waited on.
 */
async function settle(page: Page) {
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
      // A doorway takes her out of her own hands; nothing idles during one.
      return h.scene !== 'room' || h.transitioning || h.player.anim.startsWith('idle');
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** Hold a key for a while so the character actually covers some ground. */
export async function walk(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await settle(page);
}

/**
 * Walk, and read the hooks with the key still held down. Anything about being
 * in motion — the walk animation, most obviously — is gone by the time `walk()`
 * returns, because letting go is the last thing it does.
 */
export async function walkAndRead(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  const hooks = await readHooks(page);
  await page.keyboard.up(key);
  return hooks;
}

/** Walk speed in the game, so a hop can be asked for in pixels. See RoomScene. */
const WALK_SPEED = 300;

/** Shortest hop worth taking; below this the key-up latency dominates anyway. */
const MIN_HOP_MS = 70;
const MAX_HOP_MS = 700;

/**
 * How long to hold a key to cover roughly `pixels`, aiming a little short so a
 * hop lands before its target rather than past it. The world is thousands of
 * pixels across now, so a fixed 100 ms hop would need hundreds of round trips
 * to cross it; this makes a long walk a few long hops and a final approach a
 * few short ones.
 */
function hopFor(pixels: number): number {
  return Math.round(
    Math.min(MAX_HOP_MS, Math.max(MIN_HOP_MS, (Math.abs(pixels) / WALK_SPEED) * 800)),
  );
}

/**
 * A route across the zone, as world-space corners.
 *
 * Walking straight at a target worked while a room was one empty rectangle. The
 * exterior has a wood and five buildings in it and the house has four rooms, so
 * a test that walks at a landmark walks into a wall — or, worse, walks into the
 * front door on its way past. So the harness plans: breadth-first over the same
 * collision grid the game uses, then only the corners are kept, because the
 * straight bits between them are what `walk()` is for.
 *
 * If the target cannot be reached at all, the nearest reachable tile is used
 * instead and the caller's own `arrived` test decides whether that was close
 * enough. That is deliberate: a prop stands on solid tiles, and "walk up to the
 * well" means the tile beside it.
 */
function planRoute(hooks: Snapshot, to: { x: number; y: number }): { x: number; y: number }[] {
  const { tile, cols, rows, blocked } = hooks.world;
  if (!cols || !rows) return [to];

  const free = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < rows && blocked[r * cols + c] !== '1';

  const startC = Math.floor(hooks.player.x / tile);
  const startR = Math.floor(hooks.player.y / tile);
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
  const goalC = clamp(Math.floor(to.x / tile), cols - 1);
  const goalR = clamp(Math.floor(to.y / tile), rows - 1);

  const prev = new Int32Array(cols * rows).fill(-1);
  const seen = new Uint8Array(cols * rows);
  const from = startR * cols + startC;
  seen[from] = 1;

  let best = from;
  let bestDistance = Math.hypot(startC - goalC, startR - goalR);

  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head]!;
    const c = here % cols;
    const r = Math.floor(here / cols);

    const distance = Math.hypot(c - goalC, r - goalR);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = here;
    }
    if (c === goalC && r === goalR) {
      best = here;
      break;
    }

    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (!free(nc, nr)) continue;
      const next = nr * cols + nc;
      if (seen[next]) continue;
      seen[next] = 1;
      prev[next] = here;
      queue.push(next);
    }
  }

  const cells: number[] = [];
  for (let step = best; step !== -1; step = prev[step]!) {
    cells.unshift(step);
    if (step === from) break;
  }

  // Keep only the corners; a straight run of tiles is one hop, not fifteen.
  // The exact target is deliberately not appended: a prop stands on solid
  // tiles, so the route ends at the last tile she can stand on and the caller's
  // own final approach closes the rest.
  const corners: { x: number; y: number }[] = [];
  for (let i = 1; i < cells.length; i++) {
    const turn =
      i === cells.length - 1 ||
      cells[i]! - cells[i - 1]! !== cells[i + 1]! - cells[i]!;
    if (!turn) continue;
    corners.push({
      x: (cells[i]! % cols) * tile + tile / 2,
      y: Math.floor(cells[i]! / cols) * tile + tile / 2,
    });
  }
  return corners;
}

/**
 * The shortest hop the page can actually take. `walk()` asks for 70 ms and the
 * key-up lands late, so nothing under about this distance is steerable — and
 * asking for it just overshoots the other way, for ever.
 */
const MIN_STEP = 44;

/** Close enough to a corner to start heading for the next one. */
const CORNER_SLACK = 48;

/**
 * How far off the corridor she may drift before it is worth a correcting hop.
 * Under half a tile, deliberately: a route along the line between two rows puts
 * her body in the upper one, and if that row happens to be a shed she walks
 * into it for ever while the plan insists the way is clear. Correcting costs one
 * hop and overshooting the correction is harmless — the next hop re-measures.
 */
const DRIFT_SLACK = 24;

/**
 * Follow a route, then close the last gap by hand. Re-plans whenever it stops
 * making progress, because the plan is only as good as the frame it was made on
 * and she is being driven by a keyboard over a laggy page.
 *
 * There is exactly one `readHooks` per hop. Each one is a round trip to a page
 * running at twenty frames a second, and crossing this world is dozens of hops:
 * a second read to check "did that hop help" doubled the cost of the whole
 * suite, so progress is judged against the previous hop's reading instead.
 */
async function travel(
  page: Page,
  target: (hooks: Snapshot) => { x: number; y: number },
  arrived: (hooks: Snapshot) => boolean,
  what: string,
) {
  const hopToward = async (dx: number, dy: number) => {
    // The legs between a route's corners are axis-aligned, so the shorter delta
    // is drift off the corridor. Correct that first, then advance.
    const alongX = Math.abs(dx) >= Math.abs(dy);
    const drift = alongX ? dy : dx;
    if (Math.abs(drift) > DRIFT_SLACK) {
      const key = alongX
        ? drift > 0
          ? 'ArrowDown'
          : 'ArrowUp'
        : drift > 0
          ? 'ArrowRight'
          : 'ArrowLeft';
      await walk(page, key, hopFor(drift));
    }
    const main = alongX ? dx : dy;
    if (Math.abs(main) < MIN_STEP) return;
    const key = alongX ? (main > 0 ? 'ArrowRight' : 'ArrowLeft') : main > 0 ? 'ArrowDown' : 'ArrowUp';
    await walk(page, key, hopFor(main));
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    let hooks = await readHooks(page);
    if (arrived(hooks)) return;

    for (const corner of planRoute(hooks, target(hooks))) {
      let last = { x: Number.NaN, y: Number.NaN };

      for (let hop = 0; hop < 6; hop++) {
        hooks = await readHooks(page);
        if (arrived(hooks)) return;

        const here = { x: hooks.player.x, y: hooks.player.y };
        const dx = corner.x - here.x;
        const dy = corner.y - here.y;
        if (Math.hypot(dx, dy) <= CORNER_SLACK) break;
        // Wedged on something the plan did not know about. Re-plan from here.
        if (hop > 0 && Math.hypot(here.x - last.x, here.y - last.y) < 6) break;
        last = here;

        await hopToward(dx, dy);
      }
    }

    // The route ends on the last tile she can stand on. Whatever she was
    // actually sent to — a prop standing on solid tiles, a doorway — is closed
    // by walking straight at it from there.
    for (let hop = 0; hop < 8; hop++) {
      hooks = await readHooks(page);
      if (arrived(hooks)) return;

      const here = { x: hooks.player.x, y: hooks.player.y };
      const to = target(hooks);
      await hopToward(to.x - here.x, to.y - here.y);

      const now = await readHooks(page);
      if (arrived(now)) return;
      if (Math.hypot(now.player.x - here.x, now.player.y - here.y) < 6) break;
    }
  }

  const { player, room } = await readHooks(page);
  throw new Error(`never reached ${what}: player ${player.x},${player.y} in ${room}`);
}

/** Walk up to a prop — the named one, or whichever the zone lists first. */
export async function walkToProp(page: Page, id?: string) {
  const pick = (hooks: Snapshot) => {
    const prop = id ? hooks.interactables.find((p) => p.id === id) : hooks.interactables[0];
    if (!prop) throw new Error(`no prop ${id ?? '[first]'} in ${hooks.room}`);
    return prop;
  };

  await travel(
    page,
    pick,
    (hooks) => {
      const prop = pick(hooks);
      // Inside the radius with room to spare, but not so tight that a hop she
      // cannot make smaller keeps knocking her back out of it. A prop's marker
      // is the middle of the prop, and a well is solid, so the nearest she can
      // physically stand to one is most of the radius away already — a tighter
      // margin than this asks her to reach a tile that does not exist.
      return (
        Math.hypot(prop.x - hooks.player.x, prop.y - hooks.player.y) <=
        hooks.interactRadius * 0.9
      );
    },
    `prop ${id ?? '[first]'}`,
  );
}

/** Walk to a named place in the map data — "the woods", "the facade row". */
export async function walkToLandmark(page: Page, id: string, within = 90) {
  const pick = (hooks: Snapshot) => {
    const mark = hooks.landmarks.find((m) => m.id === id);
    if (!mark) throw new Error(`no landmark ${id} in ${hooks.room}`);
    return mark;
  };

  await travel(
    page,
    pick,
    (hooks) => Math.hypot(pick(hooks).x - hooks.player.x, pick(hooks).y - hooks.player.y) <= within,
    `landmark ${id}`,
  );

  // Let the camera's lerp catch up before anyone photographs the place.
  await page.waitForTimeout(500);
}

/**
 * Get through a doorway and come out the other side, whichever way that door
 * works. Returns the zone she landed in.
 *
 * Walking out of a building is automatic; walking into one is a press, the way
 * Stardew does it. The map data says which, so a test asks for "the front door"
 * and does not have to know — and the two specs that care about the difference
 * assert on it directly rather than through here.
 */
export async function walkThroughDoorway(page: Page, id?: string) {
  const from = (await readHooks(page)).room;
  const pick = (hooks: Snapshot) => {
    const door = id ? hooks.doorways.find((d) => d.id === id) : hooks.doorways[0];
    if (!door) throw new Error(`no doorway ${id ?? '[first]'} in ${hooks.room}`);
    return door;
  };

  const press = pick(await readHooks(page)).enter === 'press';

  await travel(
    page,
    pick,
    (hooks) =>
      hooks.transitioning ||
      hooks.room !== from ||
      // A press door is "arrived at" as soon as the dot would be showing; the
      // last stride into the opening is not something she ever has to make.
      (press &&
        Math.hypot(pick(hooks).x - hooks.player.x, pick(hooks).y - hooks.player.y) <=
          hooks.interactRadius * 0.9),
    `doorway ${id ?? '[first]'}`,
  );

  if (press && !(await readHooks(page)).transitioning) await page.keyboard.press('KeyZ');

  await page.waitForFunction(
    (before) => {
      const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
      return h.room !== before && !h.transitioning;
    },
    from,
    { timeout: 20_000 },
  );

  // Let the arrival flourish land, or the screenshot is of the colour wash.
  await page.waitForTimeout(560);
  return (await readHooks(page)).room;
}

/**
 * Stand her at a named place and let the camera settle. For screenshots only —
 * anything claiming a place is reachable uses `walkToLandmark`, which walks.
 */
export async function standAt(page: Page, id: string) {
  const { landmarks } = await readHooks(page);
  const mark = landmarks.find((m) => m.id === id);
  if (!mark) throw new Error(`no landmark ${id}`);

  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [mark.x, mark.y],
  );
  // One frame for the camera, one for the occlusion fade to finish.
  await page.waitForTimeout(400);
}

/**
 * Pull the camera back to the whole zone, run `take`, and put it back. For the
 * one screenshot that has to answer "does this composition read from a
 * distance" — every other one is somebody standing in the middle of it.
 */
export async function fromAbove(page: Page, take: () => Promise<unknown>) {
  const zoom = (fit: boolean) =>
    page.evaluate(
      (on) => (window as unknown as { __seraphina: Hooks }).__seraphina.overview(on),
      fit,
    );
  await zoom(true);
  await page.waitForTimeout(400);
  await take();
  await zoom(false);
  await page.waitForTimeout(300);
}

/** The voice manifest loads after boot; nothing voice-shaped works before it. */
export async function waitForVoice(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.loaded === true,
    undefined,
    { timeout: 20_000 },
  );
}
