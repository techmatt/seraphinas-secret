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

    // The mat: a slab of warm floor reaching into the room, so the invitation
    // lands where her feet are and not only at eye height.
    const mat = scene.add
      .rectangle(DOOR_DEPTH * 0.62, 0, DOOR_DEPTH * 1.24, DOOR_HALF * 1.9, tint, 0.22)
      .setBlendMode(Phaser.BlendModes.ADD);

    const spill = makeGlow(scene, 6, 0, 210, tint, 0.6);

    // The passage itself: dark, so it reads as somewhere else rather than as a
    // painted rectangle on this room's wall.
    const opening = scene.add
      .rectangle(0, 0, 46, DOOR_HALF * 2, 0x140d1c, 0.95)
      .setStrokeStyle(8, tint, 0.95);

    // Posts top and bottom of the opening, turning a hole into an arch.
    const postA = scene.add.rectangle(20, -DOOR_HALF - 6, 74, 18, tint, 0.9);
    const postB = scene.add.rectangle(20, DOOR_HALF + 6, 74, 18, tint, 0.9);

    const arch = scene.add.container(this.x, this.y, [mat, spill, opening, postA, postB]);
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
      targets: mat,
      alpha: { from: 0.14, to: 0.34 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Motes drifting out of the passage into the room. Movement outwards is the
    // clearest "there is somewhere through here" a picture can manage.
    scene.add
      .particles(this.x, this.y, 'spark', {
        x: { min: -4, max: 4 },
        y: { min: -DOOR_HALF * 0.7, max: DOOR_HALF * 0.7 },
        angle: { min: angle - 26, max: angle + 26 },
        speed: { min: 24, max: 62 },
        scale: { start: 0.75, end: 0 },
        alpha: { start: 0.85, end: 0 },
        lifespan: { min: 900, max: 1700 },
        frequency: 170,
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
