/**
 * `npm run assets:sync` — mirror the used slices of the side-loaded art pack
 * into `public/assets/`.
 *
 * It runs as `predev` and `prebuild`, so nobody has to remember it. The pack is
 * licensed but not redistributable: it lives outside the repo, `public/assets/`
 * is gitignored, and neither ever gets committed. What to copy lives in
 * config.ts, not here.
 *
 * Copies are incremental — size and mtime have to differ before a file is
 * rewritten — because this runs before every single `npm run dev`. Files that
 * have left the pack leave the mirror too, so a stale category cannot linger
 * and be loaded by accident.
 *
 * It also carries the book pictures, which are Matt's own rather than the
 * pack's but sit beside it in the side-load: `stories/<book-id>/page<N>.png`.
 * That half is *optional* on both ends — a missing folder is passed over, and a
 * book with no art gets a placeholder written for Matt to paint over rather
 * than a failure. See `tools/books/placeholders.ts` and `content/books/`.
 */

import { mkdir, copyFile, readdir, rm, stat, utimes } from 'node:fs/promises';
import path from 'node:path';

import { writeMissingPlaceholders } from '../books/placeholders.js';
import {
  CATEGORIES,
  OPTIONAL_CATEGORIES,
  PACK_DIR,
  PACK_NAME,
  PACK_URL,
  PUBLIC_DIR,
} from './config.js';

interface Counts {
  copied: number;
  unchanged: number;
  removed: number;
}

async function statOrNull(file: string) {
  try {
    return await stat(file);
  } catch {
    return null;
  }
}

/**
 * Mirror one directory. Returns having made `dest` look exactly like `src`:
 * everything new or changed copied in, everything gone deleted out.
 */
async function mirror(src: string, dest: string, counts: Counts): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });
  const wanted = new Set(entries.map((e) => e.name));

  for (const existing of await readdir(dest, { withFileTypes: true })) {
    if (wanted.has(existing.name)) continue;
    await rm(path.join(dest, existing.name), { recursive: true, force: true });
    counts.removed++;
  }

  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await mirror(from, to, counts);
      continue;
    }
    if (!entry.isFile()) continue;

    const source = await stat(from);
    const target = await statOrNull(to);

    // Whole-file hashing would be honest but this runs before every dev server;
    // size plus mtime is what every other mirroring tool settles for.
    if (
      target &&
      target.size === source.size &&
      Math.abs(target.mtimeMs - source.mtimeMs) < 1000
    ) {
      counts.unchanged++;
      continue;
    }

    await copyFile(from, to);
    // Carry the timestamp across, or every run would think every file changed.
    await utimes(to, source.atime, source.mtime);
    counts.copied++;
  }
}

async function main(): Promise<void> {
  const pack = await statOrNull(PACK_DIR);
  if (!pack?.isDirectory()) {
    throw new Error(
      `assets not found at ${PACK_DIR}\n` +
        `  ${PACK_NAME} is licensed art and is not in this repo. Buy and extract it\n` +
        `  from ${PACK_URL}, then put it there — or point SERAPHINA_ASSETS at it.\n` +
        `  See README, "Art assets".`,
    );
  }

  // Before the mirror, so a book authored since the last run has somewhere for
  // its art to go — and so the placeholders it just wrote are carried across in
  // the same pass rather than one dev server later.
  const stubs = await writeMissingPlaceholders();
  for (const file of stubs) console.log(`  book placeholder written — paint over ${file}`);

  const counts: Counts = { copied: 0, unchanged: 0, removed: 0 };
  let mirrored = 0;

  for (const category of CATEGORIES) {
    const src = path.join(PACK_DIR, category);
    if (!(await statOrNull(src))?.isDirectory()) {
      throw new Error(
        `assets: the pack at ${PACK_DIR} has no "${category}"\n` +
          `  Either the side-load is a different version of ${PACK_NAME}, or\n` +
          `  CATEGORIES in tools/assets/config.ts names a folder that moved.`,
      );
    }
    await mirror(src, path.join(PUBLIC_DIR, category), counts);
    mirrored++;
  }

  // The optional half. A book nobody has drawn is not a broken side-load, so a
  // folder that is not there is passed over without a word — the reader draws
  // its placeholder card and the game is exactly as playable.
  for (const category of OPTIONAL_CATEGORIES) {
    const src = path.join(PACK_DIR, category);
    if (!(await statOrNull(src))?.isDirectory()) continue;
    await mirror(src, path.join(PUBLIC_DIR, category), counts);
    mirrored++;
  }

  console.log(
    `assets: ${counts.copied} copied, ${counts.unchanged} unchanged, ` +
      `${counts.removed} removed — ${mirrored} categor` +
      `${mirrored === 1 ? 'y' : 'ies'} in ${PUBLIC_DIR}`,
  );
}

main().catch((error: unknown) => {
  console.error(`assets sync failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
