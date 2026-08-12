/**
 * A generated map, standing up in a scene.
 *
 * Ground goes into a Phaser tile layer, which is the one thing in the engine
 * that culls what the camera cannot see — the exterior is 2816 tiles and the
 * headless test browser runs this at twenty-odd frames a second, so that
 * matters. Everything with a silhouette — buildings, trees, furniture — is a
 * sprite instead, so it can sort against Seraphina by its own base line and she
 * can walk behind a canopy.
 *
 * Collision is a bitmap, not a body list: one character per tile in the map
 * file, straight out of the generator, which already knows a tree blocks its
 * trunk and not its leaves.
 */

import Phaser from 'phaser';
import { DEPTH, TILE_SIZE, WORLD_SCALE } from '../config';
import type { MapData } from './mapData';

/**
 * Her collision box, in pack pixels, measured from where her feet touch the
 * ground: 10 wide and 5 tall. Small on purpose — she is aimed with a thumbstick
 * by someone who is four, and getting wedged on a corner is a fail state.
 */
const BODY_HALF_W = 5 * WORLD_SCALE;
const BODY_HEIGHT = 5 * WORLD_SCALE;

/**
 * Anything at least this tall, in tiles, can swallow her whole and so has to
 * get out of the way when she walks behind it.
 */
const OCCLUDER_TILES = 3;

/** How much of a tree is left when she is standing behind it. */
const OCCLUDER_ALPHA = 0.42;

/** Per-frame approach to the target alpha. Fast enough to feel instant. */
const FADE_RATE = 0.22;

/** Anything in the world that can be faded, whether it is animated or not. */
export type WorldSprite = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

/**
 * Frame zero of a strip keeps the image's own name, because a still sprite and
 * the first frame of a moving one are the same rectangle — so nothing has to
 * know whether a key it was handed animates.
 */
const frameName = (key: string, frame: number) => `${key}#${frame}`;
const animKey = (key: string) => `img:${key}`;

interface Occluder {
  image: WorldSprite;
  left: number;
  right: number;
  top: number;
  bottom: number;
  depth: number;
}

export class TileWorld {
  readonly widthPx: number;
  readonly heightPx: number;

  private readonly blocked: Uint8Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly occluders: Occluder[] = [];

