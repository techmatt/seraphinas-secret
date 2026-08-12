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
 * The other end of the same measurement: the top of her head inside the frame.
 *
 * Most of a 64-pixel frame is the room the tool animations swing through, so the
 * person in it is eighteen pixels tall between rows 23 and 40. Anything that has
 * to be put *above* somebody — a green dot, a speech balloon — needs that number
 * rather than the frame's, or it lands on their chest.
 */
const HEAD_TOP_Y = 23 / 64;

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
   * Set while a swing is playing, and the reason `face` and `setMoving` do
   * nothing while it is.
   *
   * She keeps walking during a swing — the legs are the scene's business and it
   * never stops steering her — but the *picture* is the swing's for its whole
   * duration. Her feet may slide, which is accepted: a girl who skates half a
   * tile mid-chop is a far smaller thing than a girl the game took the controls
   * away from, and taking the controls away is the closest this game comes to a
   * fail state.
   *
   * It is also what keeps the swing from restarting. Every walk-anim request
   * during a chop lands in `apply()`, and the guard there is a per-layer test of
   * "is this key already running" — which cannot tell a request to *continue* the
   * swing from a request to *replace* it. So the swing is defended here, at the
   * door, and `apply()` is left doing only the job it is right about.
   */
  private swinging = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly sheet: CharacterSheet,
  ) {
    super(scene, x, y);

    // A sheet may be drawn smaller than everybody else — that is the only way a
    // little sister is little, there being one body in the pack. See
    // CharacterSheet.scale for why the product has to stay a whole number.
    const scale = this.drawScale;

    for (const layer of sheet.layers) {
      const sprite = scene.add
        .sprite(0, 0, layer.key, 0)
        .setOrigin(0.5, FOOT_ORIGIN_Y)
        .setScale(scale);
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

  /**
   * How far above their feet the top of their head is, in screen pixels. Small
   * — a person in this pack is eighteen pack pixels tall — and it varies, since
   * a little sister is drawn at three quarters of everybody else.
   */
  get headHeight(): number {
    return (FOOT_ORIGIN_Y - HEAD_TOP_Y) * this.sheet.frameHeight * this.drawScale;
  }

  private get drawScale(): number {
    return CHARACTER_SCALE * (this.sheet.scale ?? 1);
  }

  /**
   * Which frame of its own sheet each layer is drawing right now, keyed by
   * texture key, and only for the layers actually on screen.
   *
   * The paper doll is the one place in the game where "the animation is
   * playing" and "the picture is changing" can come apart: seven sprites share
   * one animation name, and a layer that misses its play call sits frozen on
   * whatever it drew last while the other six run. Nothing but a test wants
   * this, but nothing else can see it either — the animation key says `chop`
   * throughout either way.
   */
  get frames(): Record<string, number> {
    const drawn: Record<string, number> = {};
    for (let i = 0; i < this.layers.length; i++) {
      const sprite = this.layers[i]!;
      if (!sprite.visible) continue;
      drawn[this.sheet.layers[i]!.key] = Number(sprite.frame.name);
    }
    return drawn;
  }

  // --- driving it -----------------------------------------------------------

  /**
   * Turn her. Ignored mid-swing: the blow was aimed when the swing started, and
   * a swing that turns to follow the stick is one she can steer into a tree she
   * never pointed at.
   */
  face(direction: Direction): void {
    if (this.swinging || direction === this.facingNow) return;
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
      // on every change of direction — but only while it is still running.
      //
      // A finished animation under the same key has to be played again, and the
      // axe is the layer that proves it: the swing is the only thing it draws,
      // so between swings it keeps the swing's key while the body's moves to
      // idle and back. Without the second half of this test, every swing after
      // the first left the axe frozen on the last frame of the one before it,
      // hanging in the air while she chopped — and the animation key said
      // `chop` throughout, which is why it was invisible to everything except
      // looking at it.
      if (sprite.anims.getName() === key && sprite.anims.isPlaying) continue;
      if (has) sprite.play(key);
    }
  }
}
