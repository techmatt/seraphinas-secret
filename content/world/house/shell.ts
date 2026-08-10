/**
 * The house's shell: how big it is, where its walls and floors are, where the
 * front door is and where she stands when she comes through it.
 *
 * One scrolling floor plan, four rooms, no transitions inside:
 *
 *   kitchen | living room          <- gap in the wall, no transition
 *   --------+-----------
 *   bedroom | playroom             <- front door in the bottom wall
 *
 * Each room's furniture is its own module. This file is everything the four of
 * them share, which is the walls between them.
 */

import { rect, union, without, Cells } from '../../../tools/world/shapes.js';
import type { FloorPaint } from '../../../tools/world/types.js';

export const COLS = 40;
export const ROWS = 26;

/** The opening in the bottom wall that leads back out to the yard. */
export const FRONT_DOOR = rect(19, 25, 2, 1);

export const WALLS = union(
  rect(0, 3, 1, ROWS - 3),
  rect(COLS - 1, 3, 1, ROWS - 3),
  without(rect(1, ROWS - 1, COLS - 2, 1), new Cells(FRONT_DOOR)),
  // Kitchen from living room, with a wide gap you walk straight through.
  without(rect(14, 3, 1, 10), new Cells(rect(14, 7, 1, 2))),
  // Bedroom from playroom.
  without(rect(18, 14, 1, 11), new Cells(rect(18, 18, 1, 2))),
  // Upstairs pair from downstairs pair, with a gap at each end.
  without(rect(1, 13, COLS - 2, 1), new Cells(union(rect(5, 13, 2, 1), rect(27, 13, 2, 1)))),
);

export const FLOORS: FloorPaint[] = [
  // A base under everything, so a gap in a wall is never a hole in the floor.
  { pattern: 'planks', cells: rect(0, 0, COLS, ROWS) },
  { pattern: 'tile', cells: rect(1, 3, 13, 10) },
  { pattern: 'herringbone', cells: rect(15, 3, 24, 10) },
  { pattern: 'planks', cells: rect(1, 14, 17, 11) },
  { pattern: 'parquet', cells: union(rect(19, 14, 20, 11), FRONT_DOOR) },
];

export const TALL_WALLS = [{ x: 0, y: 0, w: COLS, h: 3 }];

export const SPAWNS = {
  start: { x: 20, y: 20, facing: 'down' },
  from_outside: { x: 20, y: 22, facing: 'up' },
} as const;