  /** How many sprites have been placed, so animations can be staggered. */
  private placed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly map: MapData,
  ) {
    this.cols = map.cols;
    this.rows = map.rows;
    this.widthPx = map.cols * map.tile * WORLD_SCALE;
    this.heightPx = map.rows * map.tile * WORLD_SCALE;

    this.blocked = new Uint8Array(map.cols * map.rows);
    for (let i = 0; i < this.blocked.length; i++) {
      this.blocked[i] = map.blocked.charCodeAt(i) === 49 ? 1 : 0;
    }

    this.sharpen();
    this.paintGround();
    this.placeSprites();
  }

  /**
   * Queue every texture this map wants. Called from the scene's preload, which
   * is why the map has to have been fetched before the scene started.
   */
  static preload(scene: Phaser.Scene, map: MapData): void {
    for (const tileset of map.tilesets) {
      if (!scene.textures.exists(tileset.key)) scene.load.image(tileset.key, tileset.file);
    }
    for (const image of map.images) {
      // Several sprites share one PNG, so the file path is the texture key and
      // each sprite is a frame cut out of it.
      if (!scene.textures.exists(image.file)) scene.load.image(image.file, image.file);
    }
  }

  /** True if every layer of the map's art actually arrived. */
  static artLoaded(scene: Phaser.Scene, map: MapData): boolean {
    return (
      map.tilesets.every((t) => scene.textures.exists(t.key)) &&
      map.images.every((i) => scene.textures.exists(i.file))
    );
  }

  // --- what the scene asks it ---------------------------------------------

  /**
   * Her collision box, given where her feet are. Public because the debug
   * overlay draws exactly this rectangle — a picture of a box the collision test
   * does not actually use would be worse than no picture at all.
   */
  static body(footX: number, footY: number): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      footX - BODY_HALF_W,
      footY - BODY_HEIGHT,
      BODY_HALF_W * 2,
      BODY_HEIGHT,
    );
  }

  /** Can she stand with her feet here? */
  canStand(footX: number, footY: number): boolean {
    const box = TileWorld.body(footX, footY);
    const { left, top } = box;
    const right = box.right;
    const bottom = box.bottom - 1;

    // The box is smaller than a tile both ways, so any tile it overlaps has one
    // of its corners in it.
    return (
      !this.solidAt(left, top) &&
      !this.solidAt(right, top) &&
      !this.solidAt(left, bottom) &&
      !this.solidAt(right, bottom)
    );
  }

  /**
   * Fade whatever she is standing behind.
   *
   * The wood is drawn tall and sorted by base line, which is what makes walking
   * under a canopy feel like a wood — and what made her vanish entirely the
   * first time a screenshot caught her among the spruces. Losing the character
   * is about as close to a fail state as this game gets, so anything tall enough
   * to hide her goes see-through while she is behind it. Only tall sprites are
   * candidates, and only their own rectangle is tested, so this is a short scan
   * of cheap comparisons rather than anything the renderer has to think about.
   */
  revealBehind(x: number, y: number): void {
    for (const o of this.occluders) {
      const hiding =
        o.depth > y && x > o.left && x < o.right && y > o.top && y < o.bottom;
      const want = hiding ? OCCLUDER_ALPHA : 1;
      const alpha = o.image.alpha;
      if (Math.abs(alpha - want) < 0.01) {
        if (alpha !== want) o.image.setAlpha(want);
        continue;
      }
      o.image.setAlpha(alpha + (want - alpha) * FADE_RATE);
    }
  }

  /**
   * The nearest point she could actually be standing, given a point she might
   * not be able to.
   *
   * Her collision box sits at her feet and is a fifth of a tile tall, so a
   * position exactly on the line between two tiles puts her body in the one
   * above — which is fine in open country and is standing inside a wall if the
   * tile above happens to be a shed. Rather than make every caller think about
   * that, anything that places her runs through here first.
   */
  nearestStanding(x: number, y: number): { x: number; y: number } {
    const spot = { x: this.clampX(x), y: this.clampY(y) };
    if (this.canStand(spot.x, spot.y)) return spot;

    const col = Math.floor(spot.x / TILE_SIZE);
    const row = Math.floor(spot.y / TILE_SIZE);

    for (let ring = 0; ring <= 6; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          // The middle of a tile is the one place in it she is certainly clear.
          const cx = (col + dc + 0.5) * TILE_SIZE;
          const cy = (row + dr + 0.5) * TILE_SIZE;
          if (this.canStand(cx, cy)) return { x: cx, y: cy };
        }
      }
    }

    return spot;
  }

  solidAt(x: number, y: number): boolean {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
    return this.blocked[row * this.cols + col] === 1;
  }

  /**
   * Give these tiles back. She has knocked the last of something out of them.
   *
   * The grid this walks on is the live one, built from the map file at boot and
   * this map's own from then on — which is the whole reason the collision is a
   * bitmap the world owns rather than the string it arrived as. Returns whether
   * anything actually changed, so a caller only pays to tell the test hooks when
   * the world really has a new hole in it.
   */
  clear(cells: Iterable<readonly [number, number]>): boolean {
    let changed = false;
    for (const [col, row] of cells) {
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) continue;
      const i = row * this.cols + col;
      if (!this.blocked[i]) continue;
      this.blocked[i] = 0;
      changed = true;
    }
    return changed;
  }

  /** The live collision grid, written the way the map file writes it. */
  get blockedString(): string {
    return Array.from(this.blocked, (b) => (b ? '1' : '0')).join('');
  }

  /**
   * Stop fading this sprite. It is about to be destroyed, and an occluder whose
   * image has gone is a null dereference once a frame for the rest of the zone.
   */
  forget(sprite: WorldSprite): void {
    const i = this.occluders.findIndex((o) => o.image === sprite);
    if (i >= 0) this.occluders.splice(i, 1);
  }

  /** Keep her feet on the map, whatever the collision test says. */
  clampX(x: number): number {
    return Phaser.Math.Clamp(x, BODY_HALF_W, this.widthPx - BODY_HALF_W);
  }

  clampY(y: number): number {
    return Phaser.Math.Clamp(y, BODY_HEIGHT, this.heightPx - 1);
  }

  /** Pack pixels to screen pixels. Map data never knows the scale. */
  static toWorld(packPixels: number): number {
    return packPixels * WORLD_SCALE;
  }

  // --- building it ---------------------------------------------------------

  /**
   * Nearest-neighbour on every texture the world is made of.
   *
   * Set per texture rather than through Phaser's global `pixelArt` flag,
   * because that flag also turns off antialiasing for the shapes the UI is
   * drawn from — the speech balloon, the button dots and every glow would go
   * jagged to sharpen the grass. The camera rounds its scroll instead, which is
   * the other half of keeping an integer-scaled tile grid from shimmering.
   */
  private sharpen(): void {
    const keys = [
      ...this.map.tilesets.map((t) => t.key),
      ...new Set(this.map.images.map((i) => i.file)),
    ];
    for (const key of keys) {
      if (this.scene.textures.exists(key)) {
        this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  private paintGround(): void {
    const { map } = this;
    const tilemap = this.scene.make.tilemap({
      tileWidth: map.tile,
      tileHeight: map.tile,
      width: map.cols,
      height: map.rows,
    });

    const tilesets = map.tilesets
      .map((t) =>
        tilemap.addTilesetImage(t.key, t.key, map.tile, map.tile, 0, 0, t.firstgid),
      )
      .filter((t): t is Phaser.Tilemaps.Tileset => t !== null);

    const paint = (name: string, gids: number[], depth: number) => {
      const layer = tilemap.createBlankLayer(name, tilesets, 0, 0);
      if (!layer) return null;
      const grid: number[][] = [];
      for (let y = 0; y < map.rows; y++) grid.push(gids.slice(y * map.cols, (y + 1) * map.cols));
      layer.putTilesAt(grid, 0, 0);
      layer.setScale(WORLD_SCALE).setDepth(depth);
      // Culling is what makes a map this size cheap; say so rather than rely on it.
      layer.setSkipCull(false);
      return layer;
    };

    const ground = paint('ground', map.ground, DEPTH.ground);
    // Grass variants ride a tile above the ground: their edge tiles are
    // transparent on the outside, so they can only blend by being drawn over
    // what they are blending into. Nothing else lives between the two.
    if (map.overlay) paint('overlay', map.overlay, DEPTH.ground + 1);

    if (ground && map.tileAnims?.length) this.animateTiles(ground, map.tileAnims);
  }

  /**
   * Cycle the pond. One timer per distinct rate rather than per tile: the
   * generator already resolved every frame's tile id, so a frame is a handful
   * of writes into a layer that was going to be redrawn anyway.
   */
  private animateTiles(
    layer: Phaser.Tilemaps.TilemapLayer,
    anims: NonNullable<MapData['tileAnims']>,
  ): void {
    const byRate = new Map<number, typeof anims>();
    for (const anim of anims) {
      const group = byRate.get(anim.fps);
      if (group) group.push(anim);
      else byRate.set(anim.fps, [anim]);
    }

    for (const [fps, group] of byRate) {
      let frame = 0;
      this.scene.time.addEvent({
        delay: 1000 / fps,
        loop: true,
        callback: () => {
          frame++;
          for (const anim of group) {
            const gid = anim.gids[frame % anim.gids.length]!;
            layer.putTileAt(gid, anim.i % this.cols, Math.floor(anim.i / this.cols));
          }
        },
      });
    }
  }

  private placeSprites(): void {
    for (const image of this.map.images) {
      if (!this.scene.textures.exists(image.file)) continue;
      const texture = this.scene.textures.get(image.file);
      if (!texture.has(image.key)) texture.add(image.key, 0, image.x, image.y, image.w, image.h);

      // An animation strip is the same rectangle stepped across the sheet. Its
      // frames are registered on the shared texture under the image's own key,
      // and the animation is global to the game — a second zone using the same
      // campfire finds it already made.
      if (!image.frames || image.frames < 2) continue;
      for (let f = 1; f < image.frames; f++) {
        const name = frameName(image.key, f);
        if (!texture.has(name)) {
          texture.add(name, 0, image.x + f * image.w, image.y, image.w, image.h);
        }
      }
      const key = animKey(image.key);
      if (!this.scene.anims.exists(key)) {
        this.scene.anims.create({
          key,
          frames: Array.from({ length: image.frames }, (_, f) => ({
            key: image.file,
            frame: f === 0 ? image.key : frameName(image.key, f),
          })),
          frameRate: image.fps ?? 8,
          repeat: -1,
        });
      }
    }

    for (const sprite of this.map.sprites) {
      this.addSprite(sprite.key, sprite.x, sprite.y);
    }
  }

  /**
   * One catalog image, standing on the map. Depth is the bottom of the sprite,
   * so the whole world and the player sort in one shared space.
   */
  addSprite(key: string, packX: number, packY: number): WorldSprite | null {
    const image = this.map.images.find((i) => i.key === key);
    if (!image || !this.scene.textures.exists(image.file)) return null;

    const x = packX * WORLD_SCALE;
    const y = packY * WORLD_SCALE;
    const width = image.w * WORLD_SCALE;
    const height = image.h * WORLD_SCALE;

    let sprite: WorldSprite;
    if (image.frames && image.frames > 1 && this.scene.anims.exists(animKey(image.key))) {
      const animated = this.scene.add.sprite(x, y, image.file, image.key);
      animated.play(animKey(image.key));
      // Every campfire in the world starting on frame zero reads as one machine
      // rather than several fires. Staggered by placement order, so it is still
      // the same world on every load.
      animated.anims.setProgress(((this.placed * 7) % 16) / 16);
      sprite = animated;
    } else {
      sprite = this.scene.add.image(x, y, image.file, image.key);
    }
    this.placed++;

    // A rug is drawn lying on the floor, so it sorts below everything that
    // stands on one — including her. Sorted against nothing: two rugs are never
    // laid overlapping, and if they were, the layout said so.
    sprite
      .setOrigin(0, 0)
      .setScale(WORLD_SCALE)
      .setDepth(image.flat ? DEPTH.floorPiece : y + height);

    if (!image.flat && image.h >= OCCLUDER_TILES * this.map.tile) {
      this.occluders.push({
        image: sprite,
        left: x,
        right: x + width,
        top: y,
        bottom: y + height,
        depth: y + height,
      });
    }

    return sprite;
  }
}
