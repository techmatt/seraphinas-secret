/**
 * Just enough PNG to measure somebody else's sprite sheet.
 *
 * `build.ts` only ever needed the IHDR header — how many columns a tileset has.
 * Laying out interiors needed more: the pack's furniture sheets are not on one
 * grid, the art floats inside slots of several sizes, and the only honest way to
 * write `x, y, w, h` into the catalog is to look at the pixels. So this decodes
 * a whole image, and `measure.ts` turns that into rectangles.
 *
 * Eight bits per channel, no interlacing, colour types 0/2/3/4/6 — which is
 * every file in the pack, and the decoder says so loudly rather than guessing if
 * a future one is different.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface Png {
  width: number;
  height: number;
  /** Row-major RGBA, four bytes per pixel. */
  rgba: Buffer;
  /** `[r, g, b, a]` at a pixel. Alpha 0 means nothing is drawn there. */
  at(x: number, y: number): [number, number, number, number];
}

/** Bytes per pixel in the decoded scanlines, by PNG colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function readPng(file: string): Png {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`measure: ${file} is not a PNG`);

  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let alphas: Buffer | null = null;
  const parts: Buffer[] = [];

  for (let pos = 8; pos + 8 <= buf.length; ) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8]!;
      colour = data[9]!;
      interlace = data[12]!;
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') alphas = Buffer.from(data);
    else if (type === 'IDAT') parts.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + length;
  }

  if (depth !== 8) throw new Error(`measure: ${file} is ${depth} bits per channel, not 8`);
  if (interlace) throw new Error(`measure: ${file} is interlaced`);
  const channels = CHANNELS[colour];
  if (!channels) throw new Error(`measure: ${file} has colour type ${colour}`);

  // Undo the per-scanline filters. Each line names its own filter in its first
  // byte and refers back to the pixel to its left and the line above it, so this
  // has to run in order and in place.
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const flat = Buffer.alloc(height * stride);
  for (let y = 0, read = 0; y < height; y++) {
    const filter = raw[read++]!;
    const line = raw.subarray(read, read + stride);
    read += stride;
    const row = flat.subarray(y * stride, (y + 1) * stride);
    const above = y ? flat.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels]! : 0;
      const up = above ? above[i]! : 0;
      const upLeft = above && i >= channels ? above[i - channels]! : 0;
      let value = line[i]!;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const guess = left + up - upLeft;
        const dl = Math.abs(guess - left);
        const du = Math.abs(guess - up);
        const dul = Math.abs(guess - upLeft);
        value += dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      }
      row[i] = value & 255;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r: number;
    let g: number;
    let b: number;
    let a = 255;
    if (colour === 0) r = g = b = flat[i]!;
    else if (colour === 4) {
      r = g = b = flat[i * 2]!;
      a = flat[i * 2 + 1]!;
    } else if (colour === 2) {
      r = flat[i * 3]!;
      g = flat[i * 3 + 1]!;
      b = flat[i * 3 + 2]!;
    } else if (colour === 6) {
      r = flat[i * 4]!;
      g = flat[i * 4 + 1]!;
      b = flat[i * 4 + 2]!;
      a = flat[i * 4 + 3]!;
    } else {
      const index = flat[i]!;
      if (!palette) throw new Error(`measure: ${file} is indexed with no palette`);
      r = palette[index * 3]!;
      g = palette[index * 3 + 1]!;
      b = palette[index * 3 + 2]!;
      a = alphas && index < alphas.length ? alphas[index]! : 255;
    }
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }

  return {
    width,
    height,
    rgba,
    at(x, y) {
      const i = (y * width + x) * 4;
      return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
    },
  };
}

/** `#rrggbb`, or `-` where nothing is drawn. */
export function hex([r, g, b, a]: [number, number, number, number]): string {
  if (a === 0) return '-';
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
