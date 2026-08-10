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

/** The pack keeps every outdoor animation strip under one long path. */
const ANIM = 'Outdoor decoration/Outdoor_Decor_Animations';

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
  // The other three grass colours, and the edge set that blends each of them
  // over the first. Middles are their own one-tile files because the middle of
  // every edge sheet is deliberately blank — see OVERLAYS.
  grass2Mid: { key: 'grass2Mid', file: `${A}/Tiles/Grass/Grass_2_Middle.png` },
  grass2Edge: { key: 'grass2Edge', file: `${A}/Tiles/Grass/Grass_Tiles_2.png` },
  grass3Mid: { key: 'grass3Mid', file: `${A}/Tiles/Grass/Grass_3_Middle.png` },
  grass3Edge: { key: 'grass3Edge', file: `${A}/Tiles/Grass/Grass_Tiles_3.png` },
  grass4Mid: { key: 'grass4Mid', file: `${A}/Tiles/Grass/Grass_4_Middle.png` },
  grass4Edge: { key: 'grass4Edge', file: `${A}/Tiles/Grass/Grass_Tiles_4.png` },
  // Eight copies of the water block side by side: one sheet, one tileset, and a
  // pond that moves. The still sheet is not loaded at all any more.
  water: { key: 'water', file: `${A}/Tiles/Water/Water_Tile_1_Anim.png` },
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
  /**
   * How many copies of the block sit side by side across the sheet, when it is
   * an animation strip. The whole 3x5 block repeats every `frames` × 3 columns.
   */
  frames?: number;
  fps?: number;
}

export const BLOBS: Record<string, BlobDef> = {
  // Sand-coloured dirt paths, cut into grass. Bottom-left block of the grass
  // sheet; the top-left block of the same sheet is grass cut into nothing.
  path: { tileset: 'grassEdge', col: 0, row: 5, over: 'grass' },
  // Six frames a second is the pack's own animation speed: fast enough to read
  // as water, slow enough not to strobe on a screen a four-year-old sits close to.
  water: { tileset: 'water', col: 0, row: 0, over: 'grass', frames: 8, fps: 6 },
};

/** Plain fills: terrain that is one tile repeated. */
export const FILLS: Record<string, { tileset: string; col: number; row: number }> = {
  grass: { tileset: 'grassMid', col: 0, row: 0 },
  // The middle of the ploughed-field autotile, used flat for the vegetable patch.
  farm: { tileset: 'farmland', col: 3, row: 3 },
};

/**
 * A grass variant, drawn on the overlay layer above the ground.
 *
 * The pack's four grass colours are four flat tiles and four edge sheets, and
 * every edge sheet's *middle* is blank — the middle is the flat file. So an
 * overlay is a pair: which flat tile fills the inside, and which 3x5 block draws
 * the ragged border where it meets whatever it was laid over. That border is
 * transparent on its outer side, which is why this cannot share a layer with the
 * ground it is blending into.
 *
 * Roads are deliberately not overlaid: a dirt path draws its own grass-coloured
 * corners out of `grassEdge`, and those corners are grass *one*. Regions keep a
 * tile clear of every road so the two never meet.
 */
export interface OverlayDef {
  fill: { tileset: string; col: number; row: number };
  edge: { tileset: string; col: number; row: number };
  /** What the eye should read it as, for anyone reading a layout. */
  reads: string;
}

