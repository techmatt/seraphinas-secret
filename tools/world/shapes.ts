/**
 * The vocabulary a map layout is written in.
 *
 * A layout says "grass everywhere, a pond here, a road from there to there,
 * trees scattered through the wood" — never "tile 47 at 12,9". These are the
 * words for saying that. Everything works in **tiles**, and everything is
 * deterministic: the scatter takes a seed, so regenerating a map that nobody
 * edited produces the same file, and a diff on `public/world/` means somebody
 * actually changed the world.
 */

export type Cell = readonly [number, number];

/** Cells as a set, so "is this on a path" is a lookup and not a scan. */
export class Cells {
  private readonly keys = new Set<number>();

  constructor(cells: Iterable<Cell> = []) {
    this.add(cells);
  }

  add(cells: Iterable<Cell>): this {
    for (const [x, y] of cells) this.keys.add(key(x, y));
    return this;
  }

  remove(cells: Iterable<Cell>): this {
    for (const [x, y] of cells) this.keys.delete(key(x, y));
    return this;
  }

  has(x: number, y: number): boolean {
    return this.keys.has(key(x, y));
  }

  get size(): number {
    return this.keys.size;
  }

  *[Symbol.iterator](): Iterator<Cell> {
    for (const k of this.keys) yield [k % STRIDE, Math.floor(k / STRIDE)] as const;
  }
}

const STRIDE = 4096;
const key = (x: number, y: number) => y * STRIDE + x;

/** A solid block of tiles. */
export function rect(x: number, y: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}

/** Just the outline of a block, one tile thick. */
export function ring(x: number, y: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < w; i++) out.push([x + i, y], [x + i, y + h - 1]);
  for (let j = 1; j < h - 1; j++) out.push([x, y + j], [x + w - 1, y + j]);
  return out;
}

/**
 * A blobby disc. Radii are compared squared with a little wobble per row so a
 * pond does not come out as a pixelated circle — the autotile ring reads much
 * better around an irregular edge.
 */
export function disc(cx: number, cy: number, r: number): Cell[] {
  const out: Cell[] = [];
  for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / (r * 0.78);
      if (dx * dx + dy * dy <= 1) out.push([x, y]);
    }
  }
  return out;
}

/**
 * The ring of tiles `depth` deep around the outside of a map — the band the
 * tree line is planted in, and the band the world is fenced off with.
 */
export function frame(cols: number, rows: number, depth: number): Cell[] {
  return union(
    rect(0, 0, cols, depth),
    rect(0, rows - depth, cols, depth),
    rect(0, 0, depth, rows),
    rect(cols - depth, 0, depth, rows),
  );
}

/** A polyline road with a width, as a layout writes one down. */
export interface RoadSpec {
  /** What it is for, so a diff on the roads reads as a sentence. */
  name: string;
  points: Cell[];
  width: number;
}

/** Every road in a set, as one region of cells. */
export function roadCells(specs: readonly RoadSpec[]): Cell[] {
  return union(...specs.map((spec) => road(spec.points, spec.width)));
}

/**
 * Points evenly spaced along a polyline, `every` tiles apart, offset `off`
 * tiles perpendicular to the run. This is how a street gets lamp posts down
 * both sides without anybody writing out forty coordinates.
 */
export function alongRoad(spec: RoadSpec, every: number, off: number): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < spec.points.length - 1; i++) {
    const [x1, y1] = spec.points[i]!;
    const [x2, y2] = spec.points[i + 1]!;
    const horizontal = y1 === y2;
    const from = horizontal ? x1 : y1;
    const to = horizontal ? x2 : y2;
    const step = to > from ? every : -every;
    for (let at = from + step; step > 0 ? at < to : at > to; at += step) {
      out.push(horizontal ? [at, y1 + off] : [x1 + off, at]);
    }
  }
  return out;
}

/**
 * A road: axis-aligned runs between waypoints, `width` tiles across. Corners
 * are square, which for a dirt track through a farm is exactly right.
 */
