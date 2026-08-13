import { expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Screenshots go somewhere predictable rather than into Playwright's
 * run-scoped output dir — they are how the planner visually audits changes.
 */
const SHOTS = path.join('tests', 'screenshots');
export const shot = (name: string) => path.join(SHOTS, name);

/**
 * A frame of the game, into `tests/screenshots/`.
 *
 * Deliberately the page rather than the canvas element. The canvas is laid out
 * at exactly 0,0,1280,720 — `#game` is the whole viewport and Phaser's FIT
 * scale lands the design resolution on it one-to-one — so the two produce
 * byte-identical PNGs, and the element version costs three times as much
 * because Playwright puts every element screenshot through its actionability
 * and stability checks first. Roughly a second a picture, thirty-odd pictures
 * a run. If the viewport ever stops matching GAME_WIDTH x GAME_HEIGHT this has
 * to go back to photographing the element, because the frame would then have
 * letterboxing in it.
 */
export const snap = (page: Page, file: string) => page.screenshot({ path: shot(file) });

/**
 * Wait for `count` rendered frames, or `capMs`, whichever lands first.
 *
 * Most of what the audit trail settles for is counted in frames, not
 * milliseconds: the camera is centred by hand in one, the hitbox overlay is
 * drawn on the next update, and a tree she is standing behind fades by a fixed
 * *fraction per frame*. A wall-clock wait for those is really a guess at the
 * frame rate, and headless Chromium runs this game anywhere between fifteen and
 * thirty-odd frames a second.
 *
 * The cap is there because frames alone made it slower, measured: the landmark
 * tour draws seventy sprites a stop and runs at the bottom of that range, so
 * ten honest frames cost more than the 400 ms guess they replaced. Each cap is
 * the number that used to be hard-coded at that call, so this is never worse
 * than what it replaced and is quicker every time the page is keeping up.
 *
 * Timed effects are the other kind and still wait in plain milliseconds: a
 * camera fade or a zoom tween takes as long as it says whatever the frame rate.
 */
const framesPass = (page: Page, count: number, capMs: number) => {
  const frames = page
    .evaluate((n) => {
      return new Promise<void>((resolve) => {
        let seen = 0;
        const tick = () => (++seen >= n ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    }, count)
    // When the cap wins this is left pending, and a page that then goes away
    // would reject it with nobody listening.
    .catch(() => undefined);

  return Promise.race([frames, page.waitForTimeout(capMs)]);
};

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
    frames: Record<string, number>;
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
  promptDot: boolean;
  trees: {
    id: string;
    x: number;
    y: number;
    choppable: boolean;
    state: 'standing' | 'stump' | 'gone';
  }[];
  npcs: {
    id: string;
    x: number;
    y: number;
    facing: 'down' | 'up' | 'left' | 'right';
    lines: string[];
  }[];
  tools: { slots: (string | null)[]; held: number; holding: string | null };
  giveTool: (tool: string) => number | null;
  takeTool: (tool: string) => boolean;
  quest: {
    id: string | null;
    phase: string | null;
    instruction: string | null;
    giver: string | null;
    offering: string | null;
    marker: boolean;
    slots: { id: string; filled: boolean; kind: 'gem' | 'button' }[];
    held: string[];
    objects: { id: string; x: number; y: number; broken: boolean }[];
    circle: boolean;
    inCircle: boolean;
    step: string | null;
  };
  session: () => {
    run: {
      quest: { id: string; phase: string; done: string[] } | null;
      items: string[];
      granted: string[];
      faeries: boolean;
    };
    world: Record<string, { trees: Record<string, { state: string; landed: number }> }>;
  };
  swings: number;
  whacks: number;
  treeGaps: number;
  doorways: { id: string; x: number; y: number; to: string; enter: 'walk' | 'press' }[];
  landmarks: { id: string; x: number; y: number }[];
  interactRadius: number;
  hitboxes: boolean;
  debugHitboxes: (on: boolean) => void;
  fps: number;
  sparkles: number;
  sleeps: number;
  ritualMisses: number;
  faeries: { x: number; y: number }[];
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
    bubble: { visible: boolean; speaker: string; x: number; y: number };
    say: (id: string) => void;
    scrub: (seconds: number) => void;
    timings: (id: string) => { word: string; start: number; end: number }[];
  };
};

export const readHooks = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __seraphina: Hooks }).__seraphina;
    // Functions do not survive the serialisation back to node; drop them — and
    // call the one whose whole job is to be called, so the store comes back as
    // data alongside everything else.
    const {
      pause,
      teleport,
      overview,
      debugHitboxes,
      giveTool,
      takeTool,
      session,
      voice,
      ...rest
    } = h;
    const { say, scrub, timings, ...voiceRest } = voice;
    return { ...rest, voice: voiceRest, session: session() };
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
  //
  // Driven from the mouse rather than the locator, which is the same click in
  // the same place — the canvas box starts at the origin — without the
  // actionability and stability checks Playwright runs before an element click.
  // Those cost the best part of a second each on a page rendering this slowly,
  // once per test, and there is nothing here they could catch: the assertions
  // above have already established the canvas is visible and laid out.
  await page.mouse.click(20, 20);

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

