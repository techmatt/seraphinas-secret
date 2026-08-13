/**
 * A bunny: something small that hops, and the one thing in this game that
 * follows her because she asked it to.
 *
 * **The art is a frog, and this is the only file that knows.** There is no
 * rabbit, hare or bunny anywhere in the twelve packs — 1243 PNGs were searched
 * for one — and the frog is the only animal in any of them that *hops*, which is
 * the half of a bunny that has to be true on screen. So the palest of its six
 * colourways stands in until Matt draws real ones. Everything else in the game
 * says bunny: the asset key, the ids, the lines, the quest row. Nothing outside
 * this file may say frog, and swapping the art later is the four constants
 * below and nothing else. See CLAUDE.md.
 *
 * **They are deliberately not part of the world.** No collision, no tile they
 * stand on, no route — they hop where they like and she walks straight through
 * them, exactly like the faeries and for exactly the same reason: three animals
 * that could be walked into, or that could get stuck behind a stump, would be
 * three new ways for a four-year-old to be stuck. It is also what lets them hop
 * out over a felled ring without anybody working out where the gap is.
 */

import Phaser from 'phaser';
import { WORLD_SCALE } from '../config';

/**
 * The sheet. `Frog_06` is the whitest of the six colourways — cream body, white
 * highlights, mean luminance 99 against the green one's 80 — which is the
 * nearest thing in the pack to a white rabbit.
 *
 * 320x128 = ten columns by four rows of 32 px. Row 0 is two frames of idle
 * (sitting, then settling), row 1 is eight frames of the hop, row 2 is a tongue
 * lashing out at a fly and row 3 is a hurt flash. Only the first two are used;
 * nothing in this game hurts an animal and a bunny does not catch flies.
 */
const SHEET = 'assets/Cute_Fantasy/Animals/Frog/Frog_06.png';
const FRAME = 32;
const COLUMNS = 10;

/** Row 0, two frames. She is sitting still. */
const IDLE = { first: 0, count: 2, fps: 3 };
/** Row 1, eight frames. Drawn facing right; left is `flipX`, as everywhere. */
const HOP = { first: COLUMNS, count: 8, fps: 12 };

/**
 * The bunny, cropped out of its own frame, for a box on the quest row.
 *
 * The art is eleven pixels square in the middle of a thirty-two pixel cell, so
 * the whole frame drawn in a 48-pixel box is a bunny the size of a fingernail
 * with nothing round it. A named sub-frame is registered on the same texture
 * instead, and the row scales *that* — which is the only way a box on the quest
 * row and the animal in the grass are the same picture.
 */
export const BUNNY_ICON = { file: SHEET, frame: 'bunny-icon', size: 13 } as const;

const ICON_CROP = { x: 10, y: 10, w: 13, h: 12 } as const;

/** How far down its own cell the animal's feet are. Measured off the pixels. */
const FOOT = 21 / FRAME;

const ANIM_IDLE = 'bunny-idle';
const ANIM_HOP = 'bunny-hop';

/** How far she has to be from a wander target before it counts as reached. */
const ARRIVED = 6;

/** How fast a bunny travels, in screen pixels a second. Under half her speed. */
const HOP_SPEED = 130;

/** ...and how fast one follows her, which has to be a little more. */
const FOLLOW_SPEED = 250;

/** How close behind her a follower settles. Near enough to be hers. */
const HEEL = 74;

/** How long a bunny keeps the same idea of where it wants to be. */
const RESTLESS = { min: 900, max: 2600 };

/**
 * What a bunny is doing. Never stored — every one of these is worked out from
 * the quest each time the zone is built, which is what makes a bunny survive a
 * doorway without anything remembering where it was standing.
 */
export type BunnyMood = 'penned' | 'loose' | 'following' | 'home';

/** Queue the sheet. Called from a scene's preload, like any other art. */
export function preloadBunnies(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHEET)) return;
  scene.load.spritesheet(SHEET, SHEET, { frameWidth: FRAME, frameHeight: FRAME });
}

/**
 * Register the two animations and the row's crop. Idempotent, and safe to call
 * before the sheet has arrived — a zone whose art never loaded plays no bunnies
 * and throws nothing.
 */
export function registerBunnyAnims(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SHEET)) return;
  const texture = scene.textures.get(SHEET);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  if (!texture.has(BUNNY_ICON.frame)) {
    texture.add(BUNNY_ICON.frame, 0, ICON_CROP.x, ICON_CROP.y, ICON_CROP.w, ICON_CROP.h);
  }

  const make = (key: string, from: { first: number; count: number; fps: number }) => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(SHEET, {
        start: from.first,
        end: from.first + from.count - 1,
      }),
      frameRate: from.fps,
      repeat: -1,
    });
  };
  make(ANIM_IDLE, IDLE);
  make(ANIM_HOP, HOP);
}

/**
 * Somewhere a bunny wanders, in **world pixels**: a point and how far from it.
 *
 * Pixels rather than tiles, and that is the one convention this file has: a
 * bunny is off the grid entirely — it stands on nothing and collides with
 * nothing — so tiles would be a unit it never uses for anything. The scene
 * converts, once, at each call.
 */
export interface Roam {
  x: number;
  y: number;
  r: number;
}

export class Bunny {
  private readonly sprite: Phaser.GameObjects.Sprite | null;

  /** Where it is, in world pixels. Its feet, like everything else in the game. */
  private at: { x: number; y: number };

