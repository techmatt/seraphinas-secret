/**
 * The Mystic Woods, and the cave mouth in them.
 *
 * Thick but never solid: every tree in the pack blocks one tile of trunk and
 * nothing else, so a wood at this density is somewhere you wander rather than a
 * maze you solve. The trail through it is a road like any other, so there is
 * always a way she can see.
 *
 * The floor is the pack's cold blue-green grass, laid over the ordinary green
 * on the overlay layer. That colour change is most of why the woods read as a
 * different place from twenty tiles away.
 */

import { scatter } from '../../../tools/world/shapes.js';
import { BUILDINGS, WOODS } from './plan.js';
import { blocksOf, KEEP_CLEAR, overlayable } from './roads.js';
import { campsite } from './prefabs.js';

const SEED = 20_260_809;

/** Cold grass under the canopy, kept a tile clear of every path. */
export const WOOD_FLOOR = overlayable(WOODS);

export const WOOD_TREES = scatter({
  region: WOODS,
  images: [
    'spruceBig', 'spruceBig2', 'oakBig', 'oakBig2', 'birchBig', 'spruceMed', 'oakMed',
  ],
  chance: 0.5,
  spacing: 2,
  jitter: 0.6,
  seed: SEED,
  avoid: KEEP_CLEAR,
  blocksOf,
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
  avoid: KEEP_CLEAR,
  blocksOf,
});

/**
 * The clearing outside the cave: somebody has been camping here. It is the one
 * arranged thing in the whole wood, which is what makes it read as somewhere
 * rather than as more trees.
 */
export const CAVE_CLEARING = [
  ...campsite(BUILDINGS.cave.x + 6, BUILDINGS.cave.y + 4),
  { image: 'lampPostWarm', x: 12.6, y: 37.4 },
];

export const WOODS_PROPS = [
  { id: 'woods_campfire', image: 'campfire', x: 12, y: 40, line: 'seraphina_sparky' },
  { id: 'cave_chest', image: 'chest', x: 9, y: 43, line: 'seraphina_secret' },
  { id: 'woods_toadstool', image: 'swayToadstool', x: 15, y: 21, line: 'seraphina_munchy' },
];
