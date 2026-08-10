/**
 * The Outside, composed.
 *
 * Every module in this folder describes one part of the world and knows nothing
 * about the others; this is the only file that knows the order they go in.
 * Terrain is painted first-to-last with later paints winning, and sprites are
 * pushed in draw order — though draw order barely matters, because everything
 * in the world sorts by its own base line once it is standing up.
 */

import { rect } from '../../../tools/world/shapes.js';
import type { ZoneLayout } from '../../../tools/world/types.js';

import {
  BUILDINGS,
  COLS,
  FACADES,
  LANDMARKS,
  PATCHES,
  ROWS,
  SPAWNS,
  T,
} from './plan.js';
import { EDGE, EDGE_TREES, GAP_UNDERGROWTH } from './perimeter.js';
import { POND_CELLS, ROAD_CELLS } from './roads.js';
import { POND_DRESSING } from './pond.js';
import {
  CAVE_CLEARING,
  UNDERGROWTH,
  WOOD_FLOOR,
  WOOD_TREES,
  WOODS_PROPS,
} from './woods-edge.js';
import {
  ALLOTMENT_DRESSING,
  BUILDING_SPRITES,
  FRONTS,
  GREEN_DRESSING,
  GREEN_GRASS,
  SQUARE,
  STREET_FURNITURE,
  VILLAGE_GROUND,
  VILLAGE_PROPS,
  VILLAGE_TREES,
} from './village.js';
import { FARM_GRASS, FARM_GROUND, ORCHARD, PATCH_DRESSING, YARD } from './farm-garden.js';

export const OUTSIDE: ZoneLayout = {
  id: 'outside',
  cols: COLS,
  rows: ROWS,
  backdrop: 0x24402c,
  terrain: [
    { kind: 'grass', cells: rect(0, 0, COLS, ROWS) },
    { kind: 'farm', cells: PATCHES },
    { kind: 'path', cells: ROAD_CELLS },
    { kind: 'water', cells: POND_CELLS },
  ],
  // Grass variants ride above the terrain. Each keeps a tile clear of every
  // road, because a dirt path draws its own grass-one corners and the two
  // greens meeting at a kerb is the one seam this system can make.
  overlay: [
    { kind: 'woodGrass', cells: WOOD_FLOOR },
    { kind: 'dryGrass', cells: FARM_GRASS },
    { kind: 'meadowGrass', cells: GREEN_GRASS },
  ],
  place: [
    ...EDGE_TREES,
    ...GAP_UNDERGROWTH,
    ...WOOD_TREES,
    ...UNDERGROWTH,
    ...CAVE_CLEARING,
    ...VILLAGE_TREES,
    ...VILLAGE_GROUND,
    ...FARM_GROUND,
    ...POND_DRESSING,
    ...PATCH_DRESSING,
    ...ORCHARD,
    ...YARD,
    ...BUILDING_SPRITES,
    ...SQUARE,
    ...ALLOTMENT_DRESSING,
    ...FRONTS,
    ...GREEN_DRESSING,
    ...STREET_FURNITURE,
  ],
  block: EDGE,
  spawns: SPAWNS,
  doorways: [
    {
      id: 'outside_to_house',
      // Over the arched door drawn on the house, 39 px in from its left edge,
      // starting at the first row her feet can actually reach.
      x: BUILDINGS.house.x + 39 / T - 1,
      y: BUILDINGS.house.y + 7,
      w: 2,
      h: 1.6,
      to: 'house',
      toSpawn: 'from_outside',
      // Stardew's convention, and Matt's: you walk *out* of a building and
      // press to walk *in*. See RoomScene, and `enter` in types.ts.
      enter: 'press',
      flourish: 'sparkle',
      tint: 0xffd98a,
      facing: 'down',
    },
  ],
  props: [
    ...VILLAGE_PROPS,
    ...WOODS_PROPS,
    // Facades. Their sprite is the whole building; what she pokes is the door.
    ...FACADES.map(({ id, plan }) => ({
      id,
      image: plan.image,
      x: plan.x,
      y: plan.y,
      at: plan.door,
    })),
  ],
  landmarks: LANDMARKS,
};
