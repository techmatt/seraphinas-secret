/**
 * `npm run world:footings [key…]` — is each catalog hitbox under the thing it is
 * the hitbox of?
 *
 * `measure.ts` answers "where is the art on this sheet". This answers the
 * question after it: given the rectangle we cut, and the `blocks` we wrote down
 * beside it, do the two describe the same object? Nothing on screen can say —
 * a hitbox has no picture — and the trees spent five commits blocking the tile
 * diagonally down-right of every trunk because of exactly that.
 *
 * What it measures is the **base**: the bottom band of *fully opaque* pixels in
 * the rectangle. Opaque, so the pack's soft drop shadows are ignored — a shadow
 * is where the light is not, and she does not collide with it. The bottom band,
 * so a leaning canopy does not drag the answer sideways: what a thing stands on
 * is decided at its feet.
 *
 * Two numbers come out per image, both in pack pixels:
 *
 *  - **dx** — the block's centre, minus the base's centre. Positive is a hitbox
 *    sitting to the right of what it belongs to.
 *  - **dy** — the block's bottom edge, minus the base's. Positive is a hitbox
 *    sitting below.
 *
 * Anything under a quarter of a tile is called level; the pack's own art is not
 * drawn to a finer grid than that. Everything else is listed worst first.
 *
 * It is a report, not a gate: several of the remainders are deliberate — a
 * building's footprint stops short of its drawn base so she can stand on the
 * step, and a cave mouth leaves its own threshold walkable on purpose.
 */

import path from 'node:path';

import { PACK_DIR } from '../assets/config.js';
import { IMAGES, TILE, type ImageDef } from './catalog.js';
import { readPng, type Png } from './png.js';

/** Below this alpha it is a drop shadow, not the thing itself. */
const OPAQUE = 200;

/** How many rows of the bottom of the art count as "the base". */
const BAND = 4;

/** Off by less than this and the art is not drawn precisely enough to care. */
const LEVEL = TILE / 4;

interface Base {
  /** Middle of the base band, in pack pixels from the rectangle's left edge. */
  mid: number;
  /** One past the lowest drawn row — where the thing meets the ground. */
  bottom: number;
  /** Extent of the base band, for reading alongside the numbers. */
  left: number;
  right: number;
}

const sheets = new Map<string, Png>();
function sheet(file: string): Png {
  const disk = path.join(PACK_DIR, file.replace(/^assets\//, ''));
  let png = sheets.get(disk);
  if (!png) {
    png = readPng(disk);
    sheets.set(disk, png);
  }
  return png;
}

/** Where the picture's own feet are, measured off the pixels. */
export function baseOf(def: ImageDef): Base | null {
  const png = sheet(def.file);
  const opaque = (col: number, row: number) => png.at(def.x + col, def.y + row)[3] >= OPAQUE;

  let bottom = -1;
  for (let row = def.h - 1; row >= 0 && bottom < 0; row--) {
    for (let col = 0; col < def.w; col++) if (opaque(col, row)) bottom = row;
  }
  if (bottom < 0) return null;

  let left = def.w;
  let right = -1;
  for (let row = Math.max(0, bottom - BAND + 1); row <= bottom; row++) {
    for (let col = 0; col < def.w; col++) {
      if (!opaque(col, row)) continue;
      if (col < left) left = col;
      if (col > right) right = col;
    }
  }

  return { mid: (left + right + 1) / 2, bottom: bottom + 1, left, right: right + 1 };
}

interface Row {
  key: string;
  base: Base;
  dx: number;
  dy: number;
}

function main(): void {
  const wanted = process.argv.slice(2);
  const keys = wanted.length ? wanted : Object.keys(IMAGES);

  const rows: Row[] = [];
  let unblocked = 0;

  for (const key of keys) {
    const def = IMAGES[key];
    if (!def) {
      console.error(`footings: no catalog image "${key}"`);
      process.exitCode = 1;
      continue;
    }
    const base = baseOf(def);
    if (!base) {
      console.error(`footings: nothing is drawn in ${key}'s rectangle`);
      process.exitCode = 1;
      continue;
    }
    if (!def.blocks) {
      unblocked++;
      continue;
    }
    rows.push({
      key,
      base,
      dx: (def.blocks.x + def.blocks.w / 2) * TILE - base.mid,
      dy: (def.blocks.y + def.blocks.h) * TILE - base.bottom,
    });
  }

  const off = rows
    .filter((r) => Math.abs(r.dx) >= LEVEL || Math.abs(r.dy) >= LEVEL)
    .sort((a, b) => Math.hypot(b.dx, b.dy) - Math.hypot(a.dx, a.dy));

  const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  for (const { key, base, dx, dy } of off) {
    console.log(
      `${key.padEnd(18)} base x${String(base.left).padStart(3)}..${String(base.right).padEnd(3)}` +
        ` foot ${String(base.bottom).padStart(3)}   dx ${signed(dx).padStart(6)}` +
        `  dy ${signed(dy).padStart(6)}`,
    );
  }

  console.log(
    `\nfootings: ${rows.length - off.length} of ${rows.length} solid images sit level ` +
      `(within ${LEVEL} px); ${off.length} listed above; ${unblocked} images block nothing.`,
  );
}

main();
