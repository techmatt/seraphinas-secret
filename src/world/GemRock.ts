/**
 * A stone with a magic gem in it, and a hammer's worth of cracking it open.
 *
 * The tree's grammar, at a quarter of the length: she walks up, swings, the
 * thing answers, and the second blow is bigger than the first. Two blows rather
 * than the tree's three-and-two — a gem rock is a small errand in the middle of
 * a quest, not the thing the axe was introduced with, and three of them at five
 * blows each would be fifteen swings of homework.
 *
 * The axe on one of these shakes it and does nothing, exactly the way a hammer
 * on a tree does. That is not a punishment and it is not a hint: everything in
 * this world answers when it is hit, and the wrong tool answering *is* the
 * answer. See CLAUDE.md, "No fail states".
 */

import Phaser from 'phaser';
import { DEPTH, TILE, WORLD_SCALE } from '../config';
import { GEM_ICONS, ICON_SIZE, type GemId } from '../ui/toolIcons';

/** Blows to crack one open. */
export const BLOWS_TO_CRACK = 2;

/** What a blow turned out to be, so the scene can pick the noise. */
export type Crack = 'shake' | 'broke';

/** How hard each blow throws it sideways, in screen pixels. Escalating. */
const SHAKE = [6, 12];

/** Chips of stone thrown per blow, and on the blow that opens it. */
const CHIPS = [8, 16];
const BURST = 54;

export interface GemRockSpot {
  /** Which gem is inside. Also its slot on the quest row. */
  id: GemId;
  /** Where it sits, in tiles — its middle, and the tile she stands next to. */
  x: number;
  y: number;
}

export class GemRock {
  private sprite: Phaser.GameObjects.Image | null = null;
  private blows = 0;
  private cracked = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly spot: GemRockSpot,
    private readonly chips: Phaser.GameObjects.Particles.ParticleEmitter,
    private readonly sparkles: Phaser.GameObjects.Particles.ParticleEmitter,
  ) {
    const icon = GEM_ICONS[spot.id];
    if (!scene.textures.exists(icon.file)) return;
    this.sprite = scene.add
      .image(this.x, this.y, icon.file, icon.rock)
      // Hung from the middle of its foot, so its position is the point it stands
      // on — the same thing every other position in this game means.
      .setOrigin(0.5, 1)
      .setScale(WORLD_SCALE)
      // A whole tile lower than her feet would be, so she walks round it rather
      // than through it: it sorts on the line it stands on, like everything else.
      .setDepth(this.y);
  }

  get id(): GemId {
    return this.spot.id;
  }

  /** Where the shimmer sits and where a swing has to reach, in world pixels. */
  get x(): number {
    return this.spot.x * TILE * WORLD_SCALE;
  }

  get y(): number {
    return this.spot.y * TILE * WORLD_SCALE;
  }

  /** The middle of the picture, which is where a burst should come from. */
  get midY(): number {
    return this.y - (ICON_SIZE * WORLD_SCALE) / 2;
  }

  get broken(): boolean {
    return this.cracked;
  }

  /**
   * One blow. `damage` is false for anything that is not a hammer.
   *
   * Returns null once it is open — there is nothing left to hit.
   */
  whack(damage: boolean): Crack | null {
    if (this.cracked) return null;

    if (!damage) {
      this.shudder(0);
      return 'shake';
    }

    this.blows++;
    if (this.blows < BLOWS_TO_CRACK) {
      this.shudder(this.blows - 1);
      return 'shake';
    }

    this.open();
    return 'broke';
  }

  /** Put it back the way she left it, with no noise and no fuss. */
  restoreBroken(): void {
    this.cracked = true;
    this.sprite?.destroy();
    this.sprite = null;
  }

  private shudder(step: number): void {
    const sprite = this.sprite;
    const throwBy = SHAKE[Math.min(step, SHAKE.length - 1)]!;
    this.chips.explode(CHIPS[Math.min(step, CHIPS.length - 1)]!, this.x, this.midY);
    if (!sprite) return;

    this.scene.tweens.killTweensOf(sprite);
    const home = sprite.x;
    this.scene.tweens.add({
      targets: sprite,
      x: { from: home - throwBy, to: home + throwBy },
      duration: 46,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => sprite.setX(home),
    });
  }

  /** It comes apart, and what was inside it is hers. */
  private open(): void {
    this.cracked = true;
    this.chips.explode(BURST, this.x, this.midY);
    this.sparkles.explode(BURST, this.x, this.midY);

    const sprite = this.sprite;
    this.sprite = null;
    if (!sprite) return;

    this.scene.tweens.killTweensOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      scale: WORLD_SCALE * 1.7,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
  }
}

/**
 * Chips of stone: grey flecks that fly and fall. The leaf emitter's job for
 * something that is not a tree, and deliberately drab — the *gem* is the colour
 * in this picture, and stone that sparkled would be competing with it.
 */
export function makeChipEmitter(
  scene: Phaser.Scene,
): Phaser.GameObjects.Particles.ParticleEmitter {
  if (!scene.textures.exists('chip')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture('chip', 8, 8);
    g.destroy();
  }

  return scene.add
    .particles(0, 0, 'chip', {
      speed: { min: 80, max: 300 },
      angle: { min: 0, max: 360 },
      rotate: { start: 0, end: 220 },
      scale: { start: 1, end: 0.3 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 380, max: 900 },
      gravityY: 420,
      // The pack's own stone greys, out of `Ores.png`'s plain rock row.
      tint: [0x6c7c9d, 0x8e9ab4, 0xc7cfdd, 0x3c4258],
      emitting: false,
    })
    // Under the sparkles, so the celebration reads over the mess it made — the
    // same arrangement the leaves have.
    .setDepth(DEPTH.sparkles - 1);
}
