/**
 * A tree she can hit, and — some of them — knock down.
 *
 * Three whacks to fell it, two more to knock the stump out, and the tile is
 * hers. There is no counter anywhere on screen and there never will be: what
 * tells her she is getting somewhere is that each blow is bigger than the last
 * one, which is a thing a four-year-old reads without being told and a number
 * over a tree's head is a thing she cannot read at all.
 *
 * Unchoppable trees run the same reaction and never advance. Everything in the
 * world answers when it is hit — that rule matters more here than anywhere,
 * because the alternative is a tree that ignores her, and being ignored is the
 * closest thing to a wrong answer this game is allowed to have.
 */

import Phaser from 'phaser';
import { DEPTH, TILE, TILE_SIZE, WORLD_SCALE } from '../config';
import type { MapTree } from './mapData';
import type { TileWorld, WorldSprite } from './TileWorld';

/** Blows to bring a standing tree down, and to knock its stump out after. */
export const WHACKS_TO_FELL = 3;
export const WHACKS_TO_CLEAR = 2;

/**
 * How big a tree this is, as everything that differs between one and another.
 *
 * There are two: the wood's, and the one a quest pens bunnies behind. They are
 * the same object doing the same four things — shake, fall, stump, gone — and
 * the only honest differences between them are how many blows each step takes,
 * which picture is left standing, and how much noise it makes on the way. So
 * those are what a style is, and there is exactly one code path for both.
 *
 * `juice` scales the mess: the leaves, the wobble, and (through `juiceScale`)
 * the shake the scene puts on the camera. A tiny tree that threw sixty leaves
 * and rocked the screen would be claiming to be a tree it is not, and the size
 * of the celebration is the only thing telling her which one she just felled.
 */
export interface TreeStyle {
  /** Blows to bring it down, and to knock the stump out after. */
  fell: number;
  clears: number;
  /** The catalog picture left standing where the trunk was. */
  stump: string;
  /** How much of a big tree's mess and wobble this one makes. */
  juice: number;
  /** How long it takes to go over. A small tree goes over quickly. */
  fallMs: number;
  /** Where the leaves live, as a fraction down the sprite. See `canopyY`. */
  canopy: number;
}

/** The wood's own: three blows down, two more to clear, and a proper crash. */
export const BIG_TREE: TreeStyle = {
  fell: WHACKS_TO_FELL,
  clears: WHACKS_TO_CLEAR,
  stump: 'stump',
  juice: 1,
  fallMs: 620,
  canopy: 0.3,
};

/**
 * The quest's: two blows down, two more to clear, and everything else at a
 * little under half.
 *
 * Two rather than three because sixteen of them stand in a ring and she is four:
 * the phase asks for four falls, which is eight swings, and at the wood's count
 * it would be twelve. The stump still takes two, because clearing one is
 * optional — the bunnies hop over them — and a thing she does not have to do
 * should not be the thing that got cheaper.
 *
 * Its canopy sits low in a tall slot: the art is twelve pixels in a sixty-four
 * pixel picture, three fifths of the way down, so leaves thrown at a big tree's
 * fraction would come off the empty air above it.
 */
export const TINY_TREE: TreeStyle = {
  fell: 2,
  clears: 2,
  stump: 'smallStump',
  juice: 0.45,
  fallMs: 380,
  canopy: 0.62,
};

/** What is left of it. `gone` means the tile has been handed back. */
export type TreeState = 'standing' | 'stump' | 'gone';

/** What a whack turned out to be, so the scene knows which noise to make. */
export type Whack = 'shake' | 'fell' | 'cleared';

/**
 * How hard each blow shakes the thing it lands on, in screen pixels.
 *
 * Indexed by how many have already landed, so blow one is a nudge and blow two
 * is a proper wallop — the escalation *is* the progress bar. An unchoppable
 * tree never gets past the first number, which is what "too big to cut" feels
 * like without a word being said about it.
 */
const SHAKE = [7, 13];

/** Leaves shed per blow, on the same escalating scale. */
const LEAVES = [6, 14];

