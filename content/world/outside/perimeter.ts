/**
 * The edge of the world, and the one gap in it.
 *
 * Matt's reference is Stardew Valley, and the principle behind it is his
 * (2026-08-10): **the map boundary must be obstacle-filled.** It has to read as
 * a wall of stuff from a metre away, and there has to be no walkable route to
 * any cell on the map's own border. The band of scattered trees this replaced
 * failed both — single rows of trunks with walkable air between them, and an
 * invisible edge three tiles further out doing the actual stopping.
 *
 * So each edge is now a thing rather than a density:
 *
 *   north   a mountain cliff, with the Secret Cave cut into its face
 *   east    a heavy ranch fence, with a treeline behind it
 *   south   the same fence, the same treeline
 *   west    the wood's own trunks, one in every cell of one column
 *
 * The gap is at the far west, on the Mystic Woods side, where a future prompt
 * will put a way out — today it reads as a path that carries on into the dark
 * and then gets too thick to push through. Closed with undergrowth on purpose:
 * an obvious wall there would say "this is the end of the game", and undergrowth
 * says "not yet". It is the one place `EDGE` is the only thing stopping her, and
 * the build gate is told about it by name rather than being weakened.
 *
 * Nothing in here is filtered against `KEEP_CLEAR` the way an inland scatter is.
 * The boundary is what everything else gets out of the way of, so it is placed
 * by hand and `assertRoadsClear` is what catches a road run into it.
 *
 * **Nothing in this file is choppable, including the stand at the cliff's foot
 * she can walk among.** The rule is the module, not the coordinate: a tree
 * placed by the file whose job is holding the world in stays standing, and a
 * boundary that can be reasoned about tree by tree is a boundary somebody will
 * eventually reason wrongly about. She still gets the shake and the leaves off
 * every one of them — the west wall is the first place she will ever learn that
 * some trees are too big, and it teaches her without a word or a buzzer.
 */

import {
  Cells,
  frame,
  pick,
  rect,
  rng,
  scatter,
  union,
  type Placement,
} from '../../../tools/world/shapes.js';
import {
  BUILDINGS,
  CLIFF_FOOT,
  CLIFF_LIP,
  COLS,
  EDGE_DEPTH,
  FENCE_EAST,
  FENCE_SOUTH,
  ROWS,
  WOOD_WALL,
  WOODS_GAP,
} from './plan.js';
import { cellsOf, KEEP_CLEAR, plantAt } from './roads.js';

const SEED = 90_210;

/**
 * Blocked outright, whatever is drawn on it.
 *
 * The backstop, not the boundary. Every edge below stands inside this frame and
 * does the stopping she can see; this is what is left if one of them ever grows
 * a hole, and what closes the woods gap where a visible wall would say the wrong
 * thing. The build gate runs once with it and once without, so it can never
 * quietly become the only thing holding the world in again.
 */
export const EDGE = frame(COLS, ROWS, EDGE_DEPTH);

/** The window the tree wall leaves open, as a lookup and as a row range. */
const GAP = new Cells(WOODS_GAP);
const GAP_ROWS = {
  from: Math.min(...WOODS_GAP.map(([, y]) => y)),
  to: Math.max(...WOODS_GAP.map(([, y]) => y)),
};

// --- north: the cliff -------------------------------------------------------

/** The three columns the cave mouth is cut into, so the face skips them. */
const CAVE_COLS = new Set(
  Array.from({ length: 3 }, (_, i) => BUILDINGS.cave.x + i),
);

/**
 * The cliff, column by column, all the way across.
 *
 * Four rows of picture: plateau grass above (which is the map's own grass, so
 * nothing draws it), the lip where that grass gives out, two courses of boulder,
 * and the shadow at the foot. The lip and the face are solid; the shadow is the
 * row she walks along with the rock at her shoulder.
 *
 * The cave's three columns get the lip and nothing else. Its own picture is the
 * two courses of boulder with a mine cut through them and a step at the bottom,
 * so it lands exactly where the face and the shadow would have — which is what
 * makes it read as cut *into* the cliff rather than parked in front of it.
 */
export const CLIFF: Placement[] = (() => {
  const out: Placement[] = [];
  for (let x = 0; x < COLS; x++) {
    out.push(plantAt('cliffLip', x, CLIFF_LIP));
    if (CAVE_COLS.has(x)) continue;
    out.push(plantAt('cliffFace', x, CLIFF_LIP + 1));
    out.push({ image: 'cliffShadow', x, y: CLIFF_FOOT });
  }
  return out;
})();

// --- east and south: the fence ----------------------------------------------

/**
 * The fence: down the east side from the cliff's foot, then west along the
 * south to meet the wood.
 *
 * Every tile of it is solid, so the fence has no gaps in the sense that matters.
 * The gaps it does have are the ones between its rails, and those are backed by
 * the treeline behind it — which is the whole reason `BEHIND_FENCE` exists.
 */
export const FENCE: Placement[] = [
  ...Array.from({ length: FENCE_SOUTH - CLIFF_FOOT }, (_, i) =>
    plantAt('fenceUpright', FENCE_EAST, CLIFF_FOOT + i),
  ),
  ...Array.from({ length: FENCE_EAST - WOOD_WALL + 1 }, (_, i) =>
    plantAt('fenceRunning', WOOD_WALL + i, FENCE_SOUTH),
  ),
];

