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
  // The one outdoor green, and the edge set drawn against it. Every other
  // outdoor tile in this list has to blend into `#3e8948` or it does not
  // belong on the map at all — see OVERLAYS.
  grassMid: { key: 'grassMid', file: `${A}/Tiles/Grass/Grass_1_Middle.png` },
  grassEdge: { key: 'grassEdge', file: `${A}/Tiles/Grass/Grass_Tiles_1.png` },
  // Eight copies of the water block side by side: one sheet, one tileset, and a
  // pond that moves. The still sheet is not loaded at all any more.
  water: { key: 'water', file: `${A}/Tiles/Water/Water_Tile_1_Anim.png` },
  farmland: { key: 'farmland', file: `${A}/Tiles/FarmLand/FarmLand_Tile.png` },
  floor: { key: 'floor', file: `${A}/Buildings/Houses_Interiors/Wood_Floor_Tiles.png` },
  wall: { key: 'wall', file: `${A}/Buildings/Houses_Interiors/Interior_Walls.png` },
  trim: { key: 'trim', file: `${A}/Buildings/Houses_Interiors/Wood_Wall_Fillers.png` },
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
 * A ground variant, drawn on the overlay layer above the ground.
 *
 * **Empty on purpose** (Matt, 2026-08-10, from screenshots). The rule the
 * Outside is held to now: *a tile may sit on or beside the base outdoor grass
 * only if its own background is that base grass.* Base grass is `#3e8948`, the
 * one colour she stands on.
 *
 * The pack ships four grass colours, and the other three are `#33984b`,
 * `#7c963c` and `#3f886c` — measured off `Grass_2/3/4_Middle.png`, and their
 * edge sheets carry the same greens. Laid over the first grass they did not
 * read as a meadow, a dry field and a wood: they read as three hard-edged
 * seams where the ground changed biome, which is exactly what a scalloped
 * border between two different greens looks like from a metre away. So all
 * three came out, and the woods, the farm and the green now read through what
 * grows on them instead.
 *
 * The machinery below stays wired up — the layer, the builder pass and the
 * paint type — because it costs nothing dormant and the moment the pack (or
 * ElevenLabs-era replacement art) ships a variant whose own background *is*
 * `#3e8948`, one entry here brings it back.
 *
 * An overlay is a pair: which flat tile fills the inside, and which 3x5 block
 * draws the ragged border. The border is transparent on its outer side, which
 * is why an overlay cannot share a layer with the ground it blends into.
 */
export interface OverlayDef {
  fill: { tileset: string; col: number; row: number };
  edge: { tileset: string; col: number; row: number };
  /** What the eye should read it as, for anyone reading a layout. */
  reads: string;
}

export const OVERLAYS: Record<string, OverlayDef> = {};

/**
 * Interior floors come in 2x2 patterns, so a floor is addressed by which
 * pattern it is and the cell's parity picks the quarter. Block coordinates are
 * in units of 2 tiles, counting from the top-left of `Wood_Floor_Tiles.png`.
 *
 * One of these per room, which is the rule the reference interior is built to.
 * A second one inside a room is allowed only where it says what a corner is
 * *for* — the checkerboard under a kitchen's working end marks it out the way a
 * wall would, without being a wall she has to walk round.
 */
export const FLOOR_PATTERNS: Record<string, { bx: number; by: number }> = {
  planks: { bx: 1, by: 1 },
  boards: { bx: 0, by: 1 },
  herringbone: { bx: 2, by: 1 },
  parquet: { bx: 0, by: 3 },
  brick: { bx: 1, by: 0 },
  /** Warm criss-crossed boards — the widest-grained of the woods. */
  weave: { bx: 3, by: 1 },
  /** Cool blue tiles. Reads as "a different room" from across the house. */
  tile: { bx: 0, by: 2 },
  /** Blue-grey brick, for a floor that should feel swept rather than scrubbed. */
  slate: { bx: 2, by: 2 },
  /** Black and cream diamonds: the working end of a kitchen. */
  diamond: { bx: 3, by: 2 },
  /** Black and cream squares — the same idea, laid straight. */
  check: { bx: 3, by: 3 },
};

