/** Her bedroom: bottom left, floorboards. The bed and wardrobe are props. */

import type { Placement } from '../../../tools/world/shapes.js';
import type { PropLayout } from '../../../tools/world/types.js';

export const FURNITURE: Placement[] = [
  { image: 'rug', x: 6, y: 20 },
  { image: 'tableRound', x: 13, y: 16 },
  { image: 'bookshelf', x: 15, y: 21 },
];

export const PROPS: PropLayout[] = [
  { id: 'bed', image: 'bed', x: 3, y: 16, line: 'dad_bedtime' },
  { id: 'wardrobe', image: 'wardrobe', x: 9, y: 15, line: 'seraphina_wardrobe' },
];

export const LANDMARK = { id: 'bedroom', x: 8, y: 19 };
