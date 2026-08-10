/**
 * The house, composed: the shell plus one module per room.
 *
 * The props come out in room order — bed, wardrobe, bookshelf, toybox — which
 * is the order the suite asserts on, and the order she meets them walking in
 * from the front door and turning left.
 */

import type { ZoneLayout } from '../../../tools/world/types.js';

import * as bedroom from './bedroom.js';
import * as kitchen from './kitchen.js';
import * as living from './living-room.js';
import * as playroom from './playroom.js';
import { COLS, FLOORS, ROWS, SPAWNS, TALL_WALLS, WALLS } from './shell.js';

export const HOUSE: ZoneLayout = {
  id: 'house',
  cols: COLS,
  rows: ROWS,
  backdrop: 0x211722,
  floors: FLOORS,
  walls: WALLS,
  tallWalls: TALL_WALLS,
  place: [
    ...kitchen.FURNITURE,
    ...living.FURNITURE,
    ...bedroom.FURNITURE,
    ...playroom.FURNITURE,
  ],
  spawns: SPAWNS,
  doorways: [
    {
      id: 'house_to_outside',
      x: 19,
      y: 24.2,
      w: 2,
      h: 1.8,
      to: 'outside',
      toSpawn: 'from_house',
      // Walking out is the whole interaction, in here and in every interior.
      // Only doors you walk *into* ask for a press — see the Outside.
      enter: 'walk',
      flourish: 'hush',
      tint: 0x9be7ff,
      facing: 'up',
    },
  ],
  props: [...bedroom.PROPS, ...living.PROPS, ...playroom.PROPS],
  landmarks: [kitchen.LANDMARK, living.LANDMARK, bedroom.LANDMARK, playroom.LANDMARK],
};