/**
 * A wall face: which column of `Interior_Walls.png` it is cut from.
 *
 * The sheet's bottom three rows are the wall proper, three tiles tall — a lit
 * top edge, a plain middle, a skirting board — and the columns are the
 * materials. Cream plaster is three columns wide because its ends are rounded;
 * the middle one is what tiles, and it is the only one this game uses so far.
 */
export const WALL_FACES: Record<string, { tileset: string; col: number }> = {
  plaster: { tileset: 'wall', col: 1 },
  wood: { tileset: 'wall', col: 3 },
  stone: { tileset: 'wall', col: 4 },
  brick: { tileset: 'wall', col: 5 },
};

/** Which rows of the sheet a face is cut from, top of the wall downwards. */
export const WALL_ROWS = { top: 3, middle: 4, bottom: 5 } as const;

/**
 * The dark wood every room is framed with — the cap above a wall face, and the
 * one-tile beam that runs down its sides and along its foot.
 *
 * This is what the flat cream bands were missing. A room drawn as face alone
 * has no edge: it is a peach rectangle that stops. The reference frames every
 * room in dark timber and hangs the detail on the lighter face inside it, and
 * that frame is most of why its walls read as walls from across the room.
 * `Wood_Wall_Fillers.png` is a seamless tile, so a run of it is a beam however
 * long and whichever way it goes.
 */
