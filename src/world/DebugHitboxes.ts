/**
 * What the collision grid actually looks like, while the keyboard's B is held.
 *
 * A hitbox is the one thing in this world with no picture. The trees were drawn
 * by somebody else, the tiles they block are a string of ones and zeroes in a
 * generated file, and "is that trunk standing on the tile it stops her at" is a
 * question no screenshot could answer either way. Which is exactly how a whole
 * wood came to be blocking the tile down and to the right of every trunk without
 * anybody noticing. So: draw the answer.
 *
 * The **keyboard's** B, not the pad's — the pad's red button is the player's
 * cancel and stays hers. It ships always-enabled: a debug view behind a build
 * flag is a debug view that has rotted by the time somebody needs it, and this
 * one costs an invisible Graphics object until a key goes down.
 *
 * It draws four things, in the order a misalignment is usually read:
 *
 *  1. every solid cell of the collision grid, filled;
 *  2. the footprint each placed sprite contributed, outlined;
 *  3. each sprite's origin — the corner its picture is hung from;
 *  4. her own collision box, which is small and at her feet.
 *
 * Changes nothing. Reads the same grid the walking does.
 */

import Phaser from 'phaser';
import { DEPTH, TILE_SIZE, WORLD_SCALE } from '../config';
import type { MapData } from './mapData';
import { TileWorld } from './TileWorld';

/**
 * Solid ground: hot pink, because nothing else in this world is. Laid on hard
 * enough that it cannot be read as a patch of dirt — over grass, a light wash of
 * red is exactly what a worn path looks like.
 */
const SOLID_FILL = 0xff2d55;
const SOLID_ALPHA = 0.45;

/** A sprite's own contribution to that, outlined over the top of it. */
const FOOTPRINT = 0x30e0ff;

/** Where a picture is hung from — its top-left, which is not its base. */
const ORIGIN = 0xffd94a;

/** Her box. Green, the colour of the button that means "yes, this one". */
const BODY = 0x66ff66;

/** Arms of the little cross drawn at a sprite's origin, in screen pixels. */
const ORIGIN_ARM = 7;

/** One placed picture, and the cells it made solid. */
interface Footprint {
  /** The sprite's origin — its top-left — in screen pixels. */
  x: number;
  y: number;
  /** The solid rectangle, in screen pixels. Absent where the sprite blocks nothing. */
  cells: Phaser.Geom.Rectangle | null;
}

/** A tree's current picture and the cells under it, or null once it is gone. */
export interface LiveFootprint {
  /** Sprite top-left, in pack pixels. */
  x: number;
  y: number;
  cells: { x: number; y: number; w: number; h: number };
}

export class DebugHitboxes {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly footprints: Footprint[] = [];
  private showing = false;

  /**
   * @param live Anything that can change shape while the zone is running — the
   *   trees, which fall down and leave stumps and eventually nothing at all. It
   *   is a function rather than a list because the answer moves, and it is only
   *   ever called while the overlay is on screen, which is while B is held.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: TileWorld,
    private readonly live: () => (LiveFootprint | null)[] = () => [],
  ) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.debug).setVisible(false);
    this.collectFootprints(world.map);
  }

  /**
   * Every sprite in the zone, with the tiles it blocks — worked out the same way
   * the generator worked them out, from the same catalog rectangle it wrote into
   * the map file. If these two ever disagree, the overlay is lying, so they are
   * deliberately the same two lines of arithmetic and nothing more.
   */
  private collectFootprints(map: MapData): void {
    const placed = [
      ...map.sprites.map((s) => ({ key: s.key, x: s.x, y: s.y })),
      ...map.props.map((p) => ({ key: p.key, x: p.sx, y: p.sy })),
    ];

    for (const { key, x, y } of placed) {
      const blocks = map.images.find((i) => i.key === key)?.blocks;
      this.footprints.push({
        x: x * WORLD_SCALE,
        y: y * WORLD_SCALE,
        cells: blocks
          ? new Phaser.Geom.Rectangle(
              Math.round(x / map.tile + blocks.x) * TILE_SIZE,
              Math.round(y / map.tile + blocks.y) * TILE_SIZE,
              blocks.w * TILE_SIZE,
              blocks.h * TILE_SIZE,
            )
          : null,
      });
    }
  }

  /**
   * The trees, as they stand this frame. Their cells come straight from the
   * generator rather than being re-derived from the picture, because a stump
   * inherits the trunk's tile and is not the same size as the tree that left it.
   */
  private liveFootprints(): Footprint[] {
    const out: Footprint[] = [];
    for (const tree of this.live()) {
      if (!tree) continue;
      out.push({
        x: tree.x * WORLD_SCALE,
        y: tree.y * WORLD_SCALE,
        cells: new Phaser.Geom.Rectangle(
          tree.cells.x * TILE_SIZE,
          tree.cells.y * TILE_SIZE,
          tree.cells.w * TILE_SIZE,
          tree.cells.h * TILE_SIZE,
        ),
      });
    }
    return out;
  }

  /** Held down, or turned on by a test. Redrawing only happens while it is up. */
  setVisible(on: boolean): void {
    this.showing = on;
    this.graphics.setVisible(on);
    if (!on) this.graphics.clear();
  }

  get visible(): boolean {
    return this.showing;
  }

  /** Called every frame; does nothing at all unless the key is down. */
  draw(playerX: number, playerY: number): void {
    if (!this.showing) return;

    const g = this.graphics;
    g.clear();

    // The exterior is 72 by 50 tiles and the headless browser runs this at
    // twenty-odd frames a second, so only what the camera can see is drawn.
    const view = this.scene.cameras.main.worldView;

    this.drawSolidCells(g, view);

    const all = [...this.footprints, ...this.liveFootprints()];

    g.lineStyle(2, FOOTPRINT, 0.95);
    for (const { cells } of all) {
      if (cells && Phaser.Geom.Intersects.RectangleToRectangle(cells, view)) {
        g.strokeRectShape(cells);
      }
    }

    g.lineStyle(2, ORIGIN, 0.9);
    for (const { x, y } of all) {
      if (!view.contains(x, y)) continue;
      g.lineBetween(x - ORIGIN_ARM, y, x + ORIGIN_ARM, y);
      g.lineBetween(x, y - ORIGIN_ARM, x, y + ORIGIN_ARM);
    }

    const body = TileWorld.body(playerX, playerY);
    g.fillStyle(BODY, 0.35).fillRectShape(body);
    g.lineStyle(2, BODY, 1).strokeRectShape(body);
  }

  private drawSolidCells(g: Phaser.GameObjects.Graphics, view: Phaser.Geom.Rectangle): void {
    const { cols, rows } = this.world.map;
    const first = (v: number) => Math.max(0, Math.floor(v / TILE_SIZE));
    const last = (v: number, n: number) => Math.min(n - 1, Math.floor(v / TILE_SIZE));

    g.fillStyle(SOLID_FILL, SOLID_ALPHA);
    for (let row = first(view.top); row <= last(view.bottom, rows); row++) {
      for (let col = first(view.left); col <= last(view.right, cols); col++) {
        if (!this.world.solidAt(col * TILE_SIZE, row * TILE_SIZE)) continue;
        g.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}
