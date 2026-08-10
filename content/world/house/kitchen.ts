/**
 * The kitchen: top left. Basketweave boards, and a black-and-cream chequer
 * under the working end so the corner she is not meant to play in says so
 * without a wall being in the way.
 *
 * One arrangement: a run of units along the wall with the pans and the clock
 * hung above it, and a laid table with a chair on each of its four sides out in
 * the open floor. Everything else in here is negative space on purpose.
 *
 * Wall furniture is placed so its own bottom edge lands on the floor line — a
 * 32-pixel unit stands two rows up, a 16-pixel one stands one row up — which is
 * what makes a counter look like it is against the wall rather than sunk into
 * it or hovering over it.
 */

import { rect, type Placement } from '../../../tools/world/shapes.js';
import type { RoomLayout } from '../../../tools/world/types.js';
import { FACE, UPSTAIRS, WEST } from './shell.js';

export const ROOM: RoomLayout = {
  id: 'kitchen',
  floor: { x: WEST.x, y: UPSTAIRS.y, w: WEST.w, h: UPSTAIRS.h },
  pattern: 'herringbone',
  inset: { pattern: 'diamond', cells: rect(1, 4, 9, 5) },
  face: FACE,
};

/** Rows of the wall face: the top one things hang from, the one units stand on. */
const HUNG = UPSTAIRS.y - FACE;
const STANDS = UPSTAIRS.y - 2;

export const FURNITURE: Placement[] = [
  // The run. Cupboard, cooker, cupboard, sink, drawers, cupboard, fridge.
  { image: 'counter', x: 2, y: STANDS },
  { image: 'stove', x: 3, y: STANDS },
  { image: 'hood', x: 3, y: HUNG },
  { image: 'counter', x: 4, y: STANDS },
  { image: 'sink', x: 5, y: STANDS },
  { image: 'counterDrawers', x: 6, y: STANDS },
  { image: 'counter', x: 7, y: STANDS },
  { image: 'counter', x: 8, y: STANDS },
  { image: 'fridge', x: 9, y: STANDS },

  // The second stretch of it, with the pans over the top.
  { image: 'counter', x: 11, y: STANDS },
  { image: 'counterDrawers', x: 12, y: STANDS },
  { image: 'potRack', x: 11, y: HUNG },
  { image: 'clock', x: 13, y: HUNG + 1 },
  { image: 'windowWide', x: 14, y: HUNG },
  { image: 'utensils', x: 16, y: HUNG },
  { image: 'dresser', x: 17, y: STANDS },

  // The table, laid, with somewhere for four people to sit.
  { image: 'tableCloth', x: 7, y: 8 },
  { image: 'chairUp', x: 8, y: 7 },
  { image: 'chairUp', x: 9, y: 7 },
  { image: 'chairDown', x: 8, y: 10 },
  { image: 'chairDown', x: 9, y: 10 },
  { image: 'chairLeft', x: 6, y: 9 },
  { image: 'chairRight', x: 11, y: 9 },

  // The corners, so the open floor has edges rather than just running out.
  { image: 'shelf', x: 13, y: 12 },
  { image: 'plantBig', x: 16, y: 11 },
  { image: 'plantLeafy', x: 1, y: 12 },
  { image: 'plantTall', x: 18, y: STANDS },
];

/**
 * Stood back from the table rather than at it: the camera centres on her, so
 * this frames the whole run along the wall with the table below it.
 */
export const LANDMARK = { id: 'kitchen', x: 12, y: 8 };
