/**
 * The pond, and what grows at its edge.
 *
 * The water moves now — the pack ships eight frames of its autotile block on
 * one sheet, and the builder resolves a tile per frame — so the reeds and
 * lilypads are the animated versions too. A still lilypad on moving water is
 * worse than either.
 */

import { rng, type Placement } from '../../../tools/world/shapes.js';
import { POND } from './plan.js';
import { POND_CELLS } from './roads.js';

const SEED = 606;

/** Floating things go on the water; reeds and rocks go round its rim. */
export const POND_DRESSING: Placement[] = (() => {
  const random = rng(SEED);
  const water = new Set(POND_CELLS.map(([x, y]) => `${x},${y}`));
  const out: Placement[] = [];

  for (const [x, y] of POND_CELLS) {
    const middle =
      water.has(`${x + 1},${y}`) && water.has(`${x - 1},${y}`) &&
      water.has(`${x},${y + 1}`) && water.has(`${x},${y - 1}`);
    const roll = random();
    if (middle && roll < 0.1) {
      out.push({ image: roll < 0.05 ? 'lilypadRed' : 'lilypadPurple', x, y });
    } else if (!middle && roll < 0.34) {
      out.push({ image: roll < 0.17 ? 'wetRock' : 'wetRock2', x, y });
    }
  }

  // Reeds stand on the bank, one ring out from the water, at the four compass
  // points and a few places between — enough to hide the tile seam, not enough
  // to hide the pond.
  for (const [dx, dy] of [
    [-1, -0.6], [0.5, -1], [1.2, 0.4], [-0.8, 1.1], [0, 1.3], [-1.3, 0.2], [1.1, -0.9],
  ] as const) {
    out.push({
      image: random() < 0.5 ? 'reeds' : 'reeds2',
      x: Math.round(POND.x + dx * (POND.r + 0.6)),
      y: Math.round(POND.y + dy * (POND.r * 0.82 + 0.6)),
    });
  }

  return out;
})();
