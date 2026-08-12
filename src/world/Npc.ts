/**
 * Somebody who lives here.
 *
 * An NPC is a Character that does not walk: the same paper-doll stack as
 * Seraphina, standing where the layout put them, breathing their idle row and
 * turning to look at her when she says hello. Everything that makes them a
 * *person* rather than a prop is in this file, and it is deliberately three
 * small things — they face you, they wobble when you walk through them, and
 * they have more than one thing to say.
 *
 * They have no collision, on purpose. A four-year-old aiming a thumbstick will
 * pin herself against anything that stands its ground, and being stuck behind
 * her own little sister is a fail state with a friendly face on it. So she walks
 * straight through, and the wobble is what stops that reading as a ghost.
 */

import Phaser from 'phaser';
import { Character } from './Character';
import { CHARACTER_SHEETS } from './characterSheets';
import type { MapNpc } from './mapData';
import { WORLD_SCALE } from '../config';

/** How close she has to be before somebody notices her walking through them. */
const CROWDED = 26 * WORLD_SCALE;

/** The wobble: how far, and how long. Small — this is a flinch, not a jump. */
const WIGGLE_Y = 7;
const WIGGLE_MS = 90;

/** The sheet a map file's `sheet` string names, or Seraphina's as a fallback. */
export function sheetFor(name: string) {
  return CHARACTER_SHEETS[name] ?? CHARACTER_SHEETS.seraphina!;
}

export class Npc extends Character {
  /**
   * Which line comes next. Repeated presses walk the list and wrap, which is
   * the whole of "talking to somebody" until there is a quest engine to ask
   * whose turn it is to say what.
   */
  private nextLine = 0;

  /**
   * True while she is standing in them. Held rather than timed, so the wobble
   * fires once on the way in instead of once a frame for as long as she loiters
   * — which would be a person having a fit rather than a person being bumped.
   */
  private crowded = false;

  constructor(
    scene: Phaser.Scene,
    readonly def: MapNpc,
  ) {
    super(scene, def.x * WORLD_SCALE, def.y * WORLD_SCALE, sheetFor(def.sheet));
    this.face(def.facing);
    // People do not move, so their depth is decided once. It is their feet, the
    // same as everything else in the world, so she passes in front of somebody
    // standing further up the screen and behind somebody further down.
    this.setDepth(this.y);
  }

  get id(): string {
    return this.def.id;
  }

  /** The next thing they have to say, or null for somebody with nothing. */
  say(): string | null {
    if (this.def.lines.length === 0) return null;
    const line = this.def.lines[this.nextLine % this.def.lines.length]!;
    this.nextLine++;
    return line;
  }

  /** Turn to look at a point — she has come over and said something. */
  lookAt(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    this.face(
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
    );
  }

  /**
   * Wobble if she has just walked into them. Called once a frame with where she
   * is; does nothing at all until the frame she crosses the line, and nothing
   * again until she has left and come back.
   */
  jostle(x: number, y: number): void {
    const inside = Math.hypot(x - this.x, y - this.y) < CROWDED;
    if (inside === this.crowded) return;
    this.crowded = inside;
    if (!inside) return;

    const home = this.y;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      y: home - WIGGLE_Y,
      duration: WIGGLE_MS,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      // Put back by hand: a tween interrupted by her walking out and back in
      // would otherwise leave somebody standing a few pixels off the ground for
      // the rest of the zone.
      onComplete: () => this.setY(home),
    });
  }
}
