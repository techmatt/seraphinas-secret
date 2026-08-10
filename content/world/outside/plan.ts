/**
 * The town plan: how big the Outside is, where its regions are, where the
 * streets run and where each building stands.
 *
 * Nothing here draws anything. It is the one file every other module in this
 * folder is allowed to import, which is what keeps them from importing each
 * other — the village needs to know where the roads are so it can dress their
 * edges, the perimeter needs to know where the gap goes, and the farm needs to
 * know where its own quarter ends. All of that is a coordinate, and all of the
 * coordinates are here.
 *
 * Moving Joey's house two tiles left is still a two-character edit — it is just
 * this file rather than a thousand-line one.
 *
 *      0    3        21              51        69   72
 *    0 +------------- tree line all the way round ---+
 *    5 |      |  joey   scar   |     shed            |
 *   14 |  M   | ===== the top road ================= |
 *   22 |  y   |  Seraphina's   |     the vegetable   |
 *   29 |  s   |  house (in)    |     patches         |
 *   32 |  t = the main road, west into the woods === |
 *   38 | cave |  green   pond  |     orchard         |
 *   47 +--------------------------------------------+
 */

import { rect, union, type Cell, type RoadSpec } from '../../../tools/world/shapes.js';

export const COLS = 72;
export const ROWS = 50;

/** Pixels per tile, for turning a measured sprite offset into a door position. */
export const T = 16;

// --- the bands the map is cut into ------------------------------------------

/** Tiles of blocked edge all the way round. The world stops here. */
export const EDGE_DEPTH = 3;

/** How deep the tree line is planted. Deeper than the block, so it reads as wood. */
export const TREE_BAND = 5;

/** The Mystic Woods: everything west of the village. */
export const WOODS = rect(3, 3, 18, 44);

/** The village: houses, streets, the green, the pond. */
export const VILLAGE = rect(21, 3, 30, 44);

/** The farm and garden quarter: a fifth of the map's tiles, all of it east. */
export const FARM = rect(51, 3, 18, 44);

/**
 * The same two regions, run out to the edges of the map.
 *
 * Only for the grass underfoot. A colour change that stops three tiles short of
 * the map edge draws a straight line down the world where the tree line happens
 * to be thin; run to the edge, the only boundary left to see is the one that
 * means something — where the wood becomes the village, and the village the
 * farm.
 */
export const WOODS_FLOOR = rect(0, 0, 21, ROWS);
export const FARM_FLOOR = rect(51, 0, COLS - 51, ROWS);

/** The open lawn in the south of the village. Kept clear on purpose. */
export const GREEN = rect(27, 35, 10, 8);

/** The allotment strip between the woods and the west lane. */
export const ALLOTMENT = rect(21, 16, 4, 15);

/**
 * Where the woods thin out and a future path leads on. Not walkable today.
 *
 * The window starts two columns in, not at the map edge: the outermost trees
 * stay, so what she sees down the trail is more forest with its undergrowth
 * grown over — rather than open ground with an invisible wall across it.
 */
export const WOODS_GAP = rect(2, 27, 4, 6);

// --- streets ----------------------------------------------------------------

/**
 * Every road, as a polyline and a width. Three tiles is the narrowest that
 * still draws as a road rather than a ribbon — the autotile spends its outer
 * tiles on the grassy verge — and the main road is four, because it is the one
 * she is meant to find from anywhere.
 */
export const ROADS: Record<string, RoadSpec> = {
  top: { name: 'the top road, past the neighbours’ doors', points: [[22, 14], [66, 14]], width: 3 },
  main: { name: 'the main road, west into the woods', points: [[21, 32], [66, 32]], width: 4 },
  trail: {
    name: 'the woods trail, out to where the trees open',
    points: [[21, 32], [10, 32], [10, 29], [3, 29]],
    width: 3,
  },
  westLane: { name: 'the west lane', points: [[26, 14], [26, 32]], width: 3 },
  eastLane: { name: 'the east lane', points: [[46, 14], [46, 32]], width: 3 },
  farmLane: { name: 'the farm lane', points: [[58, 14], [58, 44]], width: 3 },
  greenPath: { name: 'the path down to the green', points: [[24, 32], [24, 43]], width: 3 },
  pondPath: { name: 'the path along to the pond', points: [[24, 43], [38, 43]], width: 3 },
  caveSpur: { name: 'the spur down to the cave', points: [[10, 33], [10, 41]], width: 3 },
  caveStub: { name: 'the last few steps to the cave mouth', points: [[6, 41], [10, 41]], width: 3 },
};

// --- water and ploughed ground ----------------------------------------------

export const POND = { x: 43, y: 40, r: 5 } as const;