/**
 * Press a key and let go, slowly enough that the game sees it.
 *
 * `page.keyboard.press` sends the down and the up with nothing between them,
 * and Phaser's Key clears its own just-pressed flag on the up — so a press that
 * lands entirely inside one frame is not merely late, it is gone. Headless
 * Chromium draws this game at fifteen to twenty frames a second, which makes
 * that a coin toss on every press and a certainty somewhere in a run of five.
 *
 * So: hold it across a couple of frames. Nothing in the game is sensitive to
 * how long a button is held — every button in it is edge-triggered — so this is
 * only ever a more honest version of the same press.
 */
export async function tap(page: Page, key: string) {
  await page.keyboard.down(key);
  // Frames, not milliseconds: what has to happen between the down and the up is
  // that the game gets a turn, and how long that takes is the frame rate's
  // business. A stalled tab can hand this game a quarter-second frame.
  await framesPass(page, 3, 500);
  await page.keyboard.up(key);
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
    //
    // One read per hop here too: the reading taken after a hop is the same
    // reading the next hop wants to aim from, so taking it twice was paying a
    // round trip to a slow page for a number already in hand.
    hooks = await readHooks(page);
    for (let hop = 0; hop < 8; hop++) {
      if (arrived(hooks)) return;

      const here = { x: hooks.player.x, y: hooks.player.y };
      const to = target(hooks);
      await hopToward(to.x - here.x, to.y - here.y);

      hooks = await readHooks(page);
      if (arrived(hooks)) return;
      if (Math.hypot(hooks.player.x - here.x, hooks.player.y - here.y) < 6) break;
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
      const away = (m: { x: number; y: number }) =>
        Math.hypot(m.x - hooks.player.x, m.y - hooks.player.y);
      // Inside the radius with room to spare, but not so tight that a hop she
      // cannot make smaller keeps knocking her back out of it. A prop's marker
      // is the middle of the prop, and a well is solid, so the nearest she can
      // physically stand to one is most of the radius away already — a tighter
      // margin than this asks her to reach a tile that does not exist.
      if (away(prop) > hooks.interactRadius * 0.9) return false;
      // And it has to be the *nearest* one, because that is what the green dot
      // is drawn over and therefore what a press will fire. The well stands two
      // tiles from her own front door: stopping a stride short of it puts the
      // door nearer, and the press she was walked here to make opens the house.
      return hooks.interactables.every((other) => other.id === prop.id || away(other) >= away(prop));
    },
    `prop ${id ?? '[first]'}`,
  );
}

/**
 * Stand her within reach of a prop, without walking there.
 *
 * The end state is the one `walkToProp` leaves her in — inside the interact
 * radius and the nearest interactable, so the green dot is over this prop and a
 * press fires this prop — reached by teleport instead of on foot. For the tests
 * whose claim is about what a prop does when it is poked rather than about
 * getting to it. `smoke.spec` still walks up to the well and `world.spec` still
 * walks to the wood; those two are what prove the walking works, and everything
 * else was paying for the same journey again.
 *
 * It finishes by handing over to `walkToProp`, which returns immediately when
 * she is already close enough and closes the gap with a hop or two when the
 * only tile she can stand on is round the far side of the thing.
 */
export async function standByProp(page: Page, id: string) {
  const prop = (await readHooks(page)).interactables.find((p) => p.id === id);
  if (!prop) throw new Error(`no prop ${id} to stand by`);

  // Aimed at the prop itself: `teleport` puts her on the nearest tile she can
  // actually stand on, which for anything solid is the one beside it.
  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [prop.x, prop.y],
  );
  await framesPass(page, 4, 200);
  await walkToProp(page, id);
}

/**
 * Stand her a deliberate distance from an interactable rather than on top of it.
 *
 * `standByProp` aims at the thing itself and lets `nearestStanding` sort it out,
 * which is right for a well: a well is solid, so the nearest tile she can stand
 * on is beside it. A person is not solid — she walks straight through her own
 * sister — so aiming at one puts her *inside* it, and every question about where
 * the speech balloon went then has the same answer for both of them.
 *
 * `by` is in world pixels from the target. It still finishes through
 * `walkToProp`, so the end state is the usual one: in reach, and the nearest
 * thing to her, which is what the dot is over and what a press will fire.
 */
export async function standNear(page: Page, id: string, by: { x?: number; y?: number }) {
  const thing = (await readHooks(page)).interactables.find((p) => p.id === id);
  if (!thing) throw new Error(`no interactable ${id} to stand near`);

  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [thing.x + (by.x ?? 0), thing.y + (by.y ?? 0)],
  );
  await framesPass(page, 4, 200);
  await walkToProp(page, id);
}

