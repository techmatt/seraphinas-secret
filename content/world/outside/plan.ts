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
 *      0  3          21              51        68   72
 *    1 +===== the mountain cliff, cave cut into it ==+
 *    5 | T W  |  joey   scar   |     shed          F |
 *   14 | R O  | ===== the top road ================ E |
 *   22 | E O  |  Seraphina's   |     the vegetable N |
 *   29 | E D  |  house (in)    |     patches       C |
 *   32 | | S = the main road, west into the woods = E |
 *   38 | gap  |  green   pond  |     orchard         |
 *   46 +---------------- the south fence ------------+
 */

import { rect, union, type Cell, type RoadSpec } from '../../../tools/world/shapes.js';

export const COLS = 72;
export const ROWS = 50;

/** Pixels per tile, for turning a measured sprite offset into a door position. */
export const T = 16;

// --- the boundary -----------------------------------------------------------

/**
 * Matt's principle (2026-08-10), and Stardew's: **the map boundary must be
 * obstacle-filled.** It has to read as a wall of stuff, and there must be no
 * walkable route to any cell on the map's own border. A single row of trees
 * with air between the trunks fails both halves — she walks up to it, sees a
 * way through, and is stopped by nothing at all.
 *
 * So each edge is a thing rather than a band: a mountain cliff along the top
 * with the cave mouth cut into it, a fence down the east and along the south,
 * and the wood's own trunks down the west. `tools/world/build.ts` flood-fills
 * from the spawn and fails the build if any of it leaks — twice, once with the
 * invisible `EDGE` and once without it, so "a wall of stuff" is checkable and
 * not just a thing this comment claims.
 */

/** Tiles of blocked edge all the way round. The backstop behind everything else. */
export const EDGE_DEPTH = 3;

/**
 * The north cliff, row by row: the grass gives out at `CLIFF_LIP`, two courses
 * of boulder stand under it, and `CLIFF_FOOT` is the shadowed row at its base —
 * the first row she can walk on, and the row the cave mouth's own step is in.
 */
export const CLIFF_LIP = 1;
export const CLIFF_FOOT = 4;

/** The fenced edges: the column the east fence stands in, and the south's row. */
export const FENCE_EAST = 68;
export const FENCE_SOUTH = 46;

/** The column of trunks that is the west wall. Everything west of it is backing. */
export const WOOD_WALL = 3;

/**
 * Every cell the boundary owns.
 *
 * Nothing inland may be planted in here: a self-sown oak standing in front of
 * the fence is the thing that turns a boundary back into a suggestion, and a
 * tuft of grass drawn over a cliff face is worse. The boundary's own modules
 * place into it by hand and are not filtered.
 */