// --- west: the wood is the wall ---------------------------------------------

/**
 * A trunk in every cell of one column, from the cliff's foot to the fence.
 *
 * Not a scatter. A scatter is what the west edge used to be, and at any density
 * a scatter leaves cells empty — which is exactly the walkable air the overlay
 * was showing. Big trees are four tiles of picture around one tile of trunk, so
 * a solid column of them is a canopy she cannot see daylight through standing
 * over a wall she cannot walk through, and the two are the same trees.
 *
 * The window at `WOODS_GAP` is left out, and stays left out.
 */
export const WOOD_WALL_TREES: Placement[] = (() => {
  const random = rng(SEED + 3);
  const trees = ['spruceBig', 'spruceBig2', 'oakBig', 'oakBig2', 'spruceBig', 'birchBig'] as const;
  const out: Placement[] = [];
  for (let y = CLIFF_FOOT; y < FENCE_SOUTH; y++) {
    if (GAP.has(WOOD_WALL, y)) continue;
    out.push(plantAt(pick(random, trees), WOOD_WALL, y));
  }
  return out;
})();

// --- what stands behind all of it -------------------------------------------

/**
 * The depth behind each edge: more wood west of the wall, a treeline east of
 * the fence and south of it, and a thin stand at the cliff's foot.
 *
 * The cliff-foot stand is the only one of the four she can walk among, and it
 * keeps `KEEP_CLEAR` — a spruce in the middle of the mountain path or on a
 * neighbour's doorstep would undo the two things it is there to decorate.
 */
export const BEHIND_FENCE: Placement[] = [
  // East. No spacing at all: the strip behind the fence is three tiles wide and
  // forty long, and spacing a scatter over three tiles is how you get one tree
  // every third row and daylight between them — which is precisely the gap the
  // rails are supposed to have something behind.
  ...scatter({
    region: rect(FENCE_EAST + 1, CLIFF_FOOT, COLS - FENCE_EAST - 1, FENCE_SOUTH - CLIFF_FOOT),
    images: ['spruceBig', 'oakBig2', 'birchBig', 'spruceMed', 'spruceBig2', 'oakMed', 'bushDark'],
    chance: 0.55,
    seed: SEED + 4,
    cellsOf,
  }),
  // South. Anything here is nearer the camera than the fence is, so a big tree
  // leaning over the rails is what a tree behind a fence actually looks like.
  ...scatter({
    region: rect(WOOD_WALL, FENCE_SOUTH + 1, FENCE_EAST - WOOD_WALL + 1, ROWS - FENCE_SOUTH - 1),
    images: ['spruceBig', 'spruceBig2', 'oakBig', 'oakBig2', 'birchBig', 'spruceMed', 'bushDark'],
    chance: 0.5,
    seed: SEED + 5,
    cellsOf,
  }),
];

/**
 * More wood, behind and either side of the wall. Never seen whole.
 *
 * Anchored in the three columns the map's own edge already blocks, but a big
 * tree's trunk is a tile and a half right of where it is anchored, so what this
 * actually thickens is the two columns around the wall — which is the point.
 * The band it skips is wider than the gap for the same reason: a tree anchored
 * two rows above the window drops its trunk *into* it, and the one thing that
 * window may never have in it is something solid.
 */
export const BEHIND_WOOD_WALL: Placement[] = [
  ...treesWestOf(CLIFF_FOOT, GAP_ROWS.from - 4),
  ...treesWestOf(GAP_ROWS.to + 1, FENCE_SOUTH),
];

function treesWestOf(from: number, to: number): Placement[] {
  return scatter({
    region: rect(0, from, WOOD_WALL, to - from),
    images: ['spruceBig', 'spruceBig2', 'oakBig', 'birchBig', 'spruceMed'],
    chance: 0.7,
    spacing: 1,
    seed: SEED + 6 + from,
    cellsOf,
  });
}

/** A thin stand at the cliff's foot, wherever the village has left room for it. */
export const CLIFF_FOOT_TREES: Placement[] = scatter({
  region: rect(WOOD_WALL + 1, CLIFF_FOOT + 1, FENCE_EAST - WOOD_WALL - 1, 3),
  images: ['spruceBig', 'spruceBig2', 'oakBig2', 'spruceMed', 'oakMed', 'bush', 'bushDark'],
  chance: 0.3,
  spacing: 2,
  jitter: 0.4,
  seed: SEED + 7,
  avoid: KEEP_CLEAR,
  cellsOf,
});

/**
 * What closes the gap. Thick, soft and entirely walk-through — the map's own
 * edge is what actually stops her, three tiles further out, and it is the one
 * place in the world that is true of.
 */
export const GAP_UNDERGROWTH = scatter({
  region: union(WOODS_GAP, rect(4, 26, 5, 8)),
  images: [
    // Weighted by repetition: mostly leaves, so it reads as growth closing in
    // rather than as a clearing somebody felled.
    'bush', 'bushDark', 'bushBright', 'bush', 'bushDark', 'bushBright',
    'tallGrass', 'swayGrass', 'swayGrass2', 'swayGrass3', 'tallGrass',
    'sprig', 'sprig2', 'mossyStump',
  ],
  chance: 0.72,
  spacing: 0,
  jitter: 0.4,
  seed: SEED + 1,
});