/**
 * Stand her within reach of a tree, with nothing else within reach of her.
 *
 * Not `standByProp` any more, and the difference is the whole of the green
 * button's new rule. A tree is not an interactable: the axe is what green does
 * when *nothing* is in reach, so "close enough to chop this tree" now means both
 * near the tree and clear of everything that would take the press instead. A
 * spec that stopped one stride from a well would swing at nothing and be told
 * the axe is broken.
 */
export async function standByTree(page: Page, id: string) {
  const pick = (hooks: Snapshot) => {
    const tree = hooks.trees.find((t) => t.id === id);
    if (!tree) throw new Error(`no tree ${id} in ${hooks.room}`);
    return tree;
  };

  const tree = pick(await readHooks(page));
  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [tree.x, tree.y],
  );
  await framesPass(page, 4, 200);

  await travel(
    page,
    pick,
    (hooks) => {
      const away = (m: { x: number; y: number }) =>
        Math.hypot(m.x - hooks.player.x, m.y - hooks.player.y);
      if (away(pick(hooks)) > hooks.interactRadius * 0.9) return false;
      return hooks.interactables.every((other) => away(other) > hooks.interactRadius);
    },
    `tree ${id}`,
  );
}

/**
 * Stand her within swinging distance of one of the quest's gem rocks, with
 * nothing else in reach of her.
 *
 * `standByTree`'s twin, and for the same reason: a rock is not an interactable —
 * the tool in her hand is what green does when *nothing* is in reach — so "close
 * enough to crack this stone" means both near it and clear of everything that
 * would take the press instead. It also has to be the nearest thing she could
 * hit, because the swing picks the nearest of the trees and the stones together.
 */
export async function standByRock(page: Page, id: string) {
  const pick = (hooks: Snapshot) => {
    const rock = hooks.quest.objects.find((o) => o.id === id);
    if (!rock) throw new Error(`no quest object ${id} in ${hooks.room}`);
    return rock;
  };

  const rock = pick(await readHooks(page));
  await page.evaluate(
    ([x, y]) => (window as unknown as { __seraphina: Hooks }).__seraphina.teleport(x!, y!),
    [rock.x, rock.y],
  );
  await framesPass(page, 4, 200);

  await travel(
    page,
    pick,
    (hooks) => {
      const here = pick(hooks);
      const away = (m: { x: number; y: number }) =>
        Math.hypot(m.x - hooks.player.x, m.y - hooks.player.y);
      if (away(here) > hooks.interactRadius * 0.9) return false;
      if (hooks.interactables.some((other) => away(other) <= hooks.interactRadius)) return false;
      // And nearer than any trunk, or the swing goes into the wood instead.
      return hooks.trees
        .filter((tree) => tree.state !== 'gone')
        .every((tree) => away(tree) > away(here));
    },
    `gem rock ${id}`,
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

  // Let the camera's lerp catch up before anyone photographs the place. It
  // closes 12% of the remaining gap per frame, so this is a count of frames and
  // not a length of time: a dozen puts it within a fifth of where it is going.
  await framesPass(page, 12, 500);
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

  if (press && !(await readHooks(page)).transitioning) await tap(page, 'KeyZ');

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
  // One frame for the camera, and the rest for the occlusion fade: anything she
  // lands behind gives up 22% of its remaining opacity per frame, so ten frames
  // leaves it within a twentieth of where it settles — which is nothing a
  // screenshot of a wood can show. Frames rather than milliseconds because that
  // is the unit the fade is actually written in.
  await framesPass(page, 10, 400);
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
  // Both ends of this set the camera outright rather than tweening it, so what
  // is being waited for is the redraw, not a duration.
  await zoom(true);
  await framesPass(page, 3, 400);
  await take();
  await zoom(false);
  await framesPass(page, 2, 300);
}

/**
 * Turn the hitbox overlay on, run `take`, and turn it back off.
 *
 * In the game the overlay is the B key held down, which is not a thing a
 * screenshot can do — Playwright's key-up would land somewhere unpredictable in
 * a page running at twenty frames a second, and half the audit trail would come
 * back without the overlay on it. So the pinning hook is used instead, and the
 * spec that cares proves the key itself works by holding it.
 */
export async function withHitboxes(page: Page, take: () => Promise<unknown>) {
  const pin = (on: boolean) =>
    page.evaluate(
      (v) => (window as unknown as { __seraphina: Hooks }).__seraphina.debugHitboxes(v),
      on,
    );
  await pin(true);
  // The overlay is drawn by the next update, so that is all there is to wait
  // for — one frame to draw it, one in hand.
  await framesPass(page, 2, 200);
  await take();
  await pin(false);
}

/**
 * Wait until nobody is talking.
 *
 * The little things she says to herself are dropped rather than queued while a
 * real line is in the air — see `SpeechBubble.bark` — so "did the swing make her
 * ask for the axe" is a question that can only be asked of a quiet moment. It
 * needs asking because finishing a quest phase ends with the next instruction
 * spoken, and the three seconds of that overlap whatever the test does next.
 */
export async function waitForQuiet(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId === null,
    undefined,
    { timeout: 20_000 },
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
