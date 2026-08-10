/**
 * `npm run world:measure <sheet.png> [gap]` — what is actually drawn on a sheet.
 *
 * Every rectangle in `IMAGES` is a measurement of somebody else's PNG, and the
 * pack's interior sheets are the awkward kind: a bed is 25 pixels of art
 * floating in a 32-pixel slot, a counter unit is 16 by 20, and the readmes are
 * license text. Guessing produces a catalog that looks right in a diff and puts
 * half a wardrobe on the screen.
 *
 * So: label the connected runs of opaque pixels and print their bounding boxes,
 * with the tile slot each one falls inside. `gap` dilates by that many pixels
 * before labelling, which joins a lamp to its own shadow (1 is usually right)
 * and, turned up, welds a whole row of touching rugs into one blob — so when a
 * box comes out spanning a whole sheet, run it again with `0`.
 *
 * Paths are pack-relative: `Cute_Fantasy/Buildings/House_Decor/Beds.png`.
 */

import path from 'node:path';

import { PACK_DIR } from '../assets/config.js';
import { readPng } from './png.js';
import { TILE } from './catalog.js';

/** Anything fainter than this is a stray antialiased pixel, not art. */
const OPAQUE = 8;

/** Below this many pixels a component is dust — a single dot of shadow. */
const SMALLEST = 12;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: number;
}

export function measure(file: string, gap = 1): Box[] {
  const png = readPng(file);
  const { width: w, height: h } = png;
  const drawn = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (png.at(x, y)[3] > OPAQUE) drawn[y * w + x] = 1;
  }

  // Grow first, label second: a sprite and its detached shadow are one object
  // to a person and two to a flood fill, and the boxes are measured off the
  // original pixels either way.
  let joined = drawn;
  for (let pass = 0; pass < gap; pass++) {
    const next = new Uint8Array(joined);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!joined[y * w + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) next[ny * w + nx] = 1;
          }
        }
      }
    }
    joined = next;
  }

  const seen = new Uint8Array(w * h);
  const boxes: Box[] = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      const start = y0 * w + x0;
      if (!joined[start] || seen[start]) continue;
      seen[start] = 1;
      const stack = [start];
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      let pixels = 0;
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        const y = (i - x) / w;
        if (drawn[i]) {
          pixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (joined[j] && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          }
        }
      }
      if (pixels >= SMALLEST) {
        boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels });
      }
    }
  }

  boxes.sort((a, b) => a.y - b.y || a.x - b.x);
  return boxes;
}

function main(): void {
  const [name, gapArg] = process.argv.slice(2);
  if (!name) {
    console.error('usage: npm run world:measure -- Cute_Fantasy/Buildings/House_Decor/Beds.png [gap]');
    process.exitCode = 1;
    return;
  }
  const file = path.isAbsolute(name) ? name : path.join(PACK_DIR, name);
  const png = readPng(file);
  const boxes = measure(file, gapArg === undefined ? 1 : Number(gapArg));

  console.log(
    `${name} — ${png.width}x${png.height} px = ${png.width / TILE}x${png.height / TILE} tiles, ` +
      `${boxes.length} parts`,
  );
  for (const b of boxes) {
    const slot =
      `tiles ${Math.floor(b.x / TILE)},${Math.floor(b.y / TILE)}` +
      `..${Math.ceil((b.x + b.w) / TILE)},${Math.ceil((b.y + b.h) / TILE)}`;
    console.log(
      `  x:${String(b.x).padStart(4)} y:${String(b.y).padStart(4)}` +
        ` w:${String(b.w).padStart(3)} h:${String(b.h).padStart(3)}  ${slot}`,
    );
  }
}

main();
