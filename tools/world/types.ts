/**
 * What a layout says, and what a built map is.
 *
 * Two vocabularies live here on purpose. `ZoneLayout` is what a person writes
 * in `content/world/` — regions, roads, "a house here" — and `BuiltMap` is what
 * `npm run world:build` leaves in `public/world/` for the game to read. The
 * generator is the only thing that knows both.
 *
 * Everything in both is measured in **pack pixels** or **tiles**, never in
 * screen pixels. The one world scale lives in `src/config.ts` and is applied
 * when the map is loaded, so changing how big the world looks never means
 * regenerating it.
 */

import type { Cell, Placement } from './shapes.js';

export type Direction = 'down' | 'up' | 'left' | 'right';

/** Which little transition flourish a doorway plays; see world/transition.ts. */
export type FlourishId = 'sparkle' | 'hush';

/**
 * How a doorway is used. Stardew's convention, and Matt's (2026-08-10): you
 * walk *out* of a building without thinking about it, and you press the green
 * button to walk *in*. A door you can fall through on the way past is the
 * nearest thing to a fail state a no-fail game has.
 */
export type DoorwayEntry = 'walk' | 'press';

/** Terrain that is one tile repeated, or a blob autotiled against its base. */
export type TerrainKind = 'grass' | 'path' | 'water' | 'farm';

export interface TerrainPaint {
  kind: TerrainKind;
  cells: Iterable<Cell>;
}

/**
 * A patch of a different grass, drawn on a second tile layer over the first.
 *
 * The pack ships four grass colours and an edge set for each, and the edge sets
 * blend a grass into *transparency* rather than into another grass — the middle
 * tile of every block is blank, because the flat middle is a separate file. So
 * a variant cannot live in the same layer as the ground it blends over: it has
 * to be painted above it. Which is the whole reason `overlay` exists, and why
 * one is worth the second layer — a world of one flat green is the thing that
 * makes a bought art pack look cheap.
 */
export interface OverlayPaint {
  /** Key into OVERLAYS. */
  kind: string;
  cells: Iterable<Cell>;
}

export interface FloorPaint {
  /** Key into FLOOR_PATTERNS. */
  pattern: string;
  cells: Iterable<Cell>;
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpawnLayout {
  /** Where her feet stand, in tiles. */
  x: number;
  y: number;
  facing: Direction;
}

export interface DoorwayLayout {
  id: string;
  /** Trigger area, in tiles. Generous: she aims a thumbstick, not a mouse. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Zone on the far side, and which of its spawns to land on. */
  to: string;
  toSpawn: string;
  /** Walk through it, or stand at it and press green. Defaults to walking. */
  enter?: DoorwayEntry;
  flourish: FlourishId;
  /** Colour of the light spilling out of it. */
  tint: number;
  /** Which way the light spills into the room. */
  facing: Direction;
}

export interface PropLayout {
  id: string;
  /** Catalog image key. */
  image: string;
  /** Top-left of the sprite, in tiles. */
  x: number;
  y: number;
  /**
   * Where she has to stand near, and where the green dot appears — in tiles.
   * Defaults to the middle of the sprite, which is right for a chest and wrong
   * for a house: a facade's prop *is* the whole building, and the thing you
   * poke is its door.
   */
  at?: { x: number; y: number };
  /**
   * Manifest line it speaks when she pokes it. A prop with no line is a facade
   * door: it wiggles and chimes and says nothing, which is the only way this
   * game is allowed to have something that does not talk.
   */
  line?: string;
}

export interface LandmarkLayout {
  id: string;
  /** In tiles. Where a test stands to photograph the place. */
  x: number;
  y: number;
}

export interface ZoneLayout {
  id: string;
  cols: number;
  rows: number;
  /** Painted in order; later paints win. */
  terrain?: TerrainPaint[];
  /** Grass variants, on a second layer above the terrain. Later paints win. */
  overlay?: OverlayPaint[];
  floors?: FloorPaint[];
  /** One-tile interior walls. */
  walls?: Iterable<Cell>;
  /** Three-tile-tall wall bands, drawn top edge / face / skirting downwards. */
  tallWalls?: TileRect[];
  /** Sprites: buildings, trees, dressing. Collision comes from the catalog. */
  place: Placement[];
  /** Blocked outright, whatever is drawn there — the map's own edge, mostly. */
  block?: Iterable<Cell>;
  spawns: Record<string, SpawnLayout>;
  doorways: DoorwayLayout[];
  props: PropLayout[];
  landmarks: LandmarkLayout[];
  /** What shows through where there are no tiles at all. */
  backdrop: number;
}

// --- what the game reads ---------------------------------------------------

export interface BuiltTileset {
  key: string;
  file: string;
  columns: number;
  /** First global tile id this tileset owns. */
  firstgid: number;
  total: number;
}

export interface BuiltImage {
  key: string;
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * How many frames follow this rectangle across the sheet, if it is one of the
   * pack's animation strips. Absent or 1 means a still picture.
   */
  frames?: number;
  /** Frames per second, when there are frames. */
  fps?: number;
}

/**
 * One ground tile that cycles. The pack draws its water as eight copies of the
 * same autotile block laid out across one sheet, so a moving pond is the same
 * tile index shifted a block to the right per frame — resolved here, at build
 * time, because the game should not have to know how a sheet is laid out.
 */
export interface BuiltTileAnim {
  /** Index into the ground grid. */
  i: number;
  /** Global tile id per frame, in order. */
  gids: number[];
  fps: number;
}

export interface BuiltSprite {
  key: string;
  /** Top-left of the sprite, in pack pixels. */
  x: number;
  y: number;
}

export interface BuiltMarker {
  id: string;
  /** Centre, in pack pixels. */
  x: number;
  y: number;
}

/**
 * `x, y` is where she walks up to and where the dot appears; `sx, sy` is the
 * sprite's top-left. They differ for a facade, whose sprite is a whole house
 * and whose interaction is its front door.
 */
export interface BuiltProp extends BuiltMarker {
  key: string;
  sx: number;
  sy: number;
  line?: string;
}

export interface BuiltDoorway {
  id: string;
  /** Trigger rectangle, in pack pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  to: string;
  toSpawn: string;
  enter: DoorwayEntry;
  flourish: FlourishId;
  tint: number;
  facing: Direction;
}

export interface BuiltSpawn {
  /** Her feet, in pack pixels. */
  x: number;
  y: number;
  facing: Direction;
}

export interface BuiltMap {
  id: string;
  tile: number;
  cols: number;
  rows: number;
  backdrop: number;
  tilesets: BuiltTileset[];
  images: BuiltImage[];
  /** Global tile ids, row-major. -1 is nothing. */
  ground: number[];
  /** A second tile layer over the first, for grass variants. -1 is nothing. */
  overlay?: number[];
  /** Ground tiles that cycle — moving water, mostly. */
  tileAnims?: BuiltTileAnim[];
  /** '1' where she cannot stand, row-major, one character per tile. */
  blocked: string;
  sprites: BuiltSprite[];
  spawns: Record<string, BuiltSpawn>;
  doorways: BuiltDoorway[];
  props: BuiltProp[];
  landmarks: BuiltMarker[];
}