/** Leaves thrown when the whole tree comes down, and when a stump pops. */
const FALL_LEAVES = 60;
const STUMP_LEAVES = 24;

/** Sparkles for the moment itself. This is the big one, so it is generous. */
const CELEBRATION = 70;

/** How far past upright a tree ends up. Every size falls the same way over. */
const FALL_ANGLE = 84;

export interface TreeJuice {
  /** Leaves and bark, thrown from a point. */
  leaves: Phaser.GameObjects.Particles.ParticleEmitter;
  /** The game's own sparkle burst, for the moment the tree lands. */
  sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
}

/** One picture and the tiles under it, for the debug overlay to draw. */
export interface TreeFootprint {
  /** Sprite top-left, in pack pixels. */
  x: number;
  y: number;
  cells: MapTree['cells'];
}

/** What is left of a tree, as something the session store can hold. */
export interface TreeMemory {
  state: TreeState;
  /** Blows landed since it last changed shape. */
  landed: number;
}

export class Tree {
  private sprite: WorldSprite | null;
  private blows = 0;
  private what: TreeState = 'standing';

  /**
   * Set while the tree is on its way over. A blow landing during the fall would
   * find a sprite that is mid-tween and start shaking it sideways, which is how
   * a tree ends up lying down at an angle in the air.
   */
  private falling = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: TileWorld,
    readonly def: MapTree,
    private readonly juice: TreeJuice,
    /**
     * What she already did to this one, from the session store.
     *
     * A zone is rebuilt from the generated map file every time she walks into
     * it, and that file has every tree standing — so without this, going indoors
     * and coming out again grows the wood back. Restoring is deliberately silent:
     * no fall, no pop, no leaves. She is not felling it again, she is finding it
     * the way she left it.
     */
    was?: TreeMemory,
    /**
     * How big a tree this is. The wood's, unless somebody says otherwise — a
     * zone builds two hundred of these off a map file and none of them has an
     * opinion about it. See TreeStyle.
     */
    readonly style: TreeStyle = BIG_TREE,
  ) {
    this.sprite = world.addSprite(def.key, def.x, def.y);
    if (was) this.restore(was);
  }

  private restore(was: TreeMemory): void {
    this.blows = was.landed;
    if (was.state === 'standing') return;

    // Told to stop fading it first: an occluder whose image has been destroyed
    // is a null dereference once a frame for the rest of the zone.
    if (this.sprite) {
      this.world.forget(this.sprite);
      this.sprite.destroy();
    }
    this.sprite = null;
    this.what = was.state;

    if (was.state === 'stump') {
      // Straight to full size. `raiseStump` grows it out of the mess the tree
      // left, and there is no mess here — this stump has been standing since
      // before she went indoors.
      this.sprite = this.world.addSprite(
        this.style.stump,
        this.def.cells.x * TILE,
        this.def.cells.y * TILE,
      );
      this.sprite?.setOrigin(0, 1).setY(this.sprite.y + this.sprite.displayHeight);
      return;
    }

    // Gone. The map file's collision has the trunk's tiles solid again, so the
    // hole she made has to be made again — this is the same call `clear` makes,
    // and it is why `clears` is written down at build time.
    this.world.clear(this.def.clears);
  }

  /** What to write down about it, so it can be found this way again. */
  get memory(): TreeMemory {
    return { state: this.what, landed: this.blows };
  }

  /** Where the green dot sits and what she has to stand near: the trunk. */
  get x(): number {
    return this.def.ax * WORLD_SCALE;
  }

  get y(): number {
    return this.def.ay * WORLD_SCALE;
  }

  get state(): TreeState {
    return this.what;
  }

  get choppable(): boolean {
    return this.def.chop === true;
  }

  /**
   * Whether there is anything of this tree on screen at all.
   *
   * Anything short of `gone` should always be able to say yes, and the moment it
   * could not was the felling: the trunk tipped out of its tile at the start of
   * the fall and the stump was raised at the end of it, leaving most of a second
   * of bare ground where a tree had been standing. Nothing else in the game can
   * produce that beat, and a screenshot cannot catch a beat, so the scene counts
   * this every frame instead — see `treeGaps` in the hooks.
   */
  get drawn(): boolean {
    return this.sprite !== null;
  }

  /** What it is currently making solid, or null once the tile is given back. */
  get footprint(): TreeFootprint | null {
    if (this.what === 'gone') return null;
    const { cells } = this.def;
    return this.what === 'stump'
      ? { x: cells.x * TILE, y: cells.y * TILE, cells }
      : { x: this.def.x, y: this.def.y, cells };
  }

  /**
   * One blow. Says what it turned into, so the scene can pick the noise and the
   * camera shake without knowing anything about how many it takes.
   *
   * `damage` is false for the wrong tool — a hammer, which cracks stone and does
   * nothing to wood. It still shakes and still sheds leaves, because everything
   * in this world answers when it is hit, and it never advances: a wrong choice
   * is a mildly funny nothing, never a step backwards. See CLAUDE.md, "No fail
   * states".
   *
   * Returns `null` when there is nothing to hit — it is already gone, or it is
   * still falling over from the last one.
   */
  whack(damage = true): Whack | null {
    if (this.what === 'gone' || this.falling) return null;

    if (!this.choppable || !damage) {
      this.shudder(0);
      return 'shake';
    }

    const needed = this.what === 'standing' ? this.style.fell : this.style.clears;
    this.blows++;

    if (this.blows < needed) {
      this.shudder(this.blows - 1);
      return 'shake';
    }

    this.blows = 0;
    if (this.what === 'standing') {
      this.fell();
      return 'fell';
    }
    this.clear();
    return 'cleared';
  }

  // --- what a blow looks like ---------------------------------------------

  /**
   * The wobble and the leaves, at `step`'s strength. Clamped rather than
   * indexed off the end, so an unchoppable tree hit forty times keeps giving
   * the same honest answer instead of quietly escalating to nothing.
   */
  private shudder(step: number): void {
    const sprite = this.sprite;
    const throwBy = SHAKE[Math.min(step, SHAKE.length - 1)]! * this.style.juice;
    const leaves = Math.round(LEAVES[Math.min(step, LEAVES.length - 1)]! * this.style.juice);

    if (sprite) {
      this.scene.tweens.killTweensOf(sprite);
      const home = sprite.x;
      this.scene.tweens.add({
        targets: sprite,
        x: { from: home - throwBy, to: home + throwBy },
        duration: 52,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
        onComplete: () => sprite.setX(home),
      });
    }

    // Out of the canopy, not off the trunk: leaves come from where the leaves
    // are, which for a big tree is a couple of tiles above the one she is
    // standing next to.
    this.juice.leaves.explode(leaves, this.x, this.canopyY());
  }

  /**
   * The big moment: over it goes, and a stump is standing where it was.
   *
   * The stump is raised *first*, before the trunk has moved a degree, and that
   * ordering is the whole point. A tree pivots out of its own tile in the first
   * fifth of its fall, so a stump raised when the fall lands leaves half a second
   * of bare grass with a tree lying next to it — she hits a tree and the world
   * briefly forgets it was ever there. Raised now, it grows underneath the trunk
   * while the trunk is still over it, and what she sees is the tree coming off
   * the stump rather than the stump arriving after the tree.
   */
  private fell(): void {
    const sprite = this.sprite;
    this.what = 'stump';
    this.raiseStump();

    if (!sprite) return;

    this.falling = true;

    // Rotate about the foot of the trunk rather than the corner of the picture,
    // or a four-tile canopy pivots around its own top-left and the tree takes
    // off sideways. The sprite is hung from its top-left, so the origin moves to
    // the trunk's foot and the position moves with it — the same pixels,
    // turning about the right point.
    const { displayWidth: w, displayHeight: h } = sprite;
    const footX = (this.def.cells.x + this.def.cells.w / 2) * TILE_SIZE;
    const originX = Phaser.Math.Clamp((footX - sprite.x) / w, 0, 1);
    sprite.setOrigin(originX, 1).setPosition(sprite.x + originX * w, sprite.y + h);

    // Away from her, so it never comes down on top of her. Sideways only: a
    // tree falling towards the camera would be drawn over the girl who felled
    // it, and losing the character is the nearest thing this game has to losing.
    const away = this.x >= footX ? -1 : 1;

    // One in front of the stump for as long as it exists. The two share a base
    // line, so without this the stump would be drawn over the trunk it is
    // supposed to be hidden under — and the whole point of raising it early is
    // that nobody sees it arrive.
    if (this.sprite) sprite.setDepth(this.sprite.depth + 1);

    this.world.forget(sprite);
    this.scene.tweens.killTweensOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      angle: away * FALL_ANGLE,
      duration: this.style.fallMs,
      // Slow at the top, quick at the bottom: the way a tree actually goes.
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.falling = false;
        this.juice.leaves.explode(Math.round(FALL_LEAVES * this.style.juice), this.x, this.y);
        this.juice.sparkles.explode(Math.round(CELEBRATION * this.style.juice), this.x, this.y);
        this.scene.tweens.add({
          targets: sprite,
          alpha: 0,
          duration: 240,
          onComplete: () => sprite.destroy(),
        });
      },
    });
  }

  /** What is left standing, in the tile the trunk was standing in. */
  private raiseStump(): void {
    const stump = this.world.addSprite(
      this.style.stump,
      this.def.cells.x * TILE,
      this.def.cells.y * TILE,
    );
    this.sprite = stump;
    if (!stump) return;

    // Hung from its foot rather than its corner, so growing it keeps it planted
    // and it rises out of the mess the tree left instead of unfolding sideways.
    stump.setOrigin(0, 1).setY(stump.y + stump.displayHeight);
    stump.setScale(WORLD_SCALE * 0.5);
    this.scene.tweens.add({
      targets: stump,
      scale: WORLD_SCALE,
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  /** The stump pops away, and the world gets its tile back. */
  private clear(): void {
    const sprite = this.sprite;
    this.what = 'gone';
    this.sprite = null;

    // The generator worked out which cells were only ever solid because of this
    // tree. One it shares with a fence post stays solid, and the stump popping
    // is still the right picture — the post is the thing she is up against now.
    this.world.clear(this.def.clears);
    this.juice.leaves.explode(Math.round(STUMP_LEAVES * this.style.juice), this.x, this.y);

    if (!sprite) return;
    this.world.forget(sprite);
    this.scene.tweens.killTweensOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      scale: WORLD_SCALE * 1.6,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
  }

  /** Roughly where the leaves live, so a burst comes off the canopy. */
  private canopyY(): number {
    if (this.what !== 'standing' || !this.sprite) return this.y;
    return this.sprite.y + this.sprite.displayHeight * this.style.canopy;
  }
}

/** Leaves: green-and-gold flecks that tumble and fall. Baked once per game. */
export function makeLeafEmitter(
  scene: Phaser.Scene,
): Phaser.GameObjects.Particles.ParticleEmitter {
  if (!scene.textures.exists('leaf')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    // A squashed diamond rather than a dot: at this size that reads as foliage,
    // where a circle reads as one more sparkle and the two get confused.
    g.fillPoints(
      [
        new Phaser.Geom.Point(6, 0),
        new Phaser.Geom.Point(12, 5),
        new Phaser.Geom.Point(6, 10),
        new Phaser.Geom.Point(0, 5),
      ],
      true,
    );
    g.generateTexture('leaf', 12, 10);
    g.destroy();
  }

  return scene.add
    .particles(0, 0, 'leaf', {
      speed: { min: 60, max: 240 },
      angle: { min: 0, max: 360 },
      // Tumbling, because a leaf that falls flat reads as a bit of paper.
      rotate: { start: 0, end: 360 },
      scale: { start: 1.1, end: 0.5 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 520, max: 1200 },
      gravityY: 340,
      // The pack's own greens, and the brown of the bark they came off.
      tint: [0x3e8948, 0x63c74d, 0x8fd67a, 0xa9743c, 0xd9b25f],
      emitting: false,
    })
    // Under the sparkles, so the celebration reads over the mess it made.
    .setDepth(DEPTH.sparkles - 1);
}
