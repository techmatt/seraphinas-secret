/**
 * `npm run voice:audit` — every voiced line as one CSV, for reading the script.
 *
 * Recording is the expensive, one-way step: a Firefly batch is pasted by hand
 * and a clip that says the wrong thing costs another session to replace. So the
 * words are worth auditing *before* they are committed to a voice, and reading
 * them out of `lines.json` does not do that — what a line is depends entirely on
 * where it plays, and a sentence that is perfect as a quest instruction is wrong
 * coming out of a bookshelf.
 *
 * Hence `context`: where and when each line is spoken, short enough to sort by.
 * Most of it is worked out from the content itself — a prop's line is beside the
 * prop's id in `content/world/`, a book page's is in `content/books/` — and the
 * rest is the table below, read off the code once and checked by the fact that
 * every line has to land somewhere: a line this tool cannot place is named in
 * the console rather than left with an empty column.
 *
 * The CSV goes to the drive, not into the repo. It is something to read once and
 * mark up, not a thing the game or another tool consumes.
 *
 *   npm run voice:audit
 *   npm run voice:audit -- --out some\other.csv
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BOOKS } from '../../content/books/index.js';
import { profileFor, readLines, readProfiles, spokenFor } from './firefly.js';
import type { VoiceManifest } from './types.js';

const DEFAULT_OUT = path.join('C:', 'Code', 'seraphinas-drive-sync', 'reports', 'dialog_audit.csv');
const MANIFEST = path.join('public', 'voice', 'manifest.json');
const WORLD_DIR = path.join('content', 'world');

/**
 * Where a line plays, for everything that is not written down in content.
 *
 * Read off `src/quest/quests.ts`, `src/scenes/RoomScene.ts`, `src/state/recap.ts`
 * and `src/voice/barks.ts` on 2026-08-15. Kept here rather than derived because
 * a quest phase's instruction is a field on a table under `src/`, which tools
 * may not import — and because the useful column is a phrase a person reads, not
 * a path. Anything missing from here and from the content scan is reported.
 */
const CONTEXT: Record<string, string> = {
  seraphina_hello: 'title greeting',
  dad_bedtime: 'dusk: dad calls her in',

  // The faeries.
  sneak_quest_offer: 'quest faerie: offer',
  sneak_quest_stones: 'quest faerie: offer',
  sneak_quest_hammer: 'quest faerie: phase hammer',
  sneak_quest_crack: 'quest faerie: phase gems',
  sneak_quest_cave: 'quest faerie: phase meetAtCave',
  sneak_cave_greet: 'quest faerie: phase ritual',
  sneak_press_red: 'quest faerie: ritual prompt',
  sneak_press_green: 'quest faerie: ritual prompt',
  sneak_press_blue: 'quest faerie: ritual prompt',
  sneak_try_red: 'quest faerie: ritual retry',
  sneak_try_green: 'quest faerie: ritual retry',
  sneak_try_blue: 'quest faerie: ritual retry',
  sneak_faeries_real: 'quest faerie: finale',
  hazel_pretty: 'quest faerie: finale',
  sneak_thanks: 'quest faerie: finale',
  sneak_coin: 'quest faerie: reward',

  // The bunnies.
  dad_quest_offer: 'quest bunny: offer',
  dad_quest_pen: 'quest bunny: offer and phase toThePen',
  dad_quest_chop: 'quest bunny: phase freeThem',
  dad_quest_carrots: 'quest bunny: phase carrots',
  dad_quest_lure: 'quest bunny: phase lure',
  dad_two_more: 'quest bunny: progress',
  dad_one_more: 'quest bunny: progress',
  dad_bunnies_home: 'quest bunny: finale',
  dad_bunny_coin: 'quest bunny: reward',
  seraphina_one_bunny: 'quest bunny: correction',
  seraphina_need_carrot: 'quest bunny: correction',

  // The story.
  hazel_story_offer: 'quest story: offer',
  hazel_story_book: 'quest story: offer and phase getBook',
  hazel_story_come: 'quest story: phase toHazel',
  hazel_story_read: 'quest story: phase read',
  hazel_story_hug: 'quest story: finale',
  hazel_story_coin: 'quest story: reward',

  // The little things she says to herself. See `src/voice/barks.ts`.
  seraphina_axe: 'bark: naming a tool',
  seraphina_hammer: 'bark: naming a tool',
  seraphina_malachite: 'bark: naming a stone',
  seraphina_ruby: 'bark: naming a stone',
  seraphina_sapphire: 'bark: naming a stone',
  seraphina_bunny: 'bark: naming a pickup',
  seraphina_carrot: 'bark: naming a pickup',
  seraphina_storybook: 'bark: naming a pickup',
  seraphina_need_axe: 'bark: wrong tool in hand',
  seraphina_need_hammer: 'bark: wrong tool in hand',

  // Bedtime.
  seraphina_recap_faeries: 'bedtime recap',
  seraphina_recap_bunnies: 'bedtime recap',
  seraphina_recap_story: 'bedtime recap',
  seraphina_recap_errand: 'bedtime recap',
  seraphina_recap_stones: 'bedtime recap',
  seraphina_recap_trees: 'bedtime recap',
  seraphina_goodnight: 'bedtime recap: goodnight',
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--out');
  const out = at >= 0 ? argv[at + 1] : DEFAULT_OUT;
  if (!out) throw new Error('--out needs a path');

  const lines = await readLines();
  const profiles = await readProfiles();
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as VoiceManifest;
  const shown = new Map(manifest.lines.map((entry) => [entry.id, entry]));

  const contexts = new Map<string, string>();
  for (const [id, where] of Object.entries(await scanWorld())) contexts.set(id, where);
  for (const [id, where] of Object.entries(scanBooks())) contexts.set(id, where);

  const unplaced: string[] = [];
  const rows = lines
    .filter((line) => shown.has(line.id))
    .map((line) => {
      const entry = shown.get(line.id)!;
      const spoken = spokenFor(line);
      const context = contexts.get(line.id) ?? CONTEXT[line.id] ?? '';
      if (!context) unplaced.push(line.id);
      return {
        line_id: line.id,
        speaker: line.speaker,
        profile: profileFor(line, profiles),
        context,
        display_text: entry.text,
        // Blank where Firefly is asked for exactly what is shown. What is left
        // is the `say`/`text` split and the terminal stop `spokenFor` adds — and
        // both of those are things worth seeing before a batch is pasted.
        spoken_text: spoken === entry.text ? '' : spoken,
        seconds: entry.duration.toFixed(2),
      };
    })
    .sort(
      (a, b) =>
        cmp(a.speaker, b.speaker) || cmp(a.context, b.context) || cmp(a.line_id, b.line_id),
    );

  const header = [
    'line_id',
    'speaker',
    'profile',
    'context',
    'display_text',
    'spoken_text',
    'seconds',
  ];
  const csv = [header, ...rows.map((row) => header.map((key) => String(row[key as keyof typeof row])))]
    .map((cells) => cells.map(quote).join(','))
    .join('\r\n');

  await mkdir(path.dirname(out), { recursive: true });
  // A BOM, because Excel reads a CSV without one as the local codepage and the
  // em dash in "Sss — Sparky!" comes out as mojibake.
  await writeFile(out, `﻿${csv}\r\n`, 'utf8');

  const missed = lines.length - rows.length;
  console.log(
    `dialog audit: ${rows.length} of ${lines.length} authored lines → ${out}` +
      (missed ? ` (${missed} not in the manifest — run npm run voice:build)` : '') +
      (unplaced.length ? `; no context for ${unplaced.join(', ')}` : ''),
  );
}

