/**
 * One autotile rule, for every terrain that has one.
 *
 * The pack draws a region of terrain X carved into background Y as a 3x5 block:
 * a 3x3 ring of edges around X's middle tile, and under it a 2x2 of inner
 * corners — the four ways a *neighbouring* region can poke a corner into X.
 * Water in grass, cobble in dirt and the sand path in grass are all that same
 * block, so this is the only place the rule is written.
 *
 *     . . .   0,0 1,0 2,0     outside corners and straight edges
 *     . X .   0,1 1,1 2,1     1,1 is the middle: nothing but X around it
 *     . . .   0,2 1,2 2,2
 *     c c     0,3 1,3         inner corners: a diagonal neighbour is not X
 *     c c     0,4 1,4
 *
 * A cell can want two inner corners at once. There is one tile, so the first
 * match wins — which is why regions in `content/world/` are drawn as blobs and
 * roads, and never as one-tile spurs.
 */

export interface BlobOffset {
  col: number;
  row: number;
}

/** `inside(x, y)` answers "is this cell the same terrain as the one we are on". */
export function blobOffset(
  inside: (x: number, y: number) => boolean,
  x: number,
  y: number,
): BlobOffset {
  const up = inside(x, y - 1);
  const down = inside(x, y + 1);
  const left = inside(x - 1, y);
  const right = inside(x + 1, y);

  if (!up && !left) return { col: 0, row: 0 };
  if (!up && !right) return { col: 2, row: 0 };
  if (!down && !left) return { col: 0, row: 2 };
  if (!down && !right) return { col: 2, row: 2 };
  if (!up) return { col: 1, row: 0 };
  if (!down) return { col: 1, row: 2 };
  if (!left) return { col: 0, row: 1 };
  if (!right) return { col: 2, row: 1 };

  // All four sides are ours; only a diagonal can still cut in.
  if (!inside(x + 1, y + 1)) return { col: 0, row: 3 };
  if (!inside(x - 1, y + 1)) return { col: 1, row: 3 };
  if (!inside(x + 1, y - 1)) return { col: 0, row: 4 };
  if (!inside(x - 1, y - 1)) return { col: 1, row: 4 };

  return { col: 1, row: 1 };
}
