/**
 * Three tiny faeries, following her about.
 *
 * They are what the quest was *for*, so they had to be the one thing in the game
 * that comes with her: out of the fire, across every doorway, and there until
 * the page is closed. The session store holds one flag — see `session.faeries` —
 * and every zone that builds itself with that flag set puts three of these out
 * beside her. There is nothing else to remember about one, because a faerie has
 * no position worth keeping: it is wherever she is.
 *
 * **The pack has nothing like them**, so they are drawn: a bright core inside a
 * soft pool of light, tinted the three colours of the stones she cracked open —
 * the gems became the faeries, which is a thing a four-year-old will notice
 * without being told. A v0 to be replaced the day there is art for them; what it
 * has to get right is that they read as *alive*, which is the bob and the drift
 * and nothing about the sprite.
 *
 * **They are deliberately not part of the world.** No collision, no pathfinding,
 * no tile they are standing on — they float over everything and steer by nothing
 * but where she is. That is not a shortcut, it is the design: three followers
 * that could be walked into, or that could get stuck behind a barrel, would be
 * three new ways for a four-year-old to be stuck.
 */

import Phaser from 'phaser';
import { DEPTH } from '../config';
import { makeGlow } from '../ui/ButtonDot';
import { GEM_ICONS, GEM_IDS } from '../ui/toolIcons';

/** How far from her they are allowed to drift, in screen pixels. */
const LEASH = 130;

/** How much of the gap to her they close per second. A drift, not a chase. */
const CATCH_UP = 3.2;

/** How high the bob goes, and how long one takes. */
const BOB = 9;
const BOB_MS = 1500;

/** How long a mote keeps the same idea of where it wants to be. */
const WANDER_MS = { min: 1200, max: 2600 };

/** How big the core and its pool of light are. */
const CORE_RADIUS = 5;
const GLOW_RADIUS = 40;

interface Mote {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Arc;
  /** Where it wants to be, relative to her. */
  want: { x: number; y: number };
  /** Where it is, in world pixels, before the bob is added. */
  at: { x: number; y: number };
  /** Milliseconds until it changes its mind. */
  restless: number;
  /** Its own place in the bob, so three of them never move as one. */
  phase: number;
}

export class Faeries {
  private readonly motes: Mote[] = [];
  private clock = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
  ) {
    for (let i = 0; i < GEM_IDS.length; i++) {
      const tint = GEM_ICONS[GEM_IDS[i]!].tint;
      const glow = makeGlow(scene, x, y, GLOW_RADIUS, tint, 0.85).setDepth(DEPTH.faeries);
      const core = scene.add
        .circle(x, y, CORE_RADIUS, 0xffffff, 0.95)
        .setStrokeStyle(3, tint, 0.9)
        .setDepth(DEPTH.faeries + 1);

      const mote: Mote = {
        glow,
        core,
        want: { x: 0, y: 0 },
        at: { x, y },
        restless: 0,
        phase: (i * Math.PI * 2) / GEM_IDS.length,
      };
      this.wander(mote);
      this.motes.push(mote);

      // A twinkle, on its own clock. Three lights bobbing in step read as one
      // machine with three bulbs on it; three that breathe at different rates
      // read as three of something alive. It is the cheapest half of that
      // illusion and it costs one tween each, for ever.
      scene.tweens.add({
        targets: [glow, core],
        scale: { from: 0.82, to: 1.16 },
        duration: 900 + i * 190,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /**
   * Follow her. Called once a frame with the delta and where she is.
   *
   * Nothing here asks the world anything: no collision test, no tile lookup, no
   * route. Three motes easing towards three moving points is the whole of it,
   * which is why this can run every frame in every zone and cost nothing.
   */
  update(deltaMs: number, x: number, y: number): void {
    this.clock += deltaMs;
    const seconds = Math.min(deltaMs, 250) / 1000;
    // Exponential approach, framerate-independent: a fixed fraction per second
    // rather than per frame, so they drift the same on a slow headless page as
    // on a real machine.
    const closed = 1 - Math.exp(-CATCH_UP * seconds);

    for (const mote of this.motes) {
      mote.restless -= deltaMs;
      if (mote.restless <= 0) this.wander(mote);

      mote.at.x += (x + mote.want.x - mote.at.x) * closed;
      mote.at.y += (y + mote.want.y - mote.at.y) * closed;

      const bob = Math.sin((this.clock / BOB_MS) * Math.PI * 2 + mote.phase) * BOB;
      mote.glow.setPosition(mote.at.x, mote.at.y + bob);
      mote.core.setPosition(mote.at.x, mote.at.y + bob);
    }
  }

  /**
   * She did something. They spin.
   *
   * Nearly free — one tween per mote, and it is the difference between three
   * lights that follow her and three lights that are *pleased about* whatever
   * she just poked.
   */
  cheer(): void {
    for (const mote of this.motes) {
      // A hop and a scatter, done by moving where they *are* and where they want
      // to be rather than by tweening the sprites — `update` writes their
      // positions every frame, so a position tween would be painted over. It
      // also leaves the twinkle running, which killing tweens here would not.
      mote.at.y -= 22;
      this.wander(mote);
      this.scene.tweens.add({
        targets: mote.glow,
        alpha: { from: 1, to: 0.85 },
        duration: 280,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Where each of them is, for a test that wants to know they exist. */
  get positions(): { x: number; y: number }[] {
    return this.motes.map((m) => ({ x: m.core.x, y: m.core.y }));
  }

  destroy(): void {
    for (const mote of this.motes) {
      this.scene.tweens.killTweensOf(mote.core);
      this.scene.tweens.killTweensOf(mote.glow);
      mote.core.destroy();
      mote.glow.destroy();
    }
    this.motes.length = 0;
  }

  /** A new idea of where to be: somewhere inside the leash, at her shoulder. */
  private wander(mote: Mote): void {
    const angle = Math.random() * Math.PI * 2;
    const reach = LEASH * (0.35 + Math.random() * 0.65);
    mote.want = {
      x: Math.cos(angle) * reach,
      // Biased upwards: they belong around her head and shoulders, where they
      // are never between the player and the thing she is walking up to.
      y: Math.sin(angle) * reach * 0.55 - 46,
    };
    mote.restless = WANDER_MS.min + Math.random() * (WANDER_MS.max - WANDER_MS.min);
  }
}