export const WALL_TRIM = { tileset: 'trim', col: 0, row: 0 } as const;

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
   *
   * `x` and `y` may be halves, and for anything the pack centred in its own slot
   * they have to be: a big oak's trunk straddles the middle line of a four-tile
   * picture, so no whole tile is under it. `footing.ts` nudges the sprite by that
   * half tile when it puts it down, so the cells still land on the grid.
   *
   * Every one of these is a measurement, not a guess — `npm run world:footings`
   * prints each rectangle against the pixels it claims to describe.
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
  /**
   * Drawn lying on the floor rather than standing on it.
   *
   * Everything in the world sorts by the bottom of its own picture, which is
   * right for anything with a silhouette and wrong for a rug: she would walk
   * onto one and disappear underneath it, because her feet are above its
   * bottom edge. Flat things go below every standing thing and above the tiles,
   * and are never faded as occluders.
   */
  flat?: boolean;
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

  // --- the cliff along the top of the world -------------------------------
  // `Stone_Cliff_1_Tile.png` draws a plateau as one 3-wide block: three rows of
  // grass on top with a rock rim round them, two courses of boulder under that,
  // and a soft shadow at its foot. Only the block's **middle column** is
  // catalogued, because the cliff this world needs runs off both sides of the
  // map and therefore has no ends — and a middle column is the one slice of an
  // autotile block that is guaranteed to repeat sideways for ever.
  //
  // Measured, not guessed: the plateau's own grass is `#3e8948`, which is the
  // one outdoor green she walks on everywhere else, so the top of the cliff and
  // the ground below it are the same colour and only the rock reads as a
  // change of height. See OVERLAYS for why that mattered.
  /** Where the grass on top gives out and the rock starts. Solid. */
  cliffLip: {
    file: `${A}/Tiles/Cliff/Stone_Cliff_1_Tile.png`, x: 32, y: 32, w: 16, h: 16,
    blocks: { x: 0, y: 0, w: 1, h: 1 },
  },
  /** The two courses of boulder, taken together so they cannot seam. Solid. */
  cliffFace: {
    file: `${A}/Tiles/Cliff/Stone_Cliff_1_Tile.png`, x: 32, y: 48, w: 16, h: 32,
    blocks: { x: 0, y: 0, w: 1, h: 2 },
  },
  /**
   * Grass tufts at the cliff's foot and the shadow it throws on the ground.
   * Blocks nothing: this is the row she walks along, right up against the rock.
   */
  cliffShadow: {
    file: `${A}/Tiles/Cliff/Stone_Cliff_1_Tile.png`, x: 32, y: 80, w: 16, h: 16,
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
  // Only the trunk blocks, and only the one tile it actually stands in. The
  // canopy is scenery she walks under, which is most of what makes a wood feel
  // like a wood rather than a maze — and a one-tile trunk leaves two-tile gaps
  // between trees, which is what a four-year-old with a thumbstick can steer
  // through without ever being stuck.
  //
  // Every trunk here is the same shape of measurement, because the pack draws
  // every tree the same way: the trunk centred on the slot's middle line, its
  // foot on the boundary of the slot's bottom tile. So the tile that contains a
  // trunk always starts half a tile in from the slot's centre — `x: 1.5` on a
  // four-tile picture, `x: 0.5` on a two-tile one — and `y` is the trunk's own
  // row, never the row of shadow underneath it. Getting that second part wrong
  // is what had the whole wood blocking bare grass a tile below every tree.
  oakBig: {
    file: `${A}/Trees/Big_Oak_Tree.png`, x: 64, y: 0, w: 64, h: 80,
    blocks: { x: 1.5, y: 3, w: 1, h: 1 },
  },
  // The second slot of each big-tree sheet is the same tree without its shadow,
  // and with the last six pixels of trunk cut off. Same trunk, same tile.
  oakBig2: {
    file: `${A}/Trees/Big_Oak_Tree.png`, x: 128, y: 0, w: 64, h: 80,
    blocks: { x: 1.5, y: 3, w: 1, h: 1 },
  },
  spruceBig: {
    file: `${A}/Trees/Big_Spruce_tree.png`, x: 64, y: 0, w: 64, h: 80,
    blocks: { x: 1.5, y: 3, w: 1, h: 1 },
  },
  spruceBig2: {
    file: `${A}/Trees/Big_Spruce_tree.png`, x: 128, y: 0, w: 64, h: 80,
    blocks: { x: 1.5, y: 3, w: 1, h: 1 },
  },
  birchBig: {
    file: `${A}/Trees/Big_Birch_Tree.png`, x: 32, y: 0, w: 32, h: 80,
    blocks: { x: 0.5, y: 3, w: 1, h: 1 },
  },
  fruitBig: {
    file: `${A}/Trees/Big_Fruit_Tree.png`, x: 32, y: 0, w: 32, h: 64,
    blocks: { x: 0.5, y: 2, w: 1, h: 1 },
  },
  oakMed: {
    file: `${A}/Trees/Medium_Oak_Tree.png`, x: 32, y: 0, w: 32, h: 48,
    blocks: { x: 0.5, y: 1, w: 1, h: 1 },
  },
  spruceMed: {
    file: `${A}/Trees/Medium_Spruce_Tree.png`, x: 32, y: 0, w: 32, h: 48,
    blocks: { x: 0.5, y: 1, w: 1, h: 1 },
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
  // The heavy ranch fence, for the two edges of the world that are fenced off
  // rather than grown over. `Fence_Big.png` is a 4x4 sheet: its first column is
  // the run going away from the camera, and the three beside it are a run going
  // across — of which only the **middle** one carries both its rail stubs, so
  // that is the one that tiles. A post every tile is the pack's own spacing and
  // the reason this reads as a fence rather than as a line.
  fenceRunning: {
    file: `${A}/Outdoor decoration/Fence_Big.png`, x: 32, y: 16, w: 16, h: 16,
    blocks: { x: 0, y: 0, w: 1, h: 1 },
  },
  fenceUpright: {
    file: `${A}/Outdoor decoration/Fence_Big.png`, x: 0, y: 16, w: 16, h: 16,
    blocks: { x: 0, y: 0, w: 1, h: 1 },
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
  // A board with a post holding it up. The post is the *right* half of the slot
  // and the board hangs off to its left, which the footprint used to have the
  // wrong way round: the post was walk-through and the empty air beside it was
  // solid.
  signPost: {
    file: `${A}/Outdoor decoration/Signs.png`, x: 0, y: 192, w: 32, h: 48,
    blocks: { x: 1, y: 2, w: 1, h: 1 },
  },
  signPostWood: {
    file: `${A}/Outdoor decoration/Signs.png`, x: 0, y: 384, w: 32, h: 48,
    blocks: { x: 1, y: 2, w: 1, h: 1 },
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
  // One tile wide, not two. The old rectangle ran a tile past the end of the
  // upright trough and took in the left edge of the long one standing beside it
  // — so the farmyard had a trough with a slice of a second trough floating next
  // to it, and a footprint two tiles wide under a thing one tile wide.
  trough: {
    file: `${A}/Outdoor decoration/Water_Troughs.png`, x: 0, y: 0, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
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

  // --- interior: what hangs on a wall -------------------------------------
  // Everything in this group is drawn on a wall face and blocks nothing: the
  // face tile underneath is already solid, and a window she could walk into
  // would be a wall with a hole in it.
  //
  // `windows.png` is four light conditions 32 px apart, and within each: three
  // single-pane windows a tile wide, then a two-tile one. The art sits six
  // pixels down its slot, which is what lands it in the middle of a two-tile
  // wall face rather than jammed under the beam.
  window: window_(2),
  windowWide: { ...window_(2), x: 48, w: 32 },
  windowDusk: window_(0),
  /** A framed landscape, one tile. The only picture in the pack. */
  picture: {
    file: `${A}/Buildings/House_Decor/Indoor_Decor.png`, x: 48, y: 32, w: 16, h: 16,
  },
  /** Ten wall clocks across two rows of `Clocks.png`; this is the red one. */
  clock: { file: `${A}/Buildings/House_Decor/Clocks.png`, x: 32, y: 0, w: 16, h: 16 },
  /** A rail of pans over a counter, and a pair of hung utensils beside it. */
  potRack: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 64, y: 72, w: 32, h: 20,
  },
  utensils: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 96, y: 72, w: 16, h: 16,
  },
  /** The extractor hood. Hangs above the stove and stands on nothing. */
  hood: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 96, y: 0, w: 16, h: 32,
  },
  /** A shelf with nothing on it, for a wall that wants a line rather than a thing. */
  shelf: {
    file: `${A}/Buildings/House_Decor/BookShelves.png`, x: 144, y: 0, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },

  // --- interior: the kitchen ----------------------------------------------
  // `Kitchen.png` is a construction kit 65 tiles wide: a run of counters is
  // meant to be assembled a unit at a time. Only its one-tile base units are
  // catalogued — worktop over a drawer front, 16 by 20, on a 32-pixel pitch,
  // four to each of eight wood finishes. The rest of that sheet is corner and
  // wall-cupboard pieces this house has no use for yet.
  counter: counter_(5),
  counterDrawers: counter_(6),
  stove: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 0, y: 0, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },
  sink: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 0, y: 32, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },
  // One tile wide, not two: the old rectangle took in the fridge beside it as
  // well, which is why the kitchen had a double-doored monolith in it.
  fridge: {
    file: `${A}/Buildings/House_Decor/Kitchen_Furniture.png`, x: 16, y: 64, w: 16, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  },

  // --- interior: tables and seating ---------------------------------------
  // `Tables.png` is fourteen finishes 64 px apart, six tables across each: a
  // four-tile one, a three-tile one and a square, then the same three again.
  // The cloths start at band three, and a laid table is the centre of a room in
  // a way a bare one is not.
  tableWide: table_(0),
  tableCloth: table_(3),
  tableSmall: { ...table_(0), x: 64, w: 48, blocks: { x: 0, y: 1, w: 3, h: 2 } },
  tableSquare: {
    file: `${A}/Buildings/House_Decor/Tables.png`, x: 112, y: 0, w: 48, h: 64,
    blocks: { x: 0, y: 2, w: 3, h: 2 },
  },
  // Chairs: four bands of dining chairs, three finishes across each band, four
  // facings to a finish. A table with a chair on each side is the arrangement;
  // one chair pulled up to it is a table nobody sits at.
  chairLeft: chair_(0),
  chairUp: chair_(1),
  chairDown: chair_(2),
  chairRight: chair_(3),
  // Below the dining chairs the same sheet runs ten bands of soft furniture,
  // 32 px apart: armchair in four facings, two sofas, then stools. Green is
  // band four of those, counting from `SOFT`.
  armchairLeft: soft_(0),
  armchairUp: soft_(1),
  armchairDown: soft_(2),
  armchairRight: soft_(3),
  sofa: { ...soft_(5), w: 32, blocks: { x: 0, y: 1, w: 2, h: 1 } },
  sofaBack: { ...soft_(7), w: 32, blocks: { x: 0, y: 1, w: 2, h: 1 } },
  stool: { ...soft_(10) },

  // --- interior: the big pieces -------------------------------------------
  // Beds come six colours deep at 32 pixel intervals; pink is Seraphina's.
  bed: {
    file: `${A}/Buildings/House_Decor/Beds.png`, x: 0, y: 96, w: 32, h: 32,
    blocks: { x: 0, y: 0, w: 2, h: 2 },
  },
  bedTeal: {
    file: `${A}/Buildings/House_Decor/Beds.png`, x: 0, y: 32, w: 32, h: 32,
    blocks: { x: 0, y: 0, w: 2, h: 2 },
  },
  /** The single beside it, a tile wide, out of the same band. */
  bedSingle: {
    file: `${A}/Buildings/House_Decor/Beds.png`, x: 32, y: 32, w: 16, h: 32,
    blocks: { x: 0, y: 0, w: 1, h: 2 },
  },
  wardrobe: {
    file: `${A}/Buildings/House_Decor/Furniture_Other.png`, x: 0, y: 80, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  /** A sideboard with a stone top: the run along the top of `Furniture_Other`. */
  dresser: {
    file: `${A}/Buildings/House_Decor/Furniture_Other.png`, x: 0, y: 16, w: 32, h: 32,
    blocks: { x: 0, y: 1, w: 2, h: 1 },
  },
  /** A bedside cabinet, one tile. The whole top row of that sheet is these. */
  nightstand: {
    file: `${A}/Buildings/House_Decor/Furniture_Other.png`, x: 0, y: 0, w: 16, h: 16,
    blocks: { x: 0, y: 0, w: 1, h: 1 },
  },
  piano: {
    file: `${A}/Buildings/House_Decor/Furniture_Other.png`, x: 0, y: 318, w: 32, h: 34,
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
  /** The brick one. Warmer than the grey, which matters in a room with a rug. */
  fireplaceBrick: {
    file: `${A}/Buildings/House_Decor/Fireplaces.png`, x: 32, y: 0, w: 32, h: 48,
    blocks: { x: 0, y: 2, w: 2, h: 1 },
  },
  /** A little iron stove with its flue running up the wall. */
  stovePipe: {
    file: `${A}/Buildings/House_Decor/Fireplaces.png`, x: 64, y: 0, w: 16, h: 48,
    blocks: { x: 0, y: 2, w: 1, h: 1 },
  },

  // --- interior: lamps, plants and small things ---------------------------
  // Ten shade colours across `Standing_Lamps.png`, nine base styles down it.
  lamp: { file: `${A}/Buildings/House_Decor/Standing_Lamps.png`, x: 0, y: 0, w: 16, h: 32 },
  lampBlue: { file: `${A}/Buildings/House_Decor/Standing_Lamps.png`, x: 32, y: 0, w: 16, h: 32 },
  lampGreen: { file: `${A}/Buildings/House_Decor/Standing_Lamps.png`, x: 64, y: 0, w: 16, h: 32 },
  // House plants: twenty pot styles 32 px apart, and across each row four
  // leafy plants, four flowering ones and a two-tile monstera.
  plantLeafy: plant_(2, 0),
  plantTall: plant_(1, 0),
  plantFlowers: plant_(4, 0),
  plantBlue: plant_(7, 0),
  // The monstera is two tiles wide with its pot under the right-hand one, so it
  // blocks that tile and not the leaves hanging over the left.
  plantBig: { ...plant_(8, 0), w: 32, blocks: { x: 1, y: 1, w: 1, h: 1 } },
  plantBigWhite: { ...plant_(8, 4), w: 32, blocks: { x: 1, y: 1, w: 1, h: 1 } },
  // Small things left on the floor, one tile each, off `Placeable_Decoration`.
  // Only ever on the floor: everything in the world sorts by the bottom of its
  // own picture, so a jar put on a table would be drawn behind the table.
  book: decorIn(5, 3),
  cushion: decorIn(5, 4),
  /** A mushroom stool. The one piece of furniture in the house that is a joke. */
  toadstoolSeat: {
    file: `${A}/Buildings/House_Decor/Indoor_Decor.png`, x: 80, y: 48, w: 16, h: 16,
  },

  // --- interior: rugs ------------------------------------------------------
  // Carpets come in eight colour bands 80 px apart: four three-tile squares
  // along the top of a band, rounds and runners along the bottom. All flat —
  // she walks over a rug, not behind it.
  rug: carpet_(3),
  rugBlue: { ...carpet_(1), x: 96 },
  rugGreen: carpet_(2),
  rugRed: carpet_(5),
  rugYellow: carpet_(4),
  rugRound: { ...carpet_(0), y: 48, w: 32, h: 32 },
  door: { file: `${A}/Buildings/House_Decor/Doors.png`, x: 0, y: 0, w: 16, h: 32 },
};

/** One of the four light conditions in `windows.png`, 32 pixels apart. */
function window_(band: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/windows.png`,
    x: 0, y: band * 32, w: TILE, h: 32,
  };
}

/** One base unit of the counter kit: unit `n` along, on a 32-pixel pitch. */
function counter_(n: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/Kitchen.png`,
    x: 16 + n * 32, y: 156, w: TILE, h: 20,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  };
}

