/**
 * Which slices of the Cute Fantasy pack the world is built out of.
 *
 * Everything here is a measurement of somebody else's PNG, taken once and
 * written down, so no other file has to know that a big oak is the *second*
 * 64-wide slot of `Big_Oak_Tree.png` or that a wardrobe is 32x32 at (0, 80) of
 * `Furniture_Other.png`. The layout in `content/world/` names these keys and
 * nothing else; the generator turns keys into rectangles here.
 *
 * Two shapes of thing live in here:
 *
 *  - **Tilesets.** Whole PNGs cut on the pack's 16 px grid, addressed by column
 *    and row. Ground goes in a tile layer, so these are what a map's terrain is
 *    made of.
 *  - **Images.** A rectangle of a PNG placed as one sprite — a house, a tree, a
 *    bed. Anything that is not 16x16 or wants to be y-sorted against the player.
 *
 * The pack's own autotile convention is worth stating because the whole terrain
 * pipeline leans on it: a region of terrain X carved into background Y is drawn
 * by a **3 wide by 5 tall block** of tiles — a 3x3 ring of edges around X's
 * middle, then four inner corners in the 2x2 below it. Water in grass, cobble
 * in dirt and sand in grass are all that same block at different offsets, which
 * is why `blob.ts` can resolve any of them with one function.
 */

/** Pixels per tile in the pack. Everything in a generated map is a multiple. */
export const TILE = 16;

/** Where `npm run assets:sync` puts the pack, from the browser's point of view. */
const A = 'assets/Cute_Fantasy';

export interface TilesetDef {
  /** Phaser texture key, and the tileset name inside the map. */
  key: string;
  /** URL under `public/`. */
  file: string;
}

/**
 * Every PNG the ground layer draws from. Sizes are measured off the files at
 * build time rather than written down here, so a pack update cannot silently
 * shift every tile index in the world.
 */
export const TILESETS: Record<string, TilesetDef> = {
  grassMid: { key: 'grassMid', file: `${A}/Tiles/Grass/Grass_1_Middle.png` },
  grassEdge: { key: 'grassEdge', file: `${A}/Tiles/Grass/Grass_Tiles_1.png` },
  water: { key: 'water', file: `${A}/Tiles/Water/Water_Tile_1.png` },
  farmland: { key: 'farmland', file: `${A}/Tiles/FarmLand/FarmLand_Tile.png` },
  floor: { key: 'floor', file: `${A}/Buildings/Houses_Interiors/Wood_Floor_Tiles.png` },
  wall: { key: 'wall', file: `${A}/Buildings/Houses_Interiors/Interior_Walls.png` },
};

/**
 * A 3x5 autotile block: where it starts inside its tileset, in tiles. The
 * terrain it draws sits in the middle; the background it is carved into is
 * painted around the edges of the block's own art, which is why a blob terrain
 * can only ever border the background it was drawn against.
 */
export interface BlobDef {
  tileset: string;
  col: number;
  row: number;
  /** For the report and for anyone reading a map: what this is carved into. */
  over: string;
}

export const BLOBS: Record<string, BlobDef> = {
  // Sand-coloured dirt paths, cut into grass. Bottom-left block of the grass
  // sheet; the top-left block of the same sheet is grass cut into nothing.
  path: { tileset: 'grassEdge', col: 0, row: 5, over: 'grass' },
  water: { tileset: 'water', col: 0, row: 0, over: 'grass' },
};

/** Plain fills: terrain that is one tile repeated. */
export const FILLS: Record<string, { tileset: string; col: number; row: number }> = {
  grass: { tileset: 'grassMid', col: 0, row: 0 },
  // The middle of the ploughed-field autotile, used flat for the vegetable patch.
  farm: { tileset: 'farmland', col: 3, row: 3 },
};

/**
 * Interior floors come in 2x2 patterns, so a floor is addressed by which
 * pattern it is and the cell's parity picks the quarter. Block coordinates are
 * in units of 2 tiles, counting from the top-left of `Wood_Floor_Tiles.png`.
 */
export const FLOOR_PATTERNS: Record<string, { bx: number; by: number }> = {
  planks: { bx: 1, by: 1 },
  boards: { bx: 0, by: 1 },
  herringbone: { bx: 2, by: 1 },
  parquet: { bx: 0, by: 3 },
  brick: { bx: 1, by: 0 },
  /** Cool blue tiles. Reads as "a different room" from across the house. */
  tile: { bx: 0, by: 2 },
};

/**
 * The interior wall. Cream plaster, three tiles tall: a lit top edge, a plain
 * middle and a skirting board. A one-tile partition uses the middle row, which
 * from above reads as a wall without pretending to have a face.
 */
export const WALL_TILES = {
  tileset: 'wall',
  col: 1,
  top: 3,
  middle: 4,
  bottom: 5,
} as const;

