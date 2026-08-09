/**
 * A way out of a room, and the sign that says so.
 *
 * There is no button press here: walking into the opening is the whole
 * interaction. That puts the entire burden on the picture, because the player
 * cannot read "door". So a doorway is a lit archway with light spilling out of
 * it onto a mat at her feet — three signals that all say "over here" at a
 * glance, from across the room, in no language.
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { makeGlow } from '../ui/ButtonDot';
import { DEPTH } from './scenery';
import { DOOR_DEPTH, DOOR_HALF, WALL, type DoorwayDef, type Side } from './rooms';

/** Which way is "into the room" from each wall, in degrees. */
const INWARD: Record<Side, number> = { left: 0, right: 180, top: 90, bottom: 270 };

export class Doorway {
  /** Centre of the opening, on the wall, in world space. */
  readonly x: number;
  readonly y: number;

  constructor(
    scene: Phaser.Scene,
    readonly def: DoorwayDef,
  ) {
    const spot = mouthOf(def);
    this.x = spot.x;
    this.y = spot.y;

    this.draw(scene);
  }

  /**
   * Is the character standing in the opening? Generous on purpose — she aims a
   * thumbstick, not a mouse, and missing a door you walked at is a fail state.
   */
  contains(px: number, py: number): boolean {
    const { side, at } = this.def;
    switch (side) {
      case 'left':
        return px <= WALL + DOOR_DEPTH && Math.abs(py - at) <= DOOR_HALF;
      case 'right':
        return px >= GAME_WIDTH - WALL - DOOR_DEPTH && Math.abs(py - at) <= DOOR_HALF;
      case 'top':
        return py <= WALL + DOOR_DEPTH && Math.abs(px - at) <= DOOR_HALF;
      case 'bottom':
        return py >= GAME_HEIGHT - WALL - DOOR_DEPTH && Math.abs(px - at) <= DOOR_HALF;
    }
  }

  /**
   * Built facing +x and then rotated onto its wall, so all four sides come from
   * one drawing and a doorway in the ceiling would need no new code.
   */
  private draw(scene: Phaser.Scene): void {
    const { tint } = this.def;
    const angle = INWARD[this.def.side];

    // Two pools of light rather than one: a bright mouth, and a wide soft one
    // reaching into the room so the invitation lands where her feet are. Both
    // are the game's soft radial blob — a flat shape here draws a hard edge on
    // the floor, which reads as a rug someone left out, not as light.
    const spill = makeGlow(scene, 8, 0, 200, tint, 0.62);
    const pool = makeGlow(scene, DOOR_DEPTH * 0.95, 0, 320, tint, 0.26);

    // The passage itself: dark, so it reads as somewhere else rather than as a
    // painted rectangle on this room's wall.
    const opening = scene.add
      .rectangle(0, 0, 46, DOOR_HALF * 2, 0x140d1c, 0.95)
      .setStrokeStyle(8, tint, 0.95);

    // Posts top and bottom of the opening, turning a hole into an arch.
    const postA = scene.add.rectangle(20, -DOOR_HALF - 6, 74, 18, tint, 0.9);
    const postB = scene.add.rectangle(20, DOOR_HALF + 6, 74, 18, tint, 0.9);

    const arch = scene.add.container(this.x, this.y, [pool, spill, opening, postA, postB]);
    arch.setAngle(angle).setDepth(DEPTH.doorway);

    // The light breathes, which is the difference between a doorway and a mural.
    scene.tweens.add({
      targets: spill,
      alpha: { from: 0.38, to: 0.92 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: pool,
      alpha: { from: 0.16, to: 0.38 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Motes drifting out of the passage into the room. Movement outwards is the
    // clearest "there is somewhere through here" a picture can manage.
    //
    // The emitter is not a child of the arch, so it gets no free rotation: its
    // spawn box has to be worked out against the wall by hand. They start a
    // little clear of the mouth, because inside it they are dark motes on a
    // dark passage and the one signal that shows direction goes unseen.
    const inward = new Phaser.Math.Vector2(1, 0).setAngle(Phaser.Math.DegToRad(angle));
    const alongY = this.def.side === 'left' || this.def.side === 'right';
    const spread = DOOR_HALF * 0.7;

    scene.add
      .particles(this.x + inward.x * 20, this.y + inward.y * 20, 'spark', {
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
      .setDepth(DEPTH.doorway);
  }
}

/** Where a doorway's opening sits on its wall. */
function mouthOf(def: DoorwayDef): { x: number; y: number } {
  switch (def.side) {
    case 'left':
      return { x: WALL, y: def.at };
    case 'right':
      return { x: GAME_WIDTH - WALL, y: def.at };
    case 'top':
      return { x: def.at, y: WALL };
    case 'bottom':
      return { x: def.at, y: GAME_HEIGHT - WALL };
  }
}