export const BOUNDARY: Cell[] = union(
  rect(0, 0, COLS, CLIFF_FOOT + 1),
  rect(FENCE_EAST, 0, COLS - FENCE_EAST, ROWS),
  rect(0, FENCE_SOUTH, COLS, ROWS - FENCE_SOUTH),
  rect(0, 0, WOOD_WALL + 1, ROWS),
);

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
 *
 * This is the one place in the world where `EDGE` is the only thing stopping
 * her, and it is deliberate: an obvious wall here would say "this is the end of
 * the game", and undergrowth says "not yet". The build gate is told about it by
 * name — see `sealed.soft` in `index.ts` — rather than being quietly weakened.
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
  // The cave used to be at the end of these two. It is in the north cliff now,
  // and what they lead to is the clearing somebody camps in — which is still
  // worth walking to, and still where the campfire is.
  clearingSpur: { name: 'the spur down to the clearing', points: [[10, 33], [10, 41]], width: 3 },
  clearingStub: { name: 'the last few steps into the clearing', points: [[6, 41], [10, 41]], width: 3 },
  /**
   * Up to the cave. Stardew's mine is somewhere you climb to out of town rather
   * than something you find behind a house.
   *
   * It used to run dead straight from the woods trail at (10, 29) to the cliff —
   * and a road she can see the whole length of is how a four-year-old finds
   * anything, so that was the right instinct and the wrong line. Twenty-five
   * tiles up the middle of an eighteen-tile-wide wood is not a path through a
   * wood, it is two woods with a road between them.
   *
   * It leaves the *top* road's west end now, clips the wood's northern corner
   * and runs west along the foot of the cliff to the cave mouth: sixteen tiles
   * instead of twenty-five, none of them below row 14, so the wood is one
   * unbroken mass from the cliff all the way down to the trail. It also joins
   * something. The old line stopped one tile short of this road without meeting
   * it, which is a thing that reads as a mistake from any distance.
   *
   * What she loses is seeing the cave from the bottom of the wood. What she
   * keeps is the half that does the work: the road she already walks to knock on
   * her neighbours' doors carries on west and has no branches on it, so every
   * turn left on it is the only way it goes.
   */
  mountainPath: {
    name: 'the mountain path, up to the cave',
    points: [[22, 14], [18, 14], [18, 6], [10, 6], [10, CLIFF_FOOT]],
    width: 3,
  },
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
  /**
   * The Secret Cave, cut into the north cliff where the mountain path comes out
   * of the wood. Three tiles wide and two tall, standing on exactly the two
   * courses of boulder the cliff face is made of — so the mine replaces the
   * rock rather than being propped in front of it, and the lip above it carries
   * straight on over the top.
   */
  cave: {
    image: 'caveMouth',
    x: 9,
    y: CLIFF_LIP + 1,
    door: { x: 10.5, y: CLIFF_FOOT + 0.6 },
  },
} satisfies Record<string, BuildingPlan>;

/**
 * The clearing the cave used to be at the end of.
 *
 * It stays a clearing: somebody has been camping in the wood, and the fire, the
 * log and the chest are the one arranged thing in the whole of it. Written down
 * separately from `BUILDINGS.cave` now, because the two used to be the same
 * anchor and the cave has moved half the map away.
 */
export const CLEARING = { x: 6, y: 38 } as const;

/**
 * The neighbours: knocked on, never opened.
 *
 * The cave used to be one of these. It opens now — it is the second enterable
 * place in the world — so its picture is placed with the cliff it is cut into
 * (see `perimeter.ts`) and what she presses is a doorway rather than a prop.
 */
export const FACADES: { id: string; plan: BuildingPlan }[] = [
  { id: 'joey_door', plan: BUILDINGS.joey },
  { id: 'scar_door', plan: BUILDINGS.scar },
  { id: 'shed_door', plan: BUILDINGS.shed },
  { id: 'hall_door', plan: BUILDINGS.hall },
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
  // The mine, at the top of the mountain path. Two rows below its own step, so
  // the picture is of the cliff with the cave in it and not of her hat.
  { id: 'cave', x: 10, y: CLIFF_FOOT + 2 },
  // The same cliff where nothing is cut into it — the boundary on its own.
  { id: 'cliff', x: 26, y: CLIFF_FOOT + 2 },
  { id: 'woods', x: 14, y: 22 },
  // Where the trail runs out of map. The tree line stops, the undergrowth
  // thickens, and one day there will be somewhere through it.
  { id: 'woods_gap', x: 7, y: 29 },
  /** The campsite the cave left behind when it moved into the cliff. */
  { id: 'clearing', x: 9, y: 42 },
  // The two fenced edges, photographed from just inside them.
  { id: 'fence_east', x: FENCE_EAST - 2, y: 26 },
  { id: 'fence_south', x: 40, y: FENCE_SOUTH - 2 },
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
  /**
   * Back out of the cave, onto the step at the top of the mountain path. A row
   * below the mouth's own trigger, so she is standing clear of the door she has
   * just come out of rather than being bounced straight back in.
   */
  from_cave: { x: BUILDINGS.cave.door.x, y: CLIFF_FOOT + 1.6, facing: 'down' },
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
  // The campsite clearing, which is dressed by hand and must stay open.
  ...rect(5, 38, 9, 5),
  // Room round the toadstool in the wood, so a spruce cannot land on top of it.
  ...rect(14, 20, 3, 3),
  // The step outside the cave mouth, at the top of the mountain path.
  ...rect(BUILDINGS.cave.x - 1, CLIFF_FOOT, 5, 2),
];
