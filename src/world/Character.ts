/**
 * A pack character on screen: a stack of paper-doll sheets that walk together.
 *
 * All the layers play the same animation on the same clock, so the container
 * behaves like one sprite — it has a position, a facing and an animation, and
 * the fact that its shirt is a separate PNG never leaks out. Which is the point:
 * a wardrobe later is a different layer list, not different code.
 */

import Phaser from 'phaser';
import { WORLD_SCALE } from '../config';
import {
  animKeyFor,
  sheetDirection,
  type AnimName,
  type CharacterSheet,
  type Direction,
} from './characterSheets';

/**
 * She is drawn at the same pixel density as the tiles she walks on, so she is
 * scaled by the same number — see WORLD_SCALE. She used to have a scale of her
 * own, which was fine while the rooms were vector shapes with no opinion about
 * how big a pixel is, and would now make her the wrong size for her own door.
 */
export const CHARACTER_SCALE = WORLD_SCALE;

/**
 * Where the soles of her feet are inside the 64 px frame, as a fraction of it.
 * Measured off the sheet: she occupies y 23-40 of every frame, so the ground
 * line is 41. Making that the container's origin means a Character's position
 * *is* the point she is standing on — which is what collision, depth sorting
 * and every spawn in the map data want to talk about.
 */
export const FOOT_ORIGIN_Y = 41 / 64;

/**
 * Which frame of the swing the axe is actually in the wood.
 *
 * Frame one, counting from zero: the pack draws the wind-up in frame zero and
 * the blow with its swoosh arc in frame one, and the four after it are the
 * follow-through. Measured off `Iron_Tools.png` — the swoosh is only drawn on
 * that frame — rather than picked, because "when did the axe land" is the one
 * number the shake, the leaves and the thunk all have to agree on.
 */
const LANDS_ON = 1;

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

    // A tool sheet is a crop of the character grid, not a copy of it, so which
    // frame index a row starts at is a per-layer question. See SheetLayer.
    const columns = layer.columns ?? sheet.columns;

    for (const row of sheet.anims) {
      // A partial layer draws only what it lists — the axe exists during the
      // swing and nowhere else, because that is all the pack drew.
      const own = layer.rows ? layer.rows[`${row.name}-${row.facing}`] : row.row;
      if (own === undefined) continue;

      const key = phaserKey(sheet, layer.key, row.name, row.facing);
      if (scene.anims.exists(key)) continue;

      const first = own * columns;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(layer.key, {
          start: first,
          end: first + row.frames - 1,
        }),
        frameRate: row.frameRate,
        repeat: row.repeat ?? -1,
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

  /**
   * Set while a swing is playing. A chop is the first thing she does that takes
   * time, so it is the first thing that can be interrupted — and a swing that
   * restarts every time a thumbstick twitches is a swing that never lands.
   */
  private swinging = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly sheet: CharacterSheet,
  ) {
    super(scene, x, y);

    for (const layer of sheet.layers) {
      const sprite = scene.add
        .sprite(0, 0, layer.key, 0)
        .setOrigin(0.5, FOOT_ORIGIN_Y)
        .setScale(CHARACTER_SCALE);
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
    if (this.swinging) return;
    const next: AnimName = moving ? 'walk' : 'idle';
    if (next === this.animNow) return;
    this.animNow = next;
    this.apply();
  }

  /** Mid-swing. The scene stops steering her while this is true. */
  get chopping(): boolean {
    return this.swinging;
  }

  /**
   * Swing the axe, once, facing `direction`, and stand back up afterwards.
   *
   * `onLand` fires partway through rather than at the end: the pack draws the
   * blow landing on the second frame of six, and a tree that shakes when the
   * swing *finishes* looks like a tree that was pushed over rather than hit.
   * `onDone` fires when she has her feet back under her.
   *
   * A second call while the first is still running is ignored, which is what
   * makes holding the green button a rhythm rather than a stutter.
   */
  chop(direction: Direction, onLand: () => void, onDone: () => void): boolean {
    if (this.swinging) return false;

    this.swinging = true;
    this.facingNow = direction;
    this.animNow = 'chop';
    this.apply();

    const row = this.sheet.anims.find((a) => a.name === 'chop');
    // Half a second of swing at the sheet's own rate; the blow is frame two.
    const perFrame = 1000 / (row?.frameRate ?? 12);
    this.scene.time.delayedCall(perFrame * LANDS_ON, onLand);
    this.scene.time.delayedCall(perFrame * (row?.frames ?? 6), () => {
      this.swinging = false;
      this.animNow = 'idle';
      this.apply();
      onDone();
    });
    return true;
  }

  private apply(): void {
    const facing = sheetDirection(this.facingNow);
    const flip = this.flipped;

    for (let i = 0; i < this.layers.length; i++) {
      const sprite = this.layers[i]!;
      const layer = this.sheet.layers[i]!;
      const key = phaserKey(this.sheet, layer.key, this.animNow, facing);
      const has = this.scene.anims.exists(key);

      sprite.setFlipX(flip);
      // A partial layer is only drawn during what it draws — see SheetLayer. A
      // whole-character layer is left alone, so a sheet that failed to load
      // still shows Phaser's missing-texture square rather than nothing at all,
      // which is the difference between a visible bug and a silent one.
      if (layer.rows) sprite.setVisible(has);
      // Turning around mid-stride must not restart the walk, or she moonwalks
      // on every change of direction.
      if (sprite.anims.getName() === key) continue;
      if (has) sprite.play(key);
    }
  }
}
