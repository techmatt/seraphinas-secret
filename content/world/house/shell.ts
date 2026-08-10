/**
 * The house's shell: four rooms on one floor plan, and the walls between them.
 *
 *   kitchen | living room
 *   --------+-----------          <- a passage at each end, no transition
 *   bedroom | playroom            <- front door in the bottom wall
 *
 * A room is written as the *floor* she can walk on. The generator puts three
 * tiles of wall face at the head of it and frames the lot in dark timber, which
 * is the arrangement the reference interior uses everywhere: a beam, a lighter
 * face with the detail hung on it, then the room. Nothing here says "wall tile"
 * — say where the floor is and the walls follow, and they cannot drift out of
 * step with it the way a hand-written wall list did.
 *
 * The numbers line up on purpose. Upstairs runs rows 4..13 and its foot is row
 * 14; downstairs is capped by that same row 14 and runs rows 18..27. So the two
 * halves share one beam, and moving either one is a single edit.
 */

import { rect, union } from '../../../tools/world/shapes.js';
import type { FloorPaint } from '../../../tools/world/types.js';

export const COLS = 40;
export const ROWS = 29;

/** How much wall face stands at the head of every room. */
export const FACE = 3;

/** The two floor bands, and the columns either side of the middle wall. */
export const UPSTAIRS = { y: 4, h: 10 };
export const DOWNSTAIRS = { y: 18, h: 10 };
export const WEST = { x: 1, w: 18 };
export const EAST = { x: 20, w: 19 };

/** The opening in the bottom wall that leads back out to the yard. */
export const FRONT_DOOR = rect(28, 28, 2, 1);

/**
 * Every hole in a wall.
 *
 * The two passages between the floors are three tiles wide and four deep,
 * because that is the shape of the corridor they read as — and because a
 * four-year-old aims a thumbstick, so anything she has to be threaded through
 * is a fail state with a nicer name. The side openings are three tall for the
 * same reason.
 */
export const OPENINGS = union(
  // Kitchen down to her bedroom, and the living room down to the playroom.
  rect(8, 14, 3, 4),
  rect(30, 14, 3, 4),
  // Kitchen through to the living room, bedroom through to the playroom.
  rect(19, 8, 1, 3),
  rect(19, 22, 1, 3),
  FRONT_DOOR,
);

/**
 * A dark boarded floor under the whole plan.
 *
 * Only ever seen through the openings, where it reads as the threshold strip
 * between two rooms — which is exactly what it is. Every room paints its own
 * material over the top.
 */
export const FLOORS: FloorPaint[] = [{ pattern: 'boards', cells: rect(0, 0, COLS, ROWS) }];

export const SPAWNS = {
  start: { x: 28.5, y: 25, facing: 'down' },
  from_outside: { x: 28.5, y: 25, facing: 'up' },
} as const;
