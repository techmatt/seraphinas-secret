/**
 * The farm and garden quarter — the eastern fifth of the map.
 *
 * Matt's aesthetic note (2026-08-10): *a small village with a garden+farm, not
 * a farm with some sheds.* So the farm is one corner of the world with a fence
 * round it and a lane down the middle, and everything that says "farm" — the
 * ploughed patches, the scarecrow, the bales, the orchard — lives inside it and
 * nowhere else. Walk west and you are in a village; the change is meant to be
 * something she can see happen.
 */

import { ragged, scatter, type Placement } from '../../../tools/world/shapes.js';
import { BUILDINGS, FARM, FARM_FLOOR } from './plan.js';
import { blocksOf, clearOfRoads, KEEP_CLEAR, overlayable } from './roads.js';
import {
  cropRows,
  farmyardCorner,
  fencedPatch,
  flowerPotsAtDoor,
  hedgeAlong,
  lamps,
} from './prefabs.js';

const SEED = 31_337;

/** Sun-bleached grass over the whole quarter, so the farm reads warmer. */
export const FARM_GRASS = ragged(overlayable(FARM_FLOOR), SEED + 5);

export const PATCH_DRESSING: Placement[] = [
  ...fencedPatch(61, 17, 6, 7),
  ...cropRows(61, 17, 7, 7, 41),
  ...fencedPatch(52, 20, 3, 8),
  ...cropRows(52, 20, 4, 8, 42),
  { image: 'scarecrow', x: 64, y: 25.4 },
  { image: 'scarecrow', x: 53, y: 29.4 },
  // The silo and the grain store, so the quarter reads as a working farm from
  // the lane rather than as a garden that happens to be fenced.
  { image: 'silo', x: 54, y: 24 },
  ...farmyardCorner(61, 29),
];

/** Dad's shed, dressed as a working yard rather than a house. */
export const YARD: Placement[] = [
  ...flowerPotsAtDoor(BUILDINGS.shed.door.x, BUILDINGS.shed.door.y + 0.5, 43),
  ...farmyardCorner(60, 12),
  ...farmyardCorner(52, 18),
  { image: 'trough', x: 55.4, y: 16.6 },
  ...hedgeAlong(52, 12.4, 2, 'x', 44),
  ...lamps([[56, 18], [60, 30], [56, 42]], true),
];

/**
 * The orchard: fruit trees on a staggered grid down the south of the quarter.
 * Planted by rule and then filtered, so the row that runs into the farm lane
 * simply has a gap in it rather than a tree standing in the road.
 */
export const ORCHARD: Placement[] = [
  ...clearOfRoads(
    Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => ({
        image: col % 2 ? 'fruitBig' : 'oakMed',
        x: 52 + col * 3.5 + (row % 2) * 1.5,
        y: 35 + row * 3,
      })),
    ).flat(),
  ),
  { image: 'hayBale', x: 61, y: 44 },
  { image: 'haySmall', x: 63.4, y: 44.2 },
];

/** The thin sprinkle, same as the village but drier. */
export const FARM_GROUND = scatter({
  region: FARM,
  images: ['swayGrass2', 'swayGrass3', 'sprig', 'sprig2', 'tallGrass', 'rockSmall', 'flowerYellow'],
  chance: 0.075,
  spacing: 2,
  jitter: 0.4,
  seed: SEED,
  avoid: KEEP_CLEAR,
  blocksOf,
});
