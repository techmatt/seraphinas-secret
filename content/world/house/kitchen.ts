/**
 * The kitchen: top left, blue tiled floor.
 *
 * Placeholder furniture straight off the pack's sheets. Enough that it reads as
 * a kitchen from the doorway — which is the whole job, since she cannot read a
 * label saying which room she is in.
 */

import type { Placement } from '../../../tools/world/shapes.js';

export const FURNITURE: Placement[] = [
  // A run of units along the wall, and a table to sit at.
  { image: 'stove', x: 2, y: 3 },
  { image: 'sink', x: 3, y: 3 },
  { image: 'sink', x: 4, y: 3 },
  { image: 'fridge', x: 6, y: 3 },
  { image: 'tableWide', x: 4, y: 8 },
  { image: 'bookshelf', x: 11, y: 3 },
];

export const LANDMARK = { id: 'kitchen', x: 7, y: 8 };
