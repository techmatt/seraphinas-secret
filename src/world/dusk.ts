/**
 * The evening, out of doors.
 *
 * Two things laid over the world and nothing else: a sheet of blue that takes
 * the light out of it, and a scatter of warm motes that come out once the blue
 * is in. The third half of the evening — lamp posts and torches coming alive —
 * is not here, because a lamp is a thing standing in the world and belongs to
 * whatever put it there; see `TileWorld.setDusk`.
 *
 * **It is a cozy floor, not a night.** The sheet stops well short of dark and
 * the colour is blue-violet rather than grey or black: this is a picture-book
 * evening, an invitation to go home, and never a thing to be frightened of. The
 * same rule the night sky in `nightfall.ts` follows, and for the same reason —
 * she is four, and the only correct amount of scary is none.
 *
 * The sheet is welded to the camera. It has to cover the whole view of a world
 * that is four thousand pixels across, and one rectangle the size of the screen
 * is cheaper than one the size of the map and cannot ever be out-scrolled. The
 * fireflies are the other way round — they are *in* the world, drifting past
 * fence posts rather than sliding across the glass — so they are ordinary world
 * objects with a leash on her, the same arrangement the faeries have.
 */

import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { makeGlow } from '../ui/ButtonDot';

/** The colour the evening comes in as: blue-violet, never grey and never black. */
const EVENING = 0x2b2a63;

/**
 * How far down the light is allowed to go.
 *
 * The one number in this file worth arguing about. Under a third and nothing
 * has happened; past a half and the village stops reading, which for a
 * four-year-old who navigates by what things look like is the same as turning
 * the game off. This is dim enough that the lamps have something to be brighter
 * than, and light enough that she can still see her own front door.
 */
const FLOOR_ALPHA = 0.44;

/** How many motes are out at full dusk. */
const FLY_COUNT = 16;

/** How big one is: a bright fleck inside a small pool of warm light. */
const FLY_CORE = 2.4;
const FLY_GLOW = 17;

/** Firefly yellow — warm, and a shade greener than a lamp. */
const FLY_TINT = 0xffe98a;

/**
 * How far from her a mote may be. Wider than the screen on purpose: they have to
 * be *arriving* from somewhere, not orbiting her like the faeries do.
 */
const LEASH_X = 760;
const LEASH_Y = 430;

/** How much of the gap to where it wants to be a mote closes per second. */
const DRIFT = 0.55;

/** How long a mote keeps the same idea of where it is going. */
const RESTLESS_MS = { min: 2200, max: 5200 };

/** How long one takes to breathe in and out, and how far apart two of them are. */
const PULSE_MS = { min: 1500, max: 3400 };

interface Fly {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Arc;
  /** Where it is, in world pixels. */
  at: { x: number; y: number };
  /** Where it wants to be, relative to her. */
  want: { x: number; y: number };
  /** Milliseconds until it changes its mind. */
  restless: number;
  /** Its own pulse: how long one breath takes, and where in one it currently is. */
  period: number;
  phase: number;
}

export class Dusk {
  private readonly sheet: Phaser.GameObjects.Rectangle;
  private readonly flies: Fly[] = [];

