/**
 * The village: three neighbours' fronts on the top road, Seraphina's house on
 * the main road, and a green with a fountain on it.
 *
 * The rule this module is written to, in Matt's words: *decoration clusters
 * where it means something, and grass stays mostly open between clusters, so
 * buildings read from a distance and walking anywhere is easy. The world should
 * look composed, like someone arranged it — not filled.*
 *
 * Which in practice means almost everything here is a prefab at an anchor —
 * pots at a door, a hedge along a wall, a bench beside a path — and the only
 * scatter is a thin sprinkle of tufts and blooms with nothing solid in it.
 */

import { alongRoad, rect, scatter, union, type Placement } from '../../../tools/world/shapes.js';
import { BUILDINGS, ROADS, VILLAGE } from './plan.js';
import { cellsOf, KEEP_CLEAR_INLAND } from './roads.js';
import {
  benchBesidePath,
  flowerBed,
  flowerPotsAtDoor,
  hedgeAlong,
  lampAndSign,
  lamps,
  bunting,
} from './prefabs.js';

const SEED = 4242;

/** Seraphina's house is placed here; the facades are placed as props. */
export const BUILDING_SPRITES: Placement[] = [
  { image: BUILDINGS.house.image, x: BUILDINGS.house.x, y: BUILDINGS.house.y },
];

/**
 * The market square: four stalls and a well between the top road and the two
 * fronts on the main road. Its middle is deliberately bare, because a square
 * with nothing in the middle of it is the thing that reads as a square.
 */
export const SQUARE: Placement[] = [
  { image: 'stallRed', x: 28, y: 17 },
  { image: 'stallGreen', x: 39, y: 17 },
  ...bunting([[30, 15.4], [37, 15.4], [43, 15.4]]),
  ...benchBesidePath(31.6, 20.4),
  ...benchBesidePath(36.4, 20.4, true),
  ...flowerBed(42, 20, 3, 2, 22),
  ...flowerBed(31, 18, 3, 1, 27),
];

/**
 * The allotment: the four-tile strip between the wood and the west lane, which
 * would otherwise be the one part of the village nobody had decided about.
 */
export const ALLOTMENT_DRESSING: Placement[] = [
  { image: 'stallYellow', x: 22, y: 19 },
  ...flowerBed(21, 16, 4, 2, 23),
  ...hedgeAlong(21, 24, 4, 'x', 24),
  ...flowerBed(21, 28, 4, 2, 25),
  ...lampAndSign(23.4, 16.4, false, -2),
];

/**
 * Building fronts, dressed. Every one of these is the same idea: pots on the
 * step, a hedge along the wall the door is in, so the eye is pulled to the door
 * and the rest of the wall reads as wall.
 */
export const FRONTS: Placement[] = [
  // Seraphina's own. Two pots on the step and flower beds either side of it.
  ...flowerPotsAtDoor(BUILDINGS.house.door.x, BUILDINGS.house.door.y + 0.4, 11),
  ...flowerBed(29.2, 30, 2, 1, 12),
  ...flowerBed(34.6, 30, 1, 1, 13),
  ...hedgeAlong(29.2, 23, 6, 'y', 14),

  // The village hall, next door along the same street.
  ...flowerPotsAtDoor(BUILDINGS.hall.door.x, BUILDINGS.hall.door.y + 0.4, 15),
  ...flowerBed(40, 30, 5, 1, 16),
  ...hedgeAlong(45.2, 23, 6, 'y', 17),
  ...lamps([[35, 30], [44, 30]], true),

  // Joey's, on the top road. The second hedge used to run to the edge of his
  // front; it stops a tile short now, because Sneak stands in the gap between
  // the two houses and a boy planted in a bush is not the reading he wants.
  ...flowerPotsAtDoor(BUILDINGS.joey.door.x, BUILDINGS.joey.door.y + 0.5, 18),
  ...hedgeAlong(30, 12.2, 2, 'x', 19),
  ...hedgeAlong(34.4, 12.3, 2, 'x', 20),

  // Scar's, next door along.
  ...flowerPotsAtDoor(BUILDINGS.scar.door.x, BUILDINGS.scar.door.y + 0.5, 25),
  ...flowerBed(43, 11.6, 2, 1, 26),
];

/**
 * The green: a fountain in the middle, benches looking at it, lamps on the
 * corners and a border of flowers. Nothing is scattered onto it at all — the
 * open middle is the composition.
 */
export const GREEN_DRESSING: Placement[] = [
  { image: 'fountain', x: 31, y: 37 },
  ...benchBesidePath(28, 36.4),
  ...benchBesidePath(33.4, 40.2, true),
  ...lamps([[27, 39], [36, 36]], true),
  ...flowerBed(27, 34, 10, 1, 31),
  ...flowerBed(27, 42, 10, 1, 32),
  { image: 'picnicBasket', x: 29.4, y: 41.6 },
];

/**
 * Street furniture: lamps down both verges of the two roads that matter, a
 * signboard where the lanes meet them, and bunting over the top road. Lamps
 * every five tiles rather than every two — a lit street, not a runway.
 */
export const STREET_FURNITURE: Placement[] = [
  ...lamps(alongRoad(ROADS.top, 6, -2)),
  ...lamps(alongRoad(ROADS.main, 7, 3), true),
  ...lampAndSign(48.4, 28.2, true),
  ...benchBesidePath(48.4, 16.6, true),
];

/**
 * The apple tree and the well: the two things in the village she can poke.
 * The well stands on her own street rather than in the square, because the
 * first thing she ever walks up to should be one hop from where she starts.
 */
export const VILLAGE_PROPS = [
  { id: 'apple_tree', image: 'fruitBig', x: 22, y: 26, line: 'dad_apple' },
  { id: 'well', image: 'well', x: 28, y: 28, line: 'dad_sparkle' },
];

/**
 * A handful of proper trees, to break the skyline between the buildings. Hers
 * to fell: they stand in the middle of the village with the fence and the cliff
 * a long way off, so the one she is standing under is never load-bearing.
 */
export const VILLAGE_TREES = scatter({
  region: union(rect(21, 16, 30, 14), rect(21, 35, 30, 11)),
  images: ['oakBig', 'oakBig2', 'oakMed', 'fruitBig', 'birchBig'],
  chance: 0.06,
  spacing: 5,
  jitter: 0.5,
  seed: SEED,
  avoid: KEEP_CLEAR_INLAND,
  cellsOf,
  choppable: true,
});

/**
 * The thin sprinkle between clusters: tufts and single blooms, nothing solid,
 * nothing bigger than a tile. This is what keeps open grass from being flat
 * without ever being something to walk round.
 */
export const VILLAGE_GROUND = scatter({
  region: VILLAGE,
  images: [
    'swayGrass', 'swayGrass2', 'swayGrass3', 'swayFlowers', 'sprig', 'sprig2',
    'daisies', 'rockSmall',
  ],
  chance: 0.07,
  spacing: 2,
  jitter: 0.4,
  seed: SEED + 1,
  avoid: KEEP_CLEAR_INLAND,
  cellsOf,
});
