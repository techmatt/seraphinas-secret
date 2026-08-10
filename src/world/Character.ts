/**
 * A pack character on screen: a stack of paper-doll sheets that walk together.
 *
 * All the layers play the same animation on the same clock, so the container
 * behaves like one sprite — it has a position, a facing and an animation, and
 * the fact that its shirt is a separate PNG never leaks out. Which is the point:
 * a wardrobe later is a different layer list, not different code.
 */

import Phaser from 'phaser';
import {
  animKeyFor,
  sheetDirection,
  type AnimName,
  type CharacterSheet,
  type Direction,
} from './characterSheets';

/**
 * A 16x18 px character in a 720 px room needs scaling up a long way. Five is
 * what the screenshots wanted: at four she is a detail of the yard, and at five
 * she is the subject of it, still shorter than the doorway she walks through.
 * A whole number, because a fractional one is what turns square pixels into
 * uneven ones.
 */
export const CHARACTER_SCALE = 5;

/** Queue every layer of `sheet` onto the scene's loader. Call from preload(). */
export function preloadCharacter(scene: Phaser.Scene, sheet: CharacterSheet): void {
  for (const layer of sheet.layers) {
    if (scene.textures.exists(layer.key)) continue;
    scene.load.spritesheet(layer.key, layer.file, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    });
  }
}

/**
 * Whether every layer's sheet actually arrived. A failed load is not an
 * exception in Phaser — the sprite silently becomes a green square — and the
 * art is a side-loaded pack outside the repo, so this is worth being able to
 * ask.
 */
export function characterArtLoaded(scene: Phaser.Scene, sheet: CharacterSheet): boolean {
  return sheet.layers.every((layer) => scene.textures.exists(layer.key));
}

/**
 * Register one Phaser animation per layer per row, and make the textures
 * nearest-neighbour so scaling up stays pixel art instead of turning to soup.
 *
 * Filtering is set per texture rather than through Phaser's global `pixelArt`
 * flag, because that flag also turns off antialiasing for the shapes the rooms
 * are drawn from — every bush and glow would go jagged to sharpen the girl.
 *
 * Animations are global to the game, and the room scene is rebuilt on every
 * doorway, so this has to be safe to call again.
 */
export function registerCharacterAnims(scene: Phaser.Scene, sheet: CharacterSheet): void {
  for (const layer of sheet.layers) {
    // A sheet that did not arrive has no frames to cut up. Skipping it leaves
    // her a green square rather than throwing on the way into the room.
    if (!scene.textures.exists(layer.key)) continue;
    scene.textures.get(layer.key).setFilter(Phaser.Textures.FilterMode.NEAREST);

    for (const row of sheet.anims) {
      const key = phaserKey(sheet, layer.key, row.name, row.facing);
      if (scene.anims.exists(key)) continue;

      const first = row.row * sheet.columns;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(layer.key, {
          start: first,
          end: first + row.frames - 1,
        }),
        frameRate: row.frameRate,
        repeat: -1,
      });
    }
  }
}

function phaserKey(
  sheet: CharacterSheet,
  textureKey: string,
  name: AnimName,
  facing: string,
): string {
  return `${sheet.id}:${textureKey}:${name}-${facing}`;
}

export class Character extends Phaser.GameObjects.Container {
  private readonly layers: Phaser.GameObjects.Sprite[] = [];

  private facingNow: Direction = 'down';
  private animNow: AnimName = 'idle';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly sheet: CharacterSheet,
  ) {
    super(scene, x, y);

    for (const layer of sheet.layers) {
      const sprite = scene.add.sprite(0, 0, layer.key, 0).setScale(CHARACTER_SCALE);
      this.layers.push(sprite);
      this.add(sprite);
    }

    scene.add.existing(this);
    this.apply();
  }

  // --- what a caller (or a test) can read ----------------------------------

  /** One of the four game directions, including the mirrored one. */
  get facing(): Direction {
    return this.facingNow;
  }

  /**
   * The logical animation, e.g. `walk-right`. Walking left reports `walk-right`
   * with `flipped` true, because that is exactly what the sheet does.
   */
  get animKey(): string {
    return animKeyFor(this.animNow, this.facingNow);
  }

  get flipped(): boolean {
    return this.facingNow === 'left';
  }

  // --- driving it -----------------------------------------------------------

  face(direction: Direction): void {
    if (direction === this.facingNow) return;
    this.facingNow = direction;
    this.apply();
  }

  /** True while she is under her own steam; false idles her where she stands. */
  setMoving(moving: boolean): void {
    const next: AnimName = moving ? 'walk' : 'idle';
    if (next === this.animNow) return;
    this.animNow = next;
    this.apply();
  }

  private apply(): void {
    const facing = sheetDirection(this.facingNow);
    const flip = this.flipped;

    for (let i = 0; i < this.layers.length; i++) {
      const sprite = this.layers[i]!;
      const key = phaserKey(this.sheet, this.sheet.layers[i]!.key, this.animNow, facing);

      sprite.setFlipX(flip);
      // Turning around mid-stride must not restart the walk, or she moonwalks
      // on every change of direction.
      if (sprite.anims.getName() === key) continue;
      if (this.scene.anims.exists(key)) sprite.play(key);
    }
  }
}