/** The two vegetable patches, one either side of the farm lane. */
export const PATCH_EAST = rect(61, 17, 7, 7);
export const PATCH_WEST = rect(52, 20, 4, 8);
export const PATCHES = union(PATCH_EAST, PATCH_WEST);

// --- buildings --------------------------------------------------------------

/**
 * Where each building stands, and where its drawn door is.
 *
 * `door` is a measurement off the pack's own art — the arch is thirty-nine
 * pixels in from the left edge of Seraphina's house and forty from Joey's — so
 * the green dot appears over the door rather than the middle of the roof.
 */
export interface BuildingPlan {
  image: string;
  /** Top-left of the sprite, in tiles. */
  x: number;
  y: number;
  /** Where she stands to knock, in tiles. */
  door: { x: number; y: number };
}

export const BUILDINGS = {
  /** The one enterable building. Its door is a doorway, not a knock. */
  house: { image: 'house', x: 30, y: 22, door: { x: 30 + 39 / T, y: 29 } },
  /** Next door to hers, so the main road has two fronts on it, not one. */
  hall: { image: 'villageHall', x: 36, y: 22, door: { x: 36 + 32 / T, y: 29 } },
  joey: { image: 'joeyHouse', x: 30, y: 6, door: { x: 30 + 40 / T, y: 11 } },
  scar: { image: 'scarHouse', x: 39, y: 5, door: { x: 39 + 36 / T, y: 11 } },
  shed: { image: 'shed', x: 52, y: 5, door: { x: 52 + 39 / T, y: 11 } },
  cave: { image: 'caveMouth', x: 6, y: 38, door: { x: 7.5, y: 40 } },
} satisfies Record<string, BuildingPlan>;

/** The neighbours and the cave: knocked on, never opened. */
export const FACADES: { id: string; plan: BuildingPlan }[] = [
  { id: 'joey_door', plan: BUILDINGS.joey },
  { id: 'scar_door', plan: BUILDINGS.scar },
  { id: 'shed_door', plan: BUILDINGS.shed },
  { id: 'hall_door', plan: BUILDINGS.hall },
  { id: 'cave_mouth', plan: BUILDINGS.cave },
];

// --- where a screenshot is taken from ---------------------------------------

/**
 * The camera centres on her, so a landmark standing exactly on a building
 * photographs its roof. These all sit a little in front of what they name.
 */
export const LANDMARKS: { id: string; x: number; y: number }[] = [
  { id: 'house_front', x: 33, y: 32 },
  // Right up against the neighbours' doorsteps: the camera centres on her, so a
  // landmark out on the road photographs the road and the eaves above it.
  { id: 'facades', x: 35, y: 12 },
  { id: 'square', x: 35, y: 21 },
  { id: 'green', x: 31, y: 41 },
  { id: 'shed', x: 56, y: 12 },
  { id: 'farm', x: 58, y: 22 },
  { id: 'pond', x: 36, y: 43 },
  { id: 'cave', x: 9, y: 42 },
  { id: 'woods', x: 14, y: 22 },
  // Where the trail runs out of map. The tree line stops, the undergrowth
  // thickens, and one day there will be somewhere through it.
  { id: 'woods_gap', x: 7, y: 29 },
];

/**
 * Her front step, and where the house puts her back down.
 *
 * A little way into the road rather than exactly on its top line: her collision
 * box is a fifth of a tile tall and sits at her feet, so standing precisely on
 * a tile boundary puts her *body* in the row above — and that row is the one
 * with the lamp posts in it. Near enough the door that the green dot is already
 * showing when the title screen lets go of her, which is how a four-year-old
 * finds out what the green button is for.
 */
export const SPAWNS = {
  start: { x: 32.8, y: 31.6, facing: 'down' },
  from_house: { x: 32.8, y: 31.6, facing: 'down' },
} as const;

/** Standing room she must have, whatever else a module wants to plant. */
export const APRONS: Cell[] = [
  // Room to stand outside her own front door and read the green dot.
  ...rect(30, 29, 7, 3),
  // And outside the hall's, which is the same street.
  ...rect(36, 29, 10, 3),
  // The market square between the top road and the two fronts. Nothing may be
  // scattered into it: the stalls, the benches and the bunting were arranged,
  // and a self-sown oak growing through an awning undoes the arrangement.
  ...rect(28, 16, 16, 5),
  // The allotment strip, for the same reason.
  ...ALLOTMENT,
  // The step at each neighbour's door.
  ...rect(30, 11, 8, 2),
  ...rect(39, 11, 7, 2),
  ...rect(52, 11, 7, 2),
  // The clearing outside the cave, which is dressed by hand and must stay open.
  ...rect(5, 38, 9, 5),
  // Room round the toadstool in the wood, so a spruce cannot land on top of it.
  ...rect(14, 20, 3, 3),
];