export function road(points: Cell[], width = 2): Cell[] {
  const out: Cell[] = [];
  const half = Math.floor((width - 1) / 2);

  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;

    if (x1 === x2) {
      const [from, to] = y1 < y2 ? [y1, y2] : [y2, y1];
      for (let y = from; y <= to; y++)
        for (let w = 0; w < width; w++) out.push([x1 - half + w, y]);
    } else if (y1 === y2) {
      const [from, to] = x1 < x2 ? [x1, x2] : [x2, x1];
      for (let x = from; x <= to; x++)
        for (let w = 0; w < width; w++) out.push([x, y1 - half + w]);
    } else {
      throw new Error(`road segments must be axis-aligned: ${x1},${y1} -> ${x2},${y2}`);
    }
  }
  return out;
}

/** Everything in `cells`, plus everything within `by` tiles of it. */
export function grow(cells: Iterable<Cell>, by = 1): Cell[] {
  const out = new Cells();
  for (const [x, y] of cells) out.add(rect(x - by, y - by, by * 2 + 1, by * 2 + 1));
  return [...out];
}

/**
 * Bite off anything the autotile cannot draw.
 *
 * A blob is a 3x3 ring and four inner corners, so it can say "the edge is to my
 * left" and "a corner pokes in from below-left" — but a cell with water on one
 * side only is a one-tile peninsula, and there is no tile for that. It comes
 * out as a flat square of pond sticking out of its own shoreline, which is
 * exactly the sort of thing no test catches and every screenshot shows.
 *
 * So: drop any cell with fewer than two orthogonal neighbours, twice, which
 * removes peninsulas and the spits left behind when the first ones go.
 */
export function smooth(cells: Iterable<Cell>, passes = 2): Cell[] {
  let set = new Cells(cells);
  for (let pass = 0; pass < passes; pass++) {
    const next = new Cells(set);
    for (const [x, y] of set) {
      const neighbours =
        Number(set.has(x + 1, y)) + Number(set.has(x - 1, y)) +
        Number(set.has(x, y + 1)) + Number(set.has(x, y - 1));
      if (neighbours < 2) next.remove([[x, y]]);
    }
    set = next;
  }
  return [...set];
}

/**
 * Chew a region's outline so it stops looking like a rectangle.
 *
 * A patch of different grass laid over a `rect` draws a straight line across
 * the map, and a straight line is the one thing nothing in a wood or a field
 * ever does. Each pass drops boundary cells at random, so two passes turn a
 * ruled edge into something that could have grown — deterministically, from the
 * seed, so a region nobody edited comes out identical.
 */
export function ragged(cells: Iterable<Cell>, seed: number, passes = 2, chance = 0.45): Cell[] {
  let set = new Cells(cells);
  for (let pass = 0; pass < passes; pass++) {
    const random = rng(seed + pass * 977);
    const next = new Cells(set);
    for (const [x, y] of set) {
      const edge =
        !set.has(x + 1, y) || !set.has(x - 1, y) || !set.has(x, y + 1) || !set.has(x, y - 1);
      if (edge && random() < chance) next.remove([[x, y]]);
    }
    set = next;
  }
  return [...set];
}

export function union(...groups: Iterable<Cell>[]): Cell[] {
  const set = new Cells();
  for (const g of groups) set.add(g);
  return [...set];
}

/** Everything in `from` that is not in `hole`. */
export function without(from: Iterable<Cell>, hole: Cells): Cell[] {
  return [...from].filter(([x, y]) => !hole.has(x, y));
}

/**
 * A tiny deterministic generator. Not a good one — a good one is not the point.
 * The point is that two runs of `npm run world:build` agree.
 */
export function rng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

export interface Placement {
  /** Catalog image key. */
  image: string;
  /** Top-left of the sprite, in tiles. May be fractional. */
  x: number;
  y: number;
  /**
   * She may fell this one.
   *
   * Only meaningful on a tree — see `tree` in the catalog, which is where "this
   * picture is a tree" is decided. This is the other half of the pair and it is
   * per placement on purpose: whether a tree can come down is a fact about
   * *where it is standing*, not about what species it is. The oak in the wood
   * comes down; the identical oak holding the west edge of the world does not.
   *
   * Absent means no, which is the safe default: `assertWalledIn` re-runs the
   * boundary check with every one of these felled, so marking one is a claim the
   * build has to agree with.
   */
  chop?: boolean;
}

