/** The playroom: bottom right, parquet, floor space and a box to tip out. */

import type { Placement } from '../../../tools/world/shapes.js';
import type { PropLayout } from '../../../tools/world/types.js';

export const FURNITURE: Placement[] = [
  { image: 'rugRound', x: 25, y: 17 },
  { image: 'bedTeal', x: 34, y: 15 },
  { image: 'tableWide', x: 32, y: 21 },
  { image: 'bookshelf', x: 21, y: 15 },
];

export const PROPS: PropLayout[] = [
  { id: 'toybox', image: 'chest', x: 30, y: 20, line: 'sister_again' },
];

export const LANDMARK = { id: 'playroom', x: 28, y: 19 };
