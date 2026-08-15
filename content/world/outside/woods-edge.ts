/**
 * The Mystic Woods, and the campsite in them.
 *
 * Thick but never solid: every tree in the pack blocks one tile of trunk and
 * nothing else, so a wood at this density is somewhere you wander rather than a
 * maze you solve. The trail through it is a road like any other, so there is
 * always a way she can see.
 *
 * The floor is the one outdoor green, the same as everywhere else: the pack's
 * other three greens each carried their own base colour, so a patch of them
 * read as a seam rather than as shade. What makes this a wood is the canopy and
 * the undergrowth under it, which is the only thing that ever really did.
 */

import { scatter } from '../../../tools/world/shapes.js';
import { CLEARING, WOODS } from './plan.js';
import { cellsOf, KEEP_CLEAR_INLAND } from './roads.js';
import { campsite } from './prefabs.js';

const SEED = 20_260_809;

/**
 * The wood itself, and every trunk in it is hers.
 *
 * This is the one big stand of trees she can walk into from all sides, which is
 * what makes it the right place to learn that an axe does something. The wall of
 * trunks at the west edge is a different scatter in `perimeter.ts` and stays
 * standing — see `chop` in shapes.ts for why that is a property of where a tree
 * is rather than of what it is.
 */
export const WOOD_TREES = scatter({
  region: WOODS,
  images: [
    'spruceBig', 'spruceBig2', 'oakBig', 'oakBig2', 'birchBig', 'spruceMed', 'oakMed',
  ],
  chance: 0.5,
  spacing: 2,
  jitter: 0.6,
  seed: SEED,
  avoid: KEEP_CLEAR_INLAND,
  cellsOf,
  choppable: true,
});

export const UNDERGROWTH = scatter({
  region: WOODS,
  images: [
    'bush', 'bushDark', 'bushBright', 'swayToadstool', 'swayToadstool2', 'toadstoolPurple',
    'toadstoolBlue', 'mossyStump', 'log', 'rock', 'tallGrass', 'swayGrass', 'swayGrass2',
    'swayGrass3', 'sprig', 'sprig2',
  ],
  chance: 0.2,
  spacing: 1,
  jitter: 0.4,
  seed: SEED + 1,
  avoid: KEEP_CLEAR_INLAND,
  cellsOf,
});

/**
 * The campsite: somebody has been camping here. It is the one arranged thing in
 * the whole wood, which is what makes it read as somewhere rather than as more
 * trees.
 *
 * The cave used to be the far end of it. The cave is in the north cliff now and
 * the clearing is still a clearing — the fire, the log and the chest have not
 * moved a tile, because what she walks down here for was never the rock.
 */
export const CLEARING_DRESSING = [
  ...campsite(CLEARING.x + 6, CLEARING.y + 4),
  { image: 'lampPostWarm', x: 12.6, y: 37.4 },
];

export const WOODS_PROPS = [
  { id: 'woods_campfire', image: 'campfire', x: 12, y: 40, line: 'seraphina_campfire' },
  { id: 'cave_chest', image: 'chest', x: 9, y: 43, line: 'seraphina_secret' },
  { id: 'woods_toadstool', image: 'swayToadstool', x: 15, y: 21, line: 'seraphina_toadstool' },
];
