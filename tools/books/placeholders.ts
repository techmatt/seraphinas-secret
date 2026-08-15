/**
 * `npm run books:placeholders` — hand Matt a ready folder for every book.
 *
 * A book is authored in `content/books/index.ts` long before anybody draws it.
 * The reader copes with that on its own — a page with no picture gets a drawn
 * placeholder card — but *Matt* has nowhere to put the art he then makes, and
 * "create a folder named exactly this, with files named exactly that" is a
 * convention nobody should have to remember. So this walks `BOOKS` and, for any
 * page whose PNG is not in the side-load, writes a placeholder there to be
 * overwritten.
 *
 * It runs as part of `npm run assets:sync`, which is a `predev` and `prebuild`
 * step, so adding book #2 and starting the game is the whole of the ceremony.
 *
 * **Existing files are never touched.** The only thing this can ever do is
 * create; a page Matt has drawn is a page it does not know about.
 *
 * The placeholders say what page they are the same way the reader's card does:
 * a pastel shape and one dot along the bottom per page number. No numerals and
 * no text — she cannot read one, and everything drawn in this game that carries
 * meaning has to carry it as a picture (CLAUDE.md).
 *
 * PNG is written by hand rather than by a library because the whole encoder is
 * sixty lines and this repo has no image dependency: an uncompressed truecolour
 * PNG is a header, one zlib stream of filter-0 scanlines, and three CRCs.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { BOOKS } from '../../content/books/index.js';
import { PACK_DIR, STORIES_DIR } from '../assets/config.js';

/** Roughly square, and the size the reader's left-hand page wants. */
const SIZE = 512;

/** Paper, and the ink the counting dots are drawn in. */
const PAPER: RGB = [0xff, 0xf3, 0xe0];
const INK: RGB = [0x7a, 0x4a, 0x22];

/** One friendly colour per page, exactly as `BookReader` tints its own card. */
const TINTS: RGB[] = [
  [0xf6, 0xa5, 0xc0],
  [0x8f, 0xd3, 0xf4],
  [0xa8, 0xe8, 0x6b],
  [0xff, 0xd1, 0x66],
];

type RGB = [number, number, number];

/**
 * Where a book's pictures live in the side-load.
 *
 * The one place the folder name is decided, and it is the book's own id — which
 * is why ids use underscores now: this is a path on Matt's disk before it is
 * anything else.
 */
export function storyDir(bookId: string, packDir = PACK_DIR): string {
  return path.join(packDir, STORIES_DIR, bookId);
}

/**
 * Create a folder and a placeholder for every page nobody has drawn.
 *
 * Returns the files it wrote, so the caller can say so. Writing none is the
 * normal case and prints nothing.
 */
export async function writeMissingPlaceholders(packDir = PACK_DIR): Promise<string[]> {
  const written: string[] = [];

  for (const book of BOOKS) {
    const dir = storyDir(book.id, packDir);
    let made = false;

    for (let index = 0; index < book.pages.length; index++) {
      const file = path.join(dir, `page${index + 1}.png`);
      if (await exists(file)) continue;
      if (!made) {
        await mkdir(dir, { recursive: true });
        made = true;
      }
      await writeFile(file, placeholderPng(index));
      written.push(file);
    }
  }

  return written;
}

/** One page's stand-in: a pastel shape on paper, and `index + 1` dots to count. */
function placeholderPng(index: number): Buffer {
  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  fill(pixels, PAPER);

  const tint = TINTS[index % TINTS.length]!;
  disc(pixels, SIZE / 2, SIZE * 0.42, SIZE * 0.29, tint);

  // ...and the page number, as things to count rather than a figure to read.
  const gap = 46;
  const left = SIZE / 2 - (index * gap) / 2;
  for (let i = 0; i <= index; i++) disc(pixels, left + i * gap, SIZE * 0.84, 13, INK);

  return encodePng(SIZE, SIZE, pixels);
}

function fill(pixels: Buffer, colour: RGB): void {
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = colour[0];
    pixels[i + 1] = colour[1];
    pixels[i + 2] = colour[2];
  }
}

/** A filled circle, no anti-aliasing: this is a target to paint over. */
function disc(pixels: Buffer, cx: number, cy: number, r: number, colour: RGB): void {
  const top = Math.max(0, Math.floor(cy - r));
  const bottom = Math.min(SIZE - 1, Math.ceil(cy + r));
  for (let y = top; y <= bottom; y++) {
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
    const left = Math.max(0, Math.floor(cx - half));
    const right = Math.min(SIZE - 1, Math.ceil(cx + half));
    for (let x = left; x <= right; x++) {
      const at = (y * SIZE + x) * 3;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
    }
  }
}

// -- the encoder --------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 8-bit truecolour, no interlace, every scanline filtered with 0 (none). */
function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Run directly — `npm run books:placeholders` — as well as from the sync. */
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  writeMissingPlaceholders()
    .then((written) => {
      if (!written.length) {
        console.log(`books: every page in ${BOOKS.length} book(s) has a picture in ${PACK_DIR}`);
        return;
      }
      console.log(`books: ${written.length} placeholder(s) written — overwrite them with the real art:`);
      for (const file of written) console.log(`  ${file}`);
    })
    .catch((error: unknown) => {
      console.error(`books: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