/** The same placements, hers to cut down. See `chop` on a Placement. */
export function choppable(placements: readonly Placement[]): Placement[] {
  return placements.map((p) => ({ ...p, chop: true }));
}

export interface ScatterOptions {
  /** Where things may land. */
  region: Iterable<Cell>;
  /** Which catalog images to choose between. */
  images: readonly string[];
  /** Chance per cell, 0..1. */
  chance: number;
  seed: number;
  /** Cells nothing may land on — paths, water, building footprints. */
  avoid?: Cells;
  /**
   * Which tiles an image would make solid, put down here. A tree's trunk is
   * three tiles below where the tree is anchored, so checking only the anchor
   * against `avoid` plants trunks in the middle of roads — and a road with a
   * tree growing out of it is exactly the kind of bug no screenshot shows and
   * every player walks into.
   *
   * It takes the placement as well as the image because the answer depends on
   * both: a solid thing is nudged onto the grid when it is put down, so where
   * its cells land is not a fixed offset from where it was asked to go. See
   * `tools/world/footing.ts` — this is that function, injected, because shapes
   * are meant to know nothing about the art pack.
   */
  cellsOf?: (
    image: string,
    x: number,
    y: number,
  ) => { x: number; y: number; w: number; h: number } | undefined;
  /** Keep this many tiles clear around each placement. */
  spacing?: number;
  /**
   * Everything this scatter puts down is hers to fell. Only trees ever act on
   * it — a bush marked this way is simply a bush — so a mixed scatter of trunks
   * and undergrowth can be marked in one word.
   */
  choppable?: boolean;
  /**
   * Random offset in tiles, so a scatter is not visibly on the grid. Ignored in
   * effect for anything solid: a solid thing is snapped to its own footprint
   * when it is placed, so all a jitter does there is decide which tile it lands
   * on — which is what `chance` and `spacing` were already for.
   */
  jitter?: number;
}

/**
 * Sprinkle sprites over a region. Spacing is enforced against what this call
 * has already placed, which is what stops a wood from turning into a hedge.
 */
export function scatter({
  region,
  images,
  chance,
  seed,
  avoid,
  cellsOf,
  spacing = 0,
  jitter = 0,
  choppable = false,
}: ScatterOptions): Placement[] {
  const random = rng(seed);
  const taken = new Cells();
  const out: Placement[] = [];

  for (const [x, y] of region) {
    if (random() > chance) continue;
    if (avoid?.has(x, y)) continue;
    if (taken.has(x, y)) continue;

    const image = pick(random, images);

    // Both wobbles are always drawn, whether or not they are used, so that the
    // random stream depends on the region and the seed alone — a generator whose
    // numbers shift when a rule changes its mind is a generator whose diffs
    // cannot be read.
    const wobbleX = (random() - 0.5) * jitter;
    const wobbleY = (random() - 0.5) * jitter;

    // Anything solid stands on the tile it was given: it is going to be snapped
    // to its own footprint anyway, so a wobble would only ever move the picture
    // and not the thing she walks into.
    const solid = cellsOf?.(image, x, y);
    const at: Placement = solid
      ? { image, x, y }
      : { image, x: x + (jitter ? wobbleX : 0), y: y + (jitter ? wobbleY : 0) };
    if (choppable) at.chop = true;

    if (avoid && solid) {
      const clash = rect(solid.x, solid.y, solid.w, solid.h).some(([cx, cy]) => avoid.has(cx, cy));
      if (clash) continue;
    }

    out.push(at);

    if (spacing > 0) taken.add(rect(x - spacing, y - spacing, spacing * 2 + 1, spacing * 2 + 1));
    else taken.add([[x, y]]);
  }

  return out;
}