  /** 0 in full daylight, 1 once the evening is all the way in. */
  private level = 0;
  private clock = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Four screens wide, for one screen's worth of job. A camera fixed to the
    // screen is still a camera that can be zoomed, and the screenshot tour pulls
    // right back to fit the whole village in — at which point a sheet cut to the
    // design resolution would be a rectangle of evening sitting in the middle of
    // a daylit map. Oversizing it costs one quad.
    this.sheet = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 4, GAME_HEIGHT * 4, EVENING)
      .setScrollFactor(0)
      .setAlpha(0)
      .setDepth(DEPTH.dusk);

    for (let i = 0; i < FLY_COUNT; i++) {
      const glow = makeGlow(scene, x, y, FLY_GLOW, FLY_TINT, 0).setDepth(DEPTH.fireflies);
      const core = scene.add
        .circle(x, y, FLY_CORE, 0xfffbe0, 1)
        .setAlpha(0)
        .setDepth(DEPTH.fireflies + 1);

      const fly: Fly = {
        glow,
        core,
        at: { x, y },
        want: { x: 0, y: 0 },
        restless: 0,
        period: PULSE_MS.min + Math.random() * (PULSE_MS.max - PULSE_MS.min),
        phase: Math.random() * Math.PI * 2,
      };
      // Scattered before the first frame rather than eased out from her feet:
      // sixteen lights fanning out of one point is a firework, and what this is
      // supposed to be is a field that already had fireflies in it.
      this.wander(fly);
      fly.at = { x: x + fly.want.x, y: y + fly.want.y };
      this.flies.push(fly);
    }
  }

  /**
   * How far into the evening it is. Written every frame off the day clock, so
   * the ramp is the clock's shape and this file has no opinion about time.
   */
  setLevel(level: number): void {
    this.level = Phaser.Math.Clamp(level, 0, 1);
    this.sheet.setAlpha(this.level * FLOOR_ALPHA);
  }

  /** Where the evening currently is, for the test hooks. */
  get dusk(): number {
    return this.level;
  }

  /** How many motes are actually showing. Zero in daylight, by construction. */
  get flyCount(): number {
    return this.level > 0 ? this.flies.length : 0;
  }

  /** Where each of them is, for anyone who wants to prove they are out. */
  get positions(): { x: number; y: number }[] {
    return this.flies.map((f) => ({ x: f.core.x, y: f.core.y }));
  }

  /**
   * Drift, once a frame, with the delta and where she is.
   *
   * Nothing here asks the world anything — no collision, no tile, no route.
   * Fireflies go through fences, and that is not a shortcut: a mote that could
   * be walked into or that got stuck behind a shed would be a new way for a
   * four-year-old to be stuck. Same rule the faeries have, written down again
   * because it is the rule that keeps this cheap.
   */
  update(deltaMs: number, x: number, y: number): void {
    this.clock += deltaMs;

    // In broad daylight there is nothing to move. Costs one comparison a frame
    // for the eight minutes of the day this file has no business in.
    if (this.level <= 0) {
      for (const fly of this.flies) {
        if (fly.glow.alpha === 0) continue;
        fly.glow.setAlpha(0);
        fly.core.setAlpha(0);
      }
      return;
    }

    const seconds = Math.min(deltaMs, 250) / 1000;
    const closed = 1 - Math.exp(-DRIFT * seconds);

    for (const fly of this.flies) {
      fly.restless -= deltaMs;
      if (fly.restless <= 0) this.wander(fly);

      fly.at.x += (x + fly.want.x - fly.at.x) * closed;
      fly.at.y += (y + fly.want.y - fly.at.y) * closed;

      // Each on its own clock, at its own rate. Sixteen lights breathing
      // together read as one string of fairy lights; sixteen that do not read as
      // sixteen of something alive. The same trick the faeries and the stars
      // both use, and the cheapest half of the illusion in all three.
      const breath = Math.sin((this.clock / fly.period) * Math.PI * 2 + fly.phase);
      const lit = this.level * (0.18 + 0.82 * (0.5 + 0.5 * breath));

      fly.glow.setPosition(fly.at.x, fly.at.y).setAlpha(lit);
      fly.core.setPosition(fly.at.x, fly.at.y).setAlpha(lit);
    }
  }

  destroy(): void {
    this.sheet.destroy();
    for (const fly of this.flies) {
      fly.glow.destroy();
      fly.core.destroy();
    }
    this.flies.length = 0;
  }

  /** A new idea of where to be: somewhere in the field around her. */
  private wander(fly: Fly): void {
    fly.want = {
      x: (Math.random() * 2 - 1) * LEASH_X,
      // Biased upwards a little, so they are around head height and above rather
      // than swarming her feet.
      y: (Math.random() * 2 - 1) * LEASH_Y - 60,
    };
    fly.restless = RESTLESS_MS.min + Math.random() * (RESTLESS_MS.max - RESTLESS_MS.min);
  }
}
