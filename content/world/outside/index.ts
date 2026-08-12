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
  WOODS_GAP,
} from './plan.js';
import {
  BEHIND_FENCE,
  BEHIND_WOOD_WALL,
  CLIFF,
  CLIFF_FOOT_TREES,
  EDGE,
  FENCE,
  GAP_UNDERGROWTH,
  WOOD_WALL_TREES,
} from './perimeter.js';
import { PEOPLE, PEOPLE_DRESSING } from './people.js';
import { POND_CELLS, ROAD_CELLS } from './roads.js';
import { POND_DRESSING, POND_SIDE } from './pond.js';
import { CLEARING_DRESSING, UNDERGROWTH, WOOD_TREES, WOODS_PROPS } from './woods-edge.js';
import {
  ALLOTMENT_DRESSING,
  BUILDING_SPRITES,
  FRONTS,
  GREEN_DRESSING,
  SQUARE,
  STREET_FURNITURE,
  VILLAGE_GROUND,
  VILLAGE_PROPS,
  VILLAGE_TREES,
} from './village.js';
import { FARM_GROUND, ORCHARD, PATCH_DRESSING, YARD } from './farm-garden.js';

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
  // No overlay. The three grass variants that used to lie here each carried a
  // different base green, so every patch boundary read as a seam between two
  // biomes rather than as a change of ground — see OVERLAYS in the catalog for
  // the measurements and the rule. The wood, the farm and the green now read
  // through what grows on them.
  place: [
    // The boundary first: everything else was laid out to keep off it.
    ...BEHIND_WOOD_WALL,
    ...BEHIND_FENCE,
    ...CLIFF,
    ...FENCE,
    ...WOOD_WALL_TREES,
    ...CLIFF_FOOT_TREES,
    ...GAP_UNDERGROWTH,
    ...WOOD_TREES,
    ...UNDERGROWTH,
    ...CLEARING_DRESSING,
    ...VILLAGE_TREES,
    ...VILLAGE_GROUND,
    ...FARM_GROUND,
    ...POND_DRESSING,
    ...POND_SIDE,
    ...PATCH_DRESSING,
    ...ORCHARD,
    ...YARD,
    ...BUILDING_SPRITES,
    ...SQUARE,
    ...ALLOTMENT_DRESSING,
    ...FRONTS,
    ...GREEN_DRESSING,
    ...STREET_FURNITURE,
    // Last, so a book left on a doorstep is on top of the doorstep.
    ...PEOPLE_DRESSING,
  ],
  block: EDGE,
  /**
   * The world is fenced off by things she can see, and the build says so.
   *
   * `soft` is the one exception, declared out loud: the woods gap is closed with
   * undergrowth she walks straight into and the map's own edge is what stops
   * her, because an obvious wall there would read as "this is the end of the
   * game". Everywhere else the cliff, the fence and the wood have to hold on
   * their own — see `assertWalledIn`.
   */
  sealed: { soft: WOODS_GAP },
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
  npcs: PEOPLE,
  landmarks: LANDMARKS,
};
