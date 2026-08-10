/**
 * The wall of trees round the edge of the world, and the one gap in it.
 *
 * The band is a spec rather than a drawing: how deep the world is fenced off,
 * how deep the trees are planted, and where the tree line is told to stop. The
 * gap is at the far west, on the Mystic Woods side, where a future prompt will
 * put a way out — today it reads as a path that carries on into the dark and
 * then gets too thick to push through. Closed with undergrowth on purpose: an
 * obvious wall there would say "this is the end of the game", and undergrowth
 * says "not yet".
 */

import { frame, rect, scatter, union, without, Cells } from '../../../tools/world/shapes.js';
import { EDGE_DEPTH, COLS, ROWS, TREE_BAND, WOODS_GAP } from './plan.js';
import { cellsOf, KEEP_CLEAR } from './roads.js';

const SEED = 90_210;

/** Blocked outright, whatever is drawn on it. The world stops here. */
export const EDGE = frame(COLS, ROWS, EDGE_DEPTH);

/** Where the trees are planted: deeper than the block, so the wall has depth. */
const BAND = frame(COLS, ROWS, TREE_BAND);

/**
 * The tree line, minus the window where the woods are supposed to open.
 *
 * The band overhangs the blocked edge by two tiles, so its inner trees stand on
 * ground she can walk — and a trunk four tiles below its own anchor can land in
 * the middle of the road the trail leaves the map by. Hence the same keep-clear
 * set every other scatter uses.
 */
export const EDGE_TREES = scatter({
  region: without(BAND, new Cells(WOODS_GAP)),
  images: ['spruceBig', 'spruceBig2', 'oakBig', 'oakBig2', 'birchBig', 'spruceMed'],
  chance: 0.85,
  spacing: 1,
  jitter: 0.35,
  seed: SEED,
  avoid: KEEP_CLEAR,
  cellsOf,
});

/**
 * What closes the gap. Thick, soft and entirely walk-through — the map's own
 * edge is what actually stops her, three tiles further out, and she never gets
 * to touch it.
 */
export const GAP_UNDERGROWTH = scatter({
  region: union(WOODS_GAP, rect(4, 26, 5, 8)),
  images: [
    // Weighted by repetition: mostly leaves, so it reads as growth closing in
    // rather than as a clearing somebody felled.
    'bush', 'bushDark', 'bushBright', 'bush', 'bushDark', 'bushBright',
    'tallGrass', 'swayGrass', 'swayGrass2', 'swayGrass3', 'tallGrass',
    'sprig', 'sprig2', 'mossyStump',
  ],
  chance: 0.72,
  spacing: 0,
  jitter: 0.4,
  seed: SEED + 1,
});
