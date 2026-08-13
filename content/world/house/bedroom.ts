/**
 * Her bedroom: bottom left, pale floorboards, and the one room in the house
 * arranged around a single thing she owns.
 *
 * The bed is the arrangement: head against the wall, foot out into the room,
 * a table and a lamp beside it. Everything else hugs the same wall — wardrobe,
 * window, picture, shelves — so the whole middle of the floor is hers.
 */

import type { Placement } from '../../../tools/world/shapes.js';
import type { PropLayout, RoomLayout } from '../../../tools/world/types.js';
import { DOWNSTAIRS, FACE, WEST } from './shell.js';

export const ROOM: RoomLayout = {
  id: 'bedroom',
  floor: { x: WEST.x, y: DOWNSTAIRS.y, w: WEST.w, h: DOWNSTAIRS.h },
  pattern: 'planks',
  face: FACE,
};

const HUNG = DOWNSTAIRS.y - FACE;
const STANDS = DOWNSTAIRS.y - 2;

export const FURNITURE: Placement[] = [
  // Beside the bed, then the wardrobe, then the passage, then the light.
  { image: 'nightstand', x: 4, y: STANDS + 1 },
  { image: 'lamp', x: 5, y: STANDS },
  { image: 'window', x: 11, y: HUNG },
  { image: 'picture', x: 13, y: HUNG + 1 },
  { image: 'window', x: 15, y: HUNG },
  { image: 'shelf', x: 17, y: STANDS },

  // The rug goes at the foot of the bed rather than out in the middle of the
  // floor: it is there to anchor the one arrangement in the room, and a rug
  // anchoring nothing is just a coloured square she walks over.
  { image: 'rug', x: 4, y: 20 },
  { image: 'book', x: 5, y: 21 },
  { image: 'stool', x: 7, y: 21 },
  { image: 'toadstoolSeat', x: 3, y: 23 },

  // The reading nook, which is what the east half is about.
  //
  // The half of this room past the wardrobe was open rather than composed — the
  // emptiest floor in the house. One cluster fixes that and a second would undo
  // it, so: a chair with its back to the wall between the two windows, a lamp at
  // its shoulder, a table for whatever she is halfway through, and a rug under
  // the lot to say they belong together. It spends three tiles of the row under
  // the wall and nothing else, so the crossing from the passage to the playroom
  // door is exactly as wide as it was.
  { image: 'rugRoundGreen', x: 15, y: 19 },
  { image: 'lamp', x: 14, y: 17 },
  { image: 'armchairUp', x: 15, y: 17 },
  { image: 'nightstand', x: 16, y: 18 },
  { image: 'bookShut', x: 16, y: 20 },

  // The other three walls, so the room has edges rather than simply stopping.
  { image: 'bookshelf', x: 1, y: 21 },
  { image: 'dresser', x: 13, y: 26 },
  { image: 'plantFlowers', x: 17, y: 25 },
  { image: 'plantBig', x: 1, y: 26 },
];

export const PROPS: PropLayout[] = [
  // Head to the wall, foot in the room — the one piece of furniture in the
  // house that is allowed to stand out into the floor.
  // Hers, and it speaks in her voice. A prop with no owner standing next to it
  // says what *she* would say about it — Dad telling her it is bedtime made the
  // bed sound like somebody else's idea, in a room that is entirely hers.
  // The dot goes on the floor at the foot of it rather than in the middle of the
  // mattress, the way the wardrobe's does. A bed is two tiles of solid picture,
  // so the middle of it is a place she can never stand — which was close enough
  // to the old proximity radius to work and is not close enough to this one.
  { id: 'bed', image: 'bed', x: 2, y: STANDS + 1, at: { x: 3, y: 19.6 }, line: 'seraphina_bed' },
  { id: 'wardrobe', image: 'wardrobe', x: 6, y: STANDS, at: { x: 7, y: 18.6 }, line: 'seraphina_wardrobe' },
];

export const LANDMARK = { id: 'bedroom', x: 10, y: 22 };
