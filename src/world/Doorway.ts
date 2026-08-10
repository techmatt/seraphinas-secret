/**
 * A way out of a zone, and the sign that says so.
 *
 * There is no button press here: walking into the opening is the whole
 * interaction. That puts the entire burden on the picture, because the player
 * cannot read "door". The door itself is now drawn on the building — the pack
 * paints a proper arched one — so this stopped being a fake archway and became
 * only the light: a bright mouth, a wide pool spilling the way you would walk
 * in, and motes drifting out of it. Three signals that all say "over here" at a
 * glance, from across the map, in no language.
 */

import Phaser from 'phaser';
import { DEPTH, WORLD_SCALE } from '../config';
import { makeGlow } from '../ui/ButtonDot';
import type { Direction, MapDoorway } from './mapData';

/** Which way is "into the room" from a doorway, in Phaser degrees. */
const OUTWARD: Record<Direction, number> = { right: 0, down: 90, left: 180, up: 270 };

export class Doorway {
  /** Centre of the opening, in world pixels. */
  readonly x: number;
  readonly y: number;

  private readonly left: number;
  private readonly right: number;
  private readonly top: number;
  private readonly bottom: number;

  constructor(
    scene: Phaser.Scene,
    readonly def: MapDoorway,
  ) {
    this.left = def.x * WORLD_SCALE;
    this.top = def.y * WORLD_SCALE;
    this.right = this.left + def.w * WORLD_SCALE;
    this.bottom = this.top + def.h * WORLD_SCALE;
    this.x = (this.left + this.right) / 2;
    this.y = (this.top + this.bottom) / 2;

    this.draw(scene);
  }

  /**
   * Is she standing in the opening? Generous on purpose — she aims a
   * thumbstick, not a mouse, and missing a door you walked at is a fail state.
   */
  contains(footX: number, footY: number): boolean {
    return (
      footX >= this.left && footX <= this.right && footY >= this.top && footY <= this.bottom
    );
  }

  private draw(scene: Phaser.Scene): void {
    const { tint, facing } = this.def;
    const angle = OUTWARD[facing];
    const out = new Phaser.Math.Vector2(1, 0).setAngle(Phaser.Math.DegToRad(angle));

    // Two pools rather than one: a bright mouth, and a wide soft one reaching
    // the way she would walk in, so the invitation lands where her feet are.
    // Both are the game's soft radial blob — a flat shape draws a hard edge on
    // the ground, which reads as a rug someone left out, not as light.
    const spill = makeGlow(scene, this.x, this.y, 190, tint, 0.6).setDepth(DEPTH.doorLight);
    const pool = makeGlow(
      scene,
      this.x + out.x * 90,
      this.y + out.y * 90,
      320,
      tint,
      0.26,
    ).setDepth(DEPTH.doorLight);

    // The light breathes, which is the difference between a doorway and a mural.
    for (const [target, from, to] of [
      [spill, 0.34, 0.9],
      [pool, 0.14, 0.36],
    ] as const) {
      scene.tweens.add({
        targets: target,
        alpha: { from, to },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Motes drifting out of the passage. Movement outwards is the clearest
    // "there is somewhere through here" a picture can manage.
    const alongY = facing === 'left' || facing === 'right';
    const spread = (alongY ? this.bottom - this.top : this.right - this.left) * 0.45;

    scene.add
      .particles(this.x + out.x * 26, this.y + out.y * 26, 'spark', {
        x: alongY ? { min: -7, max: 7 } : { min: -spread, max: spread },
        y: alongY ? { min: -spread, max: spread } : { min: -7, max: 7 },
        angle: { min: angle - 26, max: angle + 26 },
        speed: { min: 30, max: 78 },
        scale: { start: 0.85, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: { min: 1000, max: 1900 },
        frequency: 140,
        blendMode: 'ADD',
        tint: [tint, 0xffffff],
      })
      .setDepth(this.y + 120);
  }
}