/** The four-tile table of finish `band`, out of the fourteen on the sheet. */
function table_(band: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/Tables.png`,
    x: 0, y: band * 64 + 16, w: 64, h: 48,
    blocks: { x: 0, y: 1, w: 4, h: 2 },
  };
}

/** Facing `n` of the first dining-chair finish: left, back, front, right. */
function chair_(n: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/Chairs.png`,
    x: n * TILE, y: 0, w: TILE, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  };
}

/**
 * Slot `n` of one soft-furniture band: armchair in four facings, then sofas at
 * five and seven, then stools from ten. Green, because the reference's sitting
 * room is green furniture on a red rug and that pairing is most of its warmth.
 */
function soft_(n: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/Chairs.png`,
    // Four bands of dining chairs first, then two bands per soft colour: cream,
    // blue, green. Row 256 is the first of the two green ones.
    x: n * TILE, y: 256, w: TILE, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  };
}

/** Column `col` of pot-style `row` on the house-plant sheet. */
function plant_(col: number, row: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/House_Plants.png`,
    x: col * TILE, y: row * 32, w: TILE, h: 32,
    blocks: { x: 0, y: 1, w: 1, h: 1 },
  };
}

/** One 16x16 cell of `Placeable_Decoration.png`. */
function decorIn(col: number, row: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/Placeable_Decoration.png`,
    x: col * TILE, y: row * TILE, w: TILE, h: TILE,
  };
}

/** The first three-tile square rug of colour band `band`. */
function carpet_(band: number): ImageDef {
  return {
    file: `${A}/Buildings/House_Decor/Carpets.png`,
    x: 0, y: band * 80, w: 48, h: 48,
    flat: true,
  };
}

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