/** Excel-safe: quote anything with a comma, a quote or a newline in it. */
function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Prop lines and idle chat, straight out of the authored world.
 *
 * A prop carries `line: 'x'` and an npc carries `lines: [...]`, and in both
 * cases the thing saying it is the nearest `id:` above. Read out of the source
 * text rather than by importing the layouts, because what is wanted is the
 * *name in the file* — which is the thing a person looking at the CSV can go and
 * find.
 */
async function scanWorld(): Promise<Record<string, string>> {
  const found: Record<string, string[]> = {};

  for (const file of await walk(WORLD_DIR)) {
    const rows = (await readFile(file, 'utf8')).split(/\r?\n/);
    for (let i = 0; i < rows.length; i++) {
      const single = /\bline:\s*'([^']+)'/.exec(rows[i]!);
      const many = /\blines:\s*\[([^\]]*)\]/.exec(rows[i]!);
      if (!single && !many) continue;

      const owner = ownerAbove(rows, i);
      const kind = single ? 'prop' : 'idle';
      for (const id of single ? [single[1]!] : [...many![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!)) {
        (found[id] ??= []).push(`${kind}: ${owner}`);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(found).map(([id, where]) => [id, [...new Set(where)].sort().join(' / ')]),
  );
}

/** The nearest `id: '...'` at or above this row — the thing that says the line. */
function ownerAbove(rows: string[], from: number): string {
  for (let i = from; i >= 0 && i > from - 10; i--) {
    const match = /\bid:\s*'([^']+)'/.exec(rows[i]!);
    if (match) return match[1]!;
  }
  return '?';
}

/** The book pages, and Hazel's delight as each one is turned. */
function scanBooks(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const book of BOOKS) {
    book.pages.forEach((page, index) => {
      found[page.line] = `book ${book.id}: page ${index + 1}`;
      found[page.cheer] = `book ${book.id}: page ${index + 1} turned`;
    });
  }
  return found;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(at)));
    else if (entry.name.endsWith('.ts')) out.push(at);
  }
  return out;
}

main().catch((error: unknown) => {
  console.error(`voice audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