export interface ImageDef {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * How much of the sprite is solid, as a tile rectangle measured from its
   * top-left. Absent means the whole thing is walk-through. A tree only blocks
   * its trunk, so she can walk behind a canopy — which is most of what makes a
   * wood feel like a wood rather than a wall.
   */
  blocks?: { x: number; y: number; w: number; h: number };
}

/**
 * Everything placed as a sprite. Rectangles were measured off the PNGs with a
 * connected-component pass, not guessed: the pack lays its trees out in fixed
 * 32 or 64 pixel slots with the art floating inside them, so the slot is what
 * gets named here and the art stays where its author put it.
 */
export const IMAGES: Record<string, ImageDef> = {
  // --- buildings ---------------------------------------------------------
  // Seraphina's house is the only enterable one; the rest are facades.
  // Footprints stop one tile short of each building's drawn base, so she can
  // walk right up to a door and stand on the step rather than being held off it.
  house: {
    file: `${A}/Buildings/Buildings/Houses/Stone/House_1_Stone_Base_Red.png`,
    x: 0, y: 0, w: 96, h: 128,
    blocks: { x: 0, y: 0, w: 6, h: 7 },
  },
  shed: {
    file: `${A}/Buildings/Buildings/Unique_Buildings/Shed/Shed_Red_Blue.png`,
    x: 0, y: 0, w: 96, h: 112,
    blocks: { x: 0, y: 0, w: 6, h: 6 },
  },
  joeyHouse: {
    file: `${A}/Buildings/Buildings/Houses/Wood/House_4_Wood_Green_Blue.png`,
    x: 0, y: 0, w: 112, h: 96,
    blocks: { x: 0, y: 0, w: 7, h: 5 },
  },
  scarHouse: {
    file: `${A}/Buildings/Buildings/Unique_Buildings/Fisherman_House/Fisherman_House_Green_Red.png`,
    x: 0, y: 0, w: 96, h: 112,
    blocks: { x: 0, y: 0, w: 6, h: 6 },
  },
  caveMouth: {
    file: `${A}/Tiles/Cliff/Stone_Cliff_1_Cave_Entrance.png`,
    x: 0, y: 0, w: 48, h: 48,
    blocks: { x: 0, y: 0, w: 3, h: 2 },
  },

  // --- trees -------------------------------------------------------------
  // Only the trunk blocks, and only the one tile it actually stands on. The
  // canopy is scenery she walks under, which is most of what makes a wood feel
  // like a wood rather than a maze — and a one-tile trunk leaves two-tile gaps
  // between trees, which is what a four-year-old with a thumbstick can steer
  // through without ever being stuck.
  oakBig: {
    file: `${A}/Trees/Big_Oak_Tree.png`, x: 64, y: 0, w: 64, h: 80,
    blocks: { x: 2, y: 4, w: 1, h: 1 },
  },
  oakBig2: {
    file: `${A}/Trees/Big_Oak_Tree.png`, x: 128, y: 0, w: 64, h: 80,
    blocks: { x: 2, y: 4, w: 1, h: 1 },
  },
  spruceBig: {
    file: `${A}/Trees/Big_Spruce_tree.png`, x: 64, y: 0, w: 64, h: 80,
    blocks: { x: 2, y: 4, w: 1, h: 1 },
  },
  spruceBig2: {
    file: `${A}/Trees/Big_Spruce_tree.png`, x: 128, y: 0, w: 64, h: 80,
    blocks: { x: 2, y: 4, w: 1, h: 1 },
  },
  birchBig: {
    file: `${A}/Trees/Big_Birch_Tree.png`, x: 32, y: 0, w: 32, h: 80,
    blocks: { x: 1, y: 4, w: 1, h: 1 },
  },
  fruitBig: {
    file: `${A}/Trees/Big_Fruit_Tree.png`, x: 32, y: 0, w: 32, h: 64,
    blocks: { x: 1, y: 3, w: 1, h: 1 },
  },
  oakMed: {
    file: `${A}/Trees/Medium_Oak_Tree.png`, x: 32, y: 0, w: 32, h: 48,
    blocks: { x: 1, y: 2, w: 1, h: 1 },
  },
  spruceMed: {
    file: `${A}/Trees/Medium_Spruce_Tree.png`, x: 32, y: 0, w: 32, h: 48,
    blocks: { x: 1, y: 2, w: 1, h: 1 },
  },
  oakSmall: { file: `${A}/Trees/Small_Oak_Tree.png`, x: 32, y: 0, w: 32, h: 64 },
  stump: { file: `${A}/Trees/Big_Oak_Tree.png`, x: 16, y: 48, w: 32, h: 32 },

  // --- ground dressing ---------------------------------------------------
  // 16x16 cells of Outdoor_Decor.png, indexed (column, row) from its top-left.
  flowerBlue: decor(0, 0),
  flowerWhite: decor(3, 0),
  daisies: decor(2, 1),
  flowerRed: decor(4, 1),
  flowerYellow: decor(5, 2),
  sprig: decor(0, 2),
  sprig2: decor(1, 2),
  tallGrass: decor(6, 2),
  toadstool: decor(0, 3),
  toadstoolPurple: decor(1, 3),
  toadstoolBlue: decor(2, 3),
  bush: decor(5, 5),
  bushBright: decor(3, 9),
  bushDark: decor(5, 9),
  rock: decor(6, 6),
  rockSmall: decor(7, 7),
  mossyStump: decor(1, 6),
  log: { file: `${A}/Outdoor decoration/Outdoor_Decor.png`, x: 0, y: 112, w: 32, h: 16 },
  lilypad: decor(4, 3),
  cattail: decor(6, 3),
  waterRock: decor(4, 4),

  // Bare flowers from the flower sheet: five columns of them, ten rows deep.
  bloomPink: flower(1, 0),
  bloomYellow: flower(2, 1),
  bloomWhite: flower(2, 2),
  bloomRed: flower(0, 4),
  bloomPurple: flower(3, 4),

  // --- outdoor props -----------------------------------------------------
  well: {
    file: `${A}/Outdoor decoration/Well.png`, x: 0, y: 0, w: 32, h: 48,
    blocks: { x: 0, y: 1, w: 2, h: 2 },
  },
  // Eight 16x32 frames of it burning; the world is still, so this is frame one.
  campfire: {
    file: `${A}/Outdoor decoration/Outdoor_Decor_Animations/Other_Animations/Campfire_Anim.png`,
    x: 0, y: 0, w: 16, h: 32,
  },
  chest: { file: `${A}/Buildings/House_Decor/Chest_Anim.png`, x: 0, y: 0, w: 16, h: 16 },
  scarecrow: {
    file: `${A}/Outdoor decoration/Scarecrows.png`, x: 0, y: 0, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  fenceRail: {
    file: `${A}/Outdoor decoration/Fences.png`, x: 16, y: 0, w: 48, h: 16,
    blocks: { x: 0, y: 0, w: 3, h: 1 },
  },
  fencePost: {
    file: `${A}/Outdoor decoration/Fences.png`, x: 0, y: 0, w: 16, h: 48,
    blocks: { x: 0, y: 2, w: 1, h: 1 },
  },

  // --- interior furniture ------------------------------------------------
  // Beds come six colours deep at 32 pixel intervals; pink is Seraphina's.
  bed: {
    file: `${A}/Buildings/House_Decor/Beds.png`, x: 0, y: 96, w: 32, h: 32,
    blocks: { x: 0, y: 0, w: 2, h: 2 },
  },
  bedTeal: {
    file: `${A}/Buildings/House_Decor/Beds.png`, x: 0, y: 32, w: 32, h: 32,
    blocks: { x: 0, y: 0, w: 2, h: 2 },
  },
  wardrobe: {
    file: `${A}/Buildings/House_Decor/Furniture_Other.png`, x: 0, y: 80, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  bookshelf: {
    file: `${A}/Buildings/House_Decor/BookShelves.png`, x: 16, y: 0, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  fireplace: {
    file: `${A}/Buildings/House_Decor/Fireplaces.png`, x: 0, y: 0, w: 32, h: 48,
    blocks: { x: 0, y: 2, w: 2, h: 1 },
  },
  stove: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 0, y: 0, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },
  sink: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 0, y: 32, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },
  fridge: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 0, y: 64, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  tableWide: {
    file: `${A}/Buildings/House_Decor/Tables.png`, x: 0, y: 16, w: 64, h: 48,
    blocks: { x: 0, y: 1, w: 4, h: 2 },
  },
  tableRound: {
    file: `${A}/Buildings/House_Decor/Tables.png`, x: 112, y: 0, w: 48, h: 64,
    blocks: { x: 0, y: 2, w: 3, h: 2 },
  },
  // Carpets come in eight colour bands 80 px apart: four squares along the top
  // of a band, rounds and runners along the bottom.
  rug: { file: `${A}/Buildings/House_Decor/Carpets.png`, x: 0, y: 240, w: 48, h: 48 },
  rugBlue: { file: `${A}/Buildings/House_Decor/Carpets.png`, x: 96, y: 80, w: 48, h: 48 },
  rugRound: { file: `${A}/Buildings/House_Decor/Carpets.png`, x: 0, y: 368, w: 32, h: 32 },
  door: { file: `${A}/Buildings/House_Decor/Doors.png`, x: 0, y: 0, w: 16, h: 32 },
};

function decor(col: number, row: number): ImageDef {
  return {
    file: `${A}/Outdoor decoration/Outdoor_Decor.png`,
    x: col * TILE,
    y: row * TILE,
    w: TILE,
    h: TILE,
  };
}

function flower(col: number, row: number): ImageDef {
  return {
    file: `${A}/Outdoor decoration/Flowers.png`,
    x: col * TILE,
    y: row * TILE,
    w: TILE,
    h: TILE,
  };
}
