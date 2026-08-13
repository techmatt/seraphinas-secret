/**
 * The playroom: bottom right, parquet, and the room the front door opens into.
 *
 * The arrangement is the round rug with the toybox in the middle of it and
 * something to sit on all round — two stools, two mushrooms and a low table off
 * to one side. Shelves and greenery along the wall. The biggest sweep of empty
 * floor in the house is the point of the room, not a gap in it.
 */

import type { Placement } from '../../../tools/world/shapes.js';
import type { PropLayout, RoomLayout } from '../../../tools/world/types.js';
import { DOWNSTAIRS, EAST, FACE } from './shell.js';

export const ROOM: RoomLayout = {
  id: 'playroom',
  floor: { x: EAST.x, y: DOWNSTAIRS.y, w: EAST.w, h: DOWNSTAIRS.h },
  pattern: 'parquet',
  face: FACE,
};

const HUNG = DOWNSTAIRS.y - FACE;
const STANDS = DOWNSTAIRS.y - 2;

export const FURNITURE: Placement[] = [
  { image: 'bookshelf', x: 21, y: STANDS },
  { image: 'window', x: 24, y: HUNG },
  { image: 'picture', x: 26, y: HUNG + 1 },
  { image: 'windowWide', x: 27, y: HUNG },
  { image: 'shelf', x: 34, y: STANDS },
  { image: 'plantBig', x: 36, y: STANDS },

  // The rug, and a ring of small things to sit on round it. Yellow rather than
  // the white one: on a floor this dark, white reads as a hole in it. The book
  // on the near edge was catalogued as a cushion and is not one — it stays,
  // because a book left face-down on the play rug is what that floor is like.
  { image: 'rugYellow', x: 25, y: 21 },
  { image: 'toadstoolSeat', x: 24, y: 20 },
  { image: 'toadstoolSeat', x: 28, y: 23 },
  { image: 'stool', x: 24, y: 22 },
  { image: 'stool', x: 28, y: 20 },
  { image: 'bookShut', x: 26, y: 24 },

  // A low table off to one side, and green in the far corners.
  { image: 'tableSmall', x: 21, y: 24 },
  { image: 'chairUp', x: 22, y: 23 },
  { image: 'chairDown', x: 22, y: 26 },
  { image: 'dresser', x: 35, y: 26 },
  { image: 'plantTall', x: 37, y: 22 },
];

export const PROPS: PropLayout[] = [
  { id: 'toybox', image: 'chest', x: 26, y: 22, line: 'seraphina_again' },
];

export const LANDMARK = { id: 'playroom', x: 28, y: 22 };