  /** Where it currently wants to be, and how long before it changes its mind. */
  private want: { x: number; y: number };
  private restless = 0;

  /** Where it wanders around, and how far it is willing to go from there. */
  private home: { x: number; y: number };
  private leash: number;

  private mood: BunnyMood;

  /** True while the hop animation is playing, so it is not restarted per frame. */
  private hopping = false;

  constructor(
    scene: Phaser.Scene,
    readonly id: string,
    /** Where it starts, in world pixels. */
    spot: { x: number; y: number },
    mood: BunnyMood,
    range: Roam,
  ) {
    this.at = { ...spot };
    this.home = { x: range.x, y: range.y };
    this.leash = range.r;
    this.mood = mood;
    this.want = { ...this.at };

    this.sprite = scene.textures.exists(SHEET)
      ? scene.add
          .sprite(this.at.x, this.at.y, SHEET, 0)
          // Hung from the middle of its feet, so its position is the point it
          // stands on and it sorts against the world by the same number
          // everything else does. The animal is drawn at rows 11..20 of a
          // thirty-two pixel cell, so its feet are 21/32 of the way down and the
          // rest of the frame is the room the tongue needs in a row this game
          // does not use.
          .setOrigin(0.5, FOOT)
          .setScale(WORLD_SCALE)
          .setDepth(this.at.y)
      : null;
    this.sprite?.play(ANIM_IDLE);
    this.wander();
  }

  get x(): number {
    return this.at.x;
  }

  get y(): number {
    return this.at.y;
  }

  get state(): BunnyMood {
    return this.mood;
  }

  /** Whether the green button is about this one: a loose bunny, and only that. */
  get taggable(): boolean {
    return this.mood === 'loose';
  }

  /**
   * The ring has come open. Off it goes, through the hole she made.
   *
   * `gap` is where the tree came down, and it is what the bunny heads for first
   * — so what she watches is three animals leaving by the way she opened, rather
   * than three animals discovering they were never fenced in. They have no
   * collision and never did; this is the picture, and the picture is the point.
   */
  release(gap: { x: number; y: number }, range: Roam): void {
    this.mood = 'loose';
    this.home = { x: range.x, y: range.y };
    this.leash = range.r;
    this.want = { ...gap };
    this.restless = 1400;
  }

  /** She gave it a carrot. It comes with her now. */
  follow(): void {
    this.mood = 'following';
  }

  /** It is home. It stops here and settles down. */
  settle(range: Roam): void {
    this.mood = 'home';
    this.home = { x: range.x, y: range.y };
    this.leash = range.r;
    this.wander();
  }

  /** Put it down somewhere outright. For a zone rebuilding what it already knew. */
  placeAt(x: number, y: number): void {
    this.at = { x, y };
    this.want = { x, y };
    this.sprite?.setPosition(x, y);
  }

  /**
   * One frame. `her` is where Seraphina is standing, which is the only thing in
   * the world a bunny steers by.
   *
   * Nothing here asks the world anything — no collision test, no tile lookup, no
   * route. A point easing towards another point is the whole of it, which is why
   * three of these can run every frame in a zone with two hundred trees in it and
   * cost nothing.
   */
  update(deltaMs: number, her: { x: number; y: number }): void {
    const seconds = Math.min(deltaMs, 250) / 1000;

    if (this.mood === 'following') {
      // Behind her rather than on her: a bunny drawn under her feet is a bunny
      // she has lost. It aims at a point a stride back the way she came, which
      // for somebody who is standing still is simply a stride below her.
      this.want = { x: her.x, y: her.y + HEEL * 0.35 };
    } else {
      this.restless -= deltaMs;
      if (this.restless <= 0) this.wander();
    }

    const dx = this.want.x - this.at.x;
    const dy = this.want.y - this.at.y;
    const gap = Math.hypot(dx, dy);
    const near = this.mood === 'following' ? HEEL : ARRIVED;

    if (gap <= near) {
      this.rest();
    } else {
      const speed = this.mood === 'following' ? FOLLOW_SPEED : HOP_SPEED;
      const step = Math.min(gap, speed * seconds);
      this.at.x += (dx / gap) * step;
      this.at.y += (dy / gap) * step;
      this.hop(dx);
    }

    this.sprite?.setPosition(this.at.x, this.at.y).setDepth(this.at.y);
  }

  destroy(): void {
    this.sprite?.destroy();
  }

  // --- what it looks like ---------------------------------------------------

  private hop(dx: number): void {
    const sprite = this.sprite;
    if (!sprite) return;
    // Drawn facing right; there is no left row anywhere in this pack.
    if (Math.abs(dx) > 1) sprite.setFlipX(dx < 0);
    if (this.hopping) return;
    this.hopping = true;
    sprite.play(ANIM_HOP, true);
  }

  private rest(): void {
    if (!this.hopping) return;
    this.hopping = false;
    this.sprite?.play(ANIM_IDLE, true);
  }

  /** A new idea of where to be: somewhere inside the leash, around home. */
  private wander(): void {
    const angle = Math.random() * Math.PI * 2;
    const reach = this.leash * (0.15 + Math.random() * 0.85);
    this.want = {
      x: this.home.x + Math.cos(angle) * reach,
      // Squashed, because the ground is drawn in perspective and a circle of
      // wander reads as an oval of grass.
      y: this.home.y + Math.sin(angle) * reach * 0.7,
    };
    this.restless = RESTLESS.min + Math.random() * (RESTLESS.max - RESTLESS.min);
  }
}
