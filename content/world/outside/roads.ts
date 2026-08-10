/**
 * The streets, and the ground nobody may plant on.
 *
 * Roads are written as polylines with a width in `plan.ts`; this turns them
 * into cells and works out the keep-clear set every other module scatters
 * against. Both live here rather than in the plan because both are derived —
 * change a waypoint and the verges, the margins and the tree-free strip all
 * move with it, which is the whole point of the arrangement.
 */

import { IMAGES } from '../../../tools/world/catalog.js';
import {
  Cells,
  disc,
  grow,
  rect,
  roadCells,
  smooth,
  type Cell,
  type Placement,
} from '../../../tools/world/shapes.js';
import { APRONS, BUILDINGS, GREEN, POND, ROADS, T } from './plan.js';

/** What part of a catalog image is solid, for a scatter to keep off roads. */
export const blocksOf = (image: string) => IMAGES[image]?.blocks;

/** Every tile a sprite's picture covers, so nothing gets planted through a roof. */
export function coverage(placements: Placement[], pad = 0): Cell[] {
  const out: Cell[] = [];
  for (const p of placements) {
    const def = IMAGES[p.image];
    if (!def) throw new Error(`layout: no catalog image "${p.image}"`);
    out.push(
      ...rect(
        Math.floor(p.x) - pad,
        Math.floor(p.y) - pad,
        Math.ceil(def.w / T) + pad * 2,
        Math.ceil(def.h / T) + pad * 2,
      ),
    );
  }
  return out;
}

export const ROAD_SPECS = Object.values(ROADS);

export const ROAD_CELLS = roadCells(ROAD_SPECS);

export const POND_CELLS = smooth(disc(POND.x, POND.y, POND.r));

/** Every building's footprint, with a tile of breathing room round it. */
const FOOTPRINTS = coverage(
  Object.values(BUILDINGS).map(({ image, x, y }) => ({ image, x, y })),
  1,
);

/**
 * Nothing may be planted on a road, in the pond, or on top of a building. The
 * roads get a tile of margin as well, so a trunk cannot narrow one to a gap she
 * has to be aimed through — and the green is kept clear of scatter entirely,
 * because an open lawn is a thing you have to decide to have.
 */
export const KEEP_CLEAR = new Cells([
  ...grow(ROAD_CELLS, 1),
  ...POND_CELLS,
  ...FOOTPRINTS,
  ...APRONS,
  ...GREEN,
]);

/**
 * Drop anything whose solid part would land on a road or a building.
 *
 * For sets laid out by rule rather than by hand — an orchard planted on a grid,
 * say — where the right answer to "this row runs into the lane" is to leave a
 * gap, not to fail the build. Hand-placed props deliberately do *not* go
 * through here: `assertRoadsClear` fails the build for those, because a lamp
 * post someone typed into the middle of a street is a mistake, not a gap.
 */
export function clearOfRoads(placements: Placement[]): Placement[] {
  return placements.filter(({ image, x, y }) => {
    const solid = blocksOf(image);
    if (!solid) return true;
    return !rect(Math.round(x) + solid.x, Math.round(y) + solid.y, solid.w, solid.h).some(
      ([cx, cy]) => KEEP_CLEAR.has(cx, cy),
    );
  });
}
