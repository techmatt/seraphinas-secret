/**
 * Named clusters of props, defined once and dropped at anchor points.
 *
 * Matt's note on the reference images, in one sentence: *decoration clusters
 * where it means something — flower pots at a door, hedges along a wall, a
 * bench beside the path — and grass stays mostly open between clusters.* That
 * is a rule about arrangement, not about which sprite goes where, and a rule
 * about arrangement is exactly the thing that rots when it is spelled out as
 * four hundred individual coordinates.
 *
 * So it is spelled out once, here. Rearranging the village means moving a call
 * to `flowerPotsAtDoor` by two tiles, never editing the pots.
 */

import { pick, rng, type Cell, type Placement } from '../../../tools/world/shapes.js';

/** Pot colours, in the order they cycle when a wall wants a run of them. */
const POTS = ['potRed', 'potYellow', 'potBlue', 'potPink'] as const;

/**
 * Two pots on the step, one either side. `x` is the door's own column, so this
 * reads the same way at every door in the village.
 */
export function flowerPotsAtDoor(x: number, y: number, seed = 1): Placement[] {
  const random = rng(seed);
  return [
    { image: pick(random, POTS), x: x - 1.1, y },
    { image: pick(random, POTS), x: x + 1.1, y },
  ];
}

/**
 * A bench looking at something, with a lamp standing over it. `warm` picks the
 * wooden bench and the copper lamp over the iron pair, so two benches in one
 * view are never the same bench twice.
 */
export function benchBesidePath(x: number, y: number, warm = false): Placement[] {
  return [
    { image: warm ? 'benchWood' : 'bench', x, y },
    { image: warm ? 'lampPostWarm' : 'lampPost', x: x + 2.2, y: y - 1.6 },
  ];
}

/**
 * A lamp and a signboard at a junction, which is where a village signs itself.
 * `side` is which way the lamp stands from the sign, in tiles — negative puts
 * it on the other side, for a junction whose road is to the east.
 */
export function lampAndSign(x: number, y: number, wooden = false, side = 2.4): Placement[] {
  return [
    { image: wooden ? 'signPostWood' : 'signPost', x, y },
    { image: 'lampPostWarm', x: x + side, y: y + 0.2 },
  ];
}

/**
 * A hedge along a wall — bushes shoulder to shoulder rather than the pack's
 * hedge tiles, because a hedge she can walk through is a hedge that cannot
 * corner her, and from above the two read the same.
 */
export function hedgeAlong(
  x: number,
  y: number,
  length: number,
  dir: 'x' | 'y' = 'x',
  seed = 2,
): Placement[] {
  const random = rng(seed);
  const bushes = ['bush', 'bushDark', 'bushBright'] as const;
  const out: Placement[] = [];
  for (let i = 0; i < length; i++) {
    out.push({
      image: pick(random, bushes),
      x: dir === 'x' ? x + i : x + (random() - 0.5) * 0.3,
      y: dir === 'y' ? y + i : y + (random() - 0.5) * 0.3,
    });
  }
  return out;
}

/**
 * A bed of flowers: dense inside its own rectangle and empty outside it, which
 * is the difference between a planted border and a field of weeds.
 */
export function flowerBed(x: number, y: number, w: number, h: number, seed = 3): Placement[] {
  const random = rng(seed);
  const blooms = [
    'bloomPink', 'bloomYellow', 'bloomWhite', 'bloomRed', 'bloomPurple',
    'swayFlowers', 'swayFlowers2', 'swayFlowers3', 'daisies', 'flowerBlue',
  ] as const;
  const out: Placement[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (random() > 0.72) continue;
      out.push({
        image: pick(random, blooms),
        x: x + i + (random() - 0.5) * 0.5,
        y: y + j + (random() - 0.5) * 0.5,
      });
    }
  }
  return out;
}

/**
 * A fenced rectangle with its gate side left open, for a vegetable patch. The
 * rails come in threes and the posts stand at the corners, which is how the
 * pack draws them.
 */
export function fencedPatch(x: number, y: number, w: number, h: number): Placement[] {
  const out: Placement[] = [];
  for (let i = 0; i + 3 <= w; i += 3) {
    out.push({ image: 'fenceRail', x: x + i, y: y - 1 });
    out.push({ image: 'fenceRail', x: x + i, y: y + h });
  }
  out.push({ image: 'fencePost', x: x - 1, y: y - 3 });
  out.push({ image: 'fencePost', x: x - 1, y: y + h - 2 });
  out.push({ image: 'fencePost', x: x + w, y: y - 3 });
  out.push({ image: 'fencePost', x: x + w, y: y + h - 2 });
  return out;
}

/** Rows of ripe vegetables down a patch. Crops do not block; she wades through. */
export function cropRows(x: number, y: number, w: number, h: number, seed = 4): Placement[] {
  const crops = ['cropLeafy', 'cropRound', 'cropTall', 'cropBushy', 'cropRoot'] as const;
  const random = rng(seed);
  const out: Placement[] = [];
  for (let j = 0; j < h; j++) {
    // One crop per row, so a patch reads as planted rather than sown by hand.
    const image = pick(random, crops);
    for (let i = 0; i < w; i++) {
      if (random() > 0.82) continue;
      out.push({ image, x: x + i, y: y + j - 1 });
    }
  }
  return out;
}

/** The corner of a farmyard: bales, barrels, something to drink out of. */
export function farmyardCorner(x: number, y: number): Placement[] {
  return [
    { image: 'hayBale', x, y },
    { image: 'haySmall', x: x + 2.2, y: y + 0.1 },
    { image: 'barrel', x: x + 0.3, y: y - 2.1 },
    { image: 'barrelBlue', x: x + 1.4, y: y - 2.3 },
  ];
}

/** A campsite in the trees: a fire, a log to sit on, a basket. */
export function campsite(x: number, y: number): Placement[] {
  return [
    { image: 'log', x: x - 2, y: y + 1 },
    { image: 'picnicBasket', x: x + 1.6, y: y + 1.2 },
    { image: 'mossyStump', x: x + 2.4, y: y - 0.4 },
  ];
}

/** Bunting strung over a street, so the village looks like somebody lives in it. */
export function bunting(cells: readonly Cell[]): Placement[] {
  return cells.map(([x, y]) => ({ image: 'bunting', x, y }));
}

/** A lamp post at every one of these points. Streets get these down both sides. */
export function lamps(cells: readonly Cell[], warm = false): Placement[] {
  return cells.map(([x, y]) => ({ image: warm ? 'lampPostWarm' : 'lampPost', x, y: y - 2 }));
}
