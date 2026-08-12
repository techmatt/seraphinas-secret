/**
 * Something a quest left lying in the grass for her to find.
 *
 * One tile of the pack's outlined icon set, bobbing very slightly so it reads as
 * a thing rather than as a mark on the ground. It is an interactable like a
 * chest or a front door — it wears the green dot, and green picks it up — because
 * "walk up to it, press green" is the one verb this game has taught her and a
 * second verb for the same shape of thing would be a second thing to learn.
 *
 * The outlined icon rather than the bare one on purpose: it ends up lying on
 * dirt, and the cream outline is what stops a grey hammer head becoming part of
 * the road. See `toolIcons.ts`.
 */

import Phaser from 'phaser';
import { TILE, WORLD_SCALE } from '../config';
import { TOOL_ICONS, type IconDef } from '../ui/toolIcons';
import type { ToolId } from './ToolBelt';

/** How far it bobs, and how long a bob takes. Small: this is a glint, not a jig. */
const BOB = 5;
const BOB_MS = 1400;

export class GroundItem {
  private sprite: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly id: ToolId,
    /** Where it lies, in tiles: the point she walks up to. */
    private readonly tile: { x: number; y: number },
  ) {
    const icon: IconDef = TOOL_ICONS[id];
    if (!scene.textures.exists(icon.file)) return;

    const sprite = scene.add
      .image(this.x, this.y, icon.file, icon.slot)
      .setOrigin(0.5, 1)
      .setScale(WORLD_SCALE)
      .setDepth(this.y);
    this.sprite = sprite;

    scene.tweens.add({
      targets: sprite,
      y: { from: this.y, to: this.y - BOB },
      duration: BOB_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Where the dot floats over and where a burst comes from, in world pixels. */
  get x(): number {
    return this.tile.x * TILE * WORLD_SCALE;
  }

  get y(): number {
    return this.tile.y * TILE * WORLD_SCALE;
  }

  /** It leaps, spins and goes. Whatever it turns into is the caller's business. */
  collect(): void {
    const sprite = this.sprite;
    this.sprite = null;
    if (!sprite) return;

    this.scene.tweens.killTweensOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      y: sprite.y - 70,
      scale: WORLD_SCALE * 1.5,
      alpha: 0,
      angle: 220,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
  }

  destroy(): void {
    if (!this.sprite) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.sprite = null;
  }
}