export const OVERLAYS: Record<string, OverlayDef> = {
  meadowGrass: {
    fill: { tileset: 'grass2Mid', col: 0, row: 0 },
    edge: { tileset: 'grass2Edge', col: 0, row: 0 },
    reads: 'bright mown green — the village green',
  },
  dryGrass: {
    fill: { tileset: 'grass3Mid', col: 0, row: 0 },
    edge: { tileset: 'grass3Edge', col: 0, row: 0 },
    reads: 'sun-bleached olive — the farm',
  },
  woodGrass: {
    fill: { tileset: 'grass4Mid', col: 0, row: 0 },
    edge: { tileset: 'grass4Edge', col: 0, row: 0 },
    reads: 'cold blue-green — under the trees',
  },
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
  /**
   * Frames laid out to the right of this rectangle at `w`-pixel intervals, for
   * the pack's animation strips. The pack ships fire, water plants, grass tufts
   * and chests as strips and the world used to draw frame zero of every one of
   * them, which is how a cozy village ends up looking like a photograph of one.
   */
  frames?: number;
  /** Frames per second. Absent with `frames` means the pack's usual eight. */
  fps?: number;
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
  // The biggest thing in the village, and the reason the main road reads as a
  // street rather than a track: two building fronts side by side facing it.
  villageHall: {
    file: `${A}/Buildings/Buildings/Houses/Limestone/House_2_Limestone_Base_Blue.png`,
    x: 0, y: 0, w: 144, h: 128,
    blocks: { x: 0, y: 0, w: 9, h: 7 },
  },
  caveMouth: {
    file: `${A}/Tiles/Cliff/Stone_Cliff_1_Cave_Entrance.png`,
    x: 0, y: 0, w: 48, h: 48,
    blocks: { x: 0, y: 0, w: 3, h: 2 },
  },
  // Four awnings across one sheet, 48 apart. The counter blocks; the awning
  // does not, so she can stand behind a stall and be drawn behind its roof.
  stallRed: stall(0),
  stallGreen: stall(1),
  stallBlue: stall(2),
  stallYellow: stall(3),
  silo: {
    file: `${A}/Buildings/Buildings/Unique_Buildings/Silo/Silo.png`,
    x: 0, y: 0, w: 48, h: 80,
    blocks: { x: 0, y: 3, w: 3, h: 2 },
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

  // --- living ground dressing --------------------------------------------
  // The pack's animated tufts and blooms: eight 16x16 frames across one strip
  // each. Scattered thinly through open grass, these are what stop a field of
  // one flat colour from reading as a printed backdrop.
  swayGrass: anim(`${A}/${ANIM}/Grass_Animations/Grass_1_Anim.png`, 16, 16, 8),
  swayGrass2: anim(`${A}/${ANIM}/Grass_Animations/Grass_2_Anim.png`, 16, 16, 8),
  swayGrass3: anim(`${A}/${ANIM}/Grass_Animations/Grass_3_Anim.png`, 16, 16, 8),
  swayFlowers: anim(`${A}/${ANIM}/Grass_Animations/Flower_Grass_2_Anim.png`, 16, 16, 8),
  swayFlowers2: anim(`${A}/${ANIM}/Grass_Animations/Flower_Grass_7_Anim.png`, 16, 16, 8),
  swayFlowers3: anim(`${A}/${ANIM}/Grass_Animations/Flower_Grass_12_Anim.png`, 16, 16, 8),
  swayToadstool: anim(`${A}/${ANIM}/Muschroom_Animations/muschroom_1_Anim.png`, 16, 16, 6),
  swayToadstool2: anim(`${A}/${ANIM}/Muschroom_Animations/muschroom_5_Anim.png`, 16, 16, 6),
  // Six frames per row, ten colours down the sheet. Pots go beside doors.
  potRed: potted(0),
  potYellow: potted(3),
  potBlue: potted(6),
  potPink: potted(8),

  // --- water dressing ----------------------------------------------------
  lilypadRed: anim(`${A}/${ANIM}/Water_Decor_Animations/Water_Plants/Lillypad_Red_2_Anim.png`, 16, 16, 8),
  lilypadPurple: anim(`${A}/${ANIM}/Water_Decor_Animations/Water_Plants/Lillypad_Purple_3_Anim.png`, 16, 16, 8),
  reeds: anim(`${A}/${ANIM}/Water_Decor_Animations/Water_Plants/Water_Grass_1_Anim.png`, 16, 16, 8),
  reeds2: anim(`${A}/${ANIM}/Water_Decor_Animations/Water_Plants/Water_Grass_2_Anim.png`, 16, 16, 8),
  wetRock: anim(`${A}/${ANIM}/Water_Decor_Animations/Water_Rocks/Rock_5_Water_Anim.png`, 16, 16, 8),
  wetRock2: anim(`${A}/${ANIM}/Water_Decor_Animations/Water_Rocks/Rock_9_Water_Anim.png`, 16, 16, 8),

  // --- outdoor props -----------------------------------------------------
  well: {
    file: `${A}/Outdoor decoration/Well.png`, x: 0, y: 0, w: 32, h: 48,
    blocks: { x: 0, y: 1, w: 2, h: 2 },
  },
  campfire: {
    file: `${A}/${ANIM}/Other_Animations/Campfire_Anim.png`,
    x: 0, y: 0, w: 16, h: 32, frames: 8,
  },
  chest: {
    file: `${A}/Buildings/House_Decor/Chest_Anim.png`, x: 0, y: 0, w: 16, h: 16, frames: 6, fps: 6,
  },
  fountain: {
    file: `${A}/${ANIM}/Other_Animations/Fountain_Anim.png`,
    x: 0, y: 0, w: 32, h: 48, frames: 8,
    blocks: { x: 0, y: 1, w: 2, h: 2 },
  },
  torch: {
    file: `${A}/${ANIM}/Other_Animations/Torch_Anim.png`,
    x: 0, y: 0, w: 16, h: 32, frames: 8,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },
  // Bunting over a street: eight 32x32 frames of it stirring in the wind.
  bunting: {
    file: `${A}/${ANIM}/Other_Animations/Pole_and_Bunting_1_Anim.png`,
    x: 0, y: 0, w: 32, h: 32, frames: 8, fps: 6,
  },
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

  // --- street furniture ---------------------------------------------------
  // Lamp posts are six styles across by six down, in 16x48 slots; the base is
  // the bottom tile, so only that one blocks and she walks behind the lamp.
  lampPost: {
    file: `${A}/Outdoor decoration/Lanter_Posts.png`, x: 0, y: 0, w: 16, h: 48,
    blocks: { x: 0, y: 2, w: 1, h: 1 },
  },
  lampPostWarm: {
    file: `${A}/Outdoor decoration/Lanter_Posts.png`, x: 0, y: 144, w: 16, h: 48,
    blocks: { x: 0, y: 2, w: 1, h: 1 },
  },
  // A post with a board hanging off it. The board is the right half of the slot.
  signPost: {
    file: `${A}/Outdoor decoration/Signs.png`, x: 0, y: 192, w: 32, h: 48,
    blocks: { x: 0, y: 2, w: 1, h: 1 },
  },
  signPostWood: {
    file: `${A}/Outdoor decoration/Signs.png`, x: 0, y: 384, w: 32, h: 48,
    blocks: { x: 0, y: 2, w: 1, h: 1 },
  },
  bench: {
    file: `${A}/Outdoor decoration/Benches.png`, x: 0, y: 0, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  benchWood: {
    file: `${A}/Outdoor decoration/Benches.png`, x: 32, y: 0, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },

  // --- farmyard -----------------------------------------------------------
  hayBale: {
    file: `${A}/Outdoor decoration/Hay_Bales.png`, x: 16, y: 0, w: 32, h: 16,
    blocks: { x: 0, y: 0, w: 2, h: 1 },
  },
  haySmall: {
    file: `${A}/Outdoor decoration/Hay_Bales.png`, x: 0, y: 0, w: 16, h: 16,
    blocks: { x: 0, y: 0, w: 1, h: 1 },
  },
  barrel: {
    file: `${A}/Outdoor decoration/barrels.png`, x: 0, y: 0, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },
  barrelBlue: {
    file: `${A}/Outdoor decoration/barrels.png`, x: 32, y: 0, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },
  trough: {
    file: `${A}/Outdoor decoration/Water_Troughs.png`, x: 0, y: 0, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  picnicBasket: {
    file: `${A}/Outdoor decoration/Picnic_Basket.png`, x: 0, y: 0, w: 16, h: 16,
  },
  // Twenty-two crops down one sheet, seven stages across. Column five is the
  // ripe one; the band is two tiles tall because the tall ones lean out of it.
  cropLeafy: crop(1),
  cropRound: crop(3),
  cropTall: crop(8),
  cropBushy: crop(12),
  cropRoot: crop(16),

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

/** One of the four market stalls, 48 pixels apart across their sheet. */
function stall(index: number): ImageDef {
  return {
    file: `${A}/Buildings/Buildings/Unique_Buildings/Stalls/Market_Stalls.png`,
    x: index * 48, y: 0, w: 48, h: 48,
    blocks: { x: 0, y: 1, w: 3, h: 2 },
  };
}

/** A horizontal strip of `frames` pictures, each `w` by `h`, starting at 0,0. */
function anim(file: string, w: number, h: number, frames: number, fps?: number): ImageDef {
  return { file, x: 0, y: 0, w, h, frames, ...(fps ? { fps } : {}) };
}

/** One of the ten potted-flower colours: six frames across, colours down. */
function potted(row: number): ImageDef {
  return {
    file: `${A}/${ANIM}/Flower_Animations/Potted/Flowers_1_Potted_Anim.png`,
    x: 0, y: row * TILE, w: TILE, h: TILE, frames: 6, fps: 5,
  };
}

/**
 * A ripe crop. `Crops.png` gives each of its twenty-two crops a 32-pixel band
 * and seven 16-wide stages across it; the ripe stage is the fifth. The whole
 * band is taken rather than its bottom tile, because corn and beans lean up out
 * of theirs — and crops do not block, so she can wade through the vegetables.
 */
function crop(index: number): ImageDef {
  return { file: `${A}/Crops/Crops.png`, x: 5 * TILE, y: index * 32, w: TILE, h: 32 };
}

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
