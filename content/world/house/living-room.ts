/**
 * The living room: top right, dark boards, and the warmest room in the house.
 *
 * One arrangement, and it is the reference's: a sofa on a red rug with an
 * armchair either side, all of it facing a brick fireplace set into the wall,
 * with a lamp at the sofa's shoulder. The piano and the shelves go along the
 * wall behind, where they dress the room without standing in it.
 */

import type { Placement } from '../../../tools/world/shapes.js';
import type { PropLayout, RoomLayout } from '../../../tools/world/types.js';
import { EAST, FACE, UPSTAIRS } from './shell.js';

export const ROOM: RoomLayout = {
  id: 'living_room',
  floor: { x: EAST.x, y: UPSTAIRS.y, w: EAST.w, h: UPSTAIRS.h },
  pattern: 'boards',
  face: FACE,
};

const HUNG = UPSTAIRS.y - FACE;
const STANDS = UPSTAIRS.y - 2;

export const FURNITURE: Placement[] = [
  // The wall, left to right: the piano, light, the fire in the middle of it,
  // a picture, more light, and the shelves at the far end.
  { image: 'piano', x: 20, y: STANDS },
  { image: 'windowWide', x: 23, y: HUNG },
  { image: 'fireplaceBrick', x: 27, y: HUNG },
  { image: 'picture', x: 30, y: HUNG + 1 },
  { image: 'windowWide', x: 32, y: HUNG },
  { image: 'shelf', x: 38, y: STANDS },

  // The arrangement, on the rug, looking at the fire.
  { image: 'rugRed', x: 26, y: 6 },
  { image: 'sofa', x: 27, y: 5 },
  { image: 'armchairRight', x: 25, y: 7 },
  { image: 'armchairLeft', x: 29, y: 7 },
  { image: 'stool', x: 27, y: 7 },
  { image: 'lamp', x: 30, y: 4 },

  // The far wall and the corners, so the room has edges rather than fading out.
  { image: 'dresser', x: 23, y: 12 },
  { image: 'plantBigWhite', x: 37, y: 11 },
  { image: 'plantTall', x: 20, y: 12 },
  { image: 'plantLeafy', x: 34, y: STANDS },
];

export const PROPS: PropLayout[] = [
  // Against the wall past the second window. She reads it standing on the
  // floor in front of it, not inside it.
  { id: 'bookshelf', image: 'bookshelf', x: 35, y: STANDS, at: { x: 36, y: 4.5 }, line: 'sister_book' },
];

export const LANDMARK = { id: 'living_room', x: 28, y: 8 };
