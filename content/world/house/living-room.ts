/** The living room: top right, herringbone floor, the fire and the bookshelf. */

import type { Placement } from '../../../tools/world/shapes.js';
import type { PropLayout } from '../../../tools/world/types.js';

export const FURNITURE: Placement[] = [
  { image: 'fireplace', x: 20, y: 3 },
  { image: 'bookshelf', x: 25, y: 3 },
  { image: 'bookshelf', x: 27, y: 3 },
  { image: 'tableRound', x: 30, y: 6 },
  { image: 'rugBlue', x: 21, y: 8 },
  { image: 'wardrobe', x: 35, y: 4 },
];

export const PROPS: PropLayout[] = [
  { id: 'bookshelf', image: 'bookshelf', x: 22, y: 3, line: 'sister_book' },
];

export const LANDMARK = { id: 'living_room', x: 26, y: 8 };
