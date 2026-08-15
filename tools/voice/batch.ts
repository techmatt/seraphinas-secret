/**
 * `npm run voice:batch` — cut paste-ready batch files for Adobe Firefly.
 *
 * Firefly has no API. Matt records by hand: paste text into a web page, press
 * a button, download a WAV. The one thing that must never happen in that loop
 * is Matt composing the text himself, because the ingest cuts the recording
 * apart by aligning it against exactly the string this tool wrote — a stray
 * edit in the paste box and the clips come out shifted by a line.
 *
 * So this emits two files per batch and nothing else:
 *
 *   voice-batches/dad-01.txt    the spoken text, one line per line of dialog,
 *                               nothing else in the file, ready to select-all
 *   voice-batches/dad-01.json   the sidecar: which line ids, in order, what
 *                               each hashes to, which profile, what day
 *
 * Batches are never mixed: one speaker, one voice profile, because that is what
 * the Firefly UI is set up for at the moment of pasting. Coverage-first is the
 * default — the lines with no clip yet — and a batch of one line is legal and
 * ordinary, since that is how a single edited line gets re-recorded.
 *
 *   npm run voice:batch                       every line lacking a clip
 *   npm run voice:batch -- --speaker dad      one speaker's gaps
 *   npm run voice:batch -- --profile storybook
 *   npm run voice:batch -- --ids a,b,c        exactly these, gaps or not
 *   npm run voice:batch -- --stale            only lines whose text has changed
 *   npm run voice:batch -- --all              everything, gaps or not
 *   npm run voice:batch -- --again            re-cut lines already waiting in a batch
 *   npm run voice:batch -- --size 15 --dry-run
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BATCH_DIR,
  DEFAULT_BATCH_SIZE,
  SIDECAR_VERSION,
  batchName,
  batchTextPath,
  clipStateFor,
  profileFor,
  readClipIndex,
  readJson,
  readLines,
  readProfiles,
  sidecarPath,
  spokenFor,
  spokenHash,
  stringify,
  type BatchSidecar,
  type ProfileBook,
} from './firefly.js';
import type { LineSpec } from './types.js';

/** One batch's worth of candidates: never more than one speaker, never more than one profile. */
interface Group {
  speaker: string;
  profile: string;
  lines: LineSpec[];
}

interface Options {
  dir: string;
  size: number;
  speaker?: string;
  profile?: string;
  ids?: string[];
  /** What to include: gaps only (default), stale only, or everything. */
  select: 'missing' | 'stale' | 'all';
  /** Cut a line again even though an un-recorded batch is already waiting for it. */
  again: boolean;
  dryRun: boolean;
  /** Today, as the sidecar records it. Overridable so tests are reproducible. */
  date: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    dir: BATCH_DIR,
    size: DEFAULT_BATCH_SIZE,
    select: 'missing',
    again: false,
    dryRun: false,
    date: new Date().toISOString().slice(0, 10),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };

    if (arg === '--dir') opts.dir = value();
    else if (arg === '--size') opts.size = Number(value());
    else if (arg === '--speaker') opts.speaker = value();
    else if (arg === '--profile') opts.profile = value();
    else if (arg === '--ids') opts.ids = value().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--stale') opts.select = 'stale';
    else if (arg === '--all') opts.select = 'all';
    else if (arg === '--again') opts.again = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--date') opts.date = value();
    else throw new Error(`unknown argument ${arg}`);
  }

  if (!Number.isInteger(opts.size) || opts.size < 1) throw new Error('--size wants a positive integer');
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const lines = await readLines();
  const profiles = await readProfiles();
  const index = await readClipIndex();

  // Lines already sitting in a batch nobody has recorded yet. Cutting them a
  // second time is how Matt ends up reading the same twelve lines twice, so
  // they are held back unless he asks for them by id or says --again.
  const pending = opts.again || opts.ids ? new Set<string>() : await pendingLines(opts.dir, index);

  const chosen = lines.filter((line) => {
    if (opts.ids) return opts.ids.includes(line.id);
    if (opts.speaker && line.speaker !== opts.speaker) return false;
    if (opts.profile && profileFor(line, profiles) !== opts.profile) return false;
    if (pending.has(line.id)) return false;
    if (opts.select === 'all') return true;
    return clipStateFor(line, index).state === (opts.select === 'stale' ? 'stale' : 'missing');
  });

  if (opts.ids) {
    const found = new Set(chosen.map((l) => l.id));
    const unknown = opts.ids.filter((id) => !found.has(id));
    if (unknown.length) throw new Error(`no such line id: ${unknown.join(', ')}`);
  }

  if (!chosen.length) {
    console.log(
      pending.size
        ? `nothing new to cut — ${pending.size} lines are already waiting in batch files here, unrecorded`
        : 'nothing to record — every line asked for already has a matching clip',
    );
    return;
  }
  if (pending.size) console.log(`(holding back ${pending.size} lines already waiting in an unrecorded batch)`);

  // One speaker and one profile per batch: that pair is what Firefly's UI is
  // set to when the paste happens, and getting it wrong is a whole re-record.
  const groups = new Map<string, Group>();
  for (const line of chosen) {
    const profile = profileFor(line, profiles);
    const key = `${line.speaker}/${profile}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { speaker: line.speaker, profile, lines: [] }));
    group.lines.push(line);
  }

  await mkdir(opts.dir, { recursive: true });
  const taken = new Set((await readdir(opts.dir).catch(() => [])).map((f) => path.parse(f).name));

  let batches = 0;
  let written = 0;
  for (const { speaker, profile, lines: group } of groups.values()) {
    for (let i = 0; i < group.length; i += opts.size) {
      const slice = group.slice(i, i + opts.size);
      const name = nextName(speaker, profile, taken);
      taken.add(name);
      batches++;
      written += slice.length;
      if (!opts.dryRun) await writeBatch(opts, name, speaker, profile, profiles, slice);
      console.log(
        `${opts.dryRun ? 'would write' : 'wrote'} ${name.padEnd(22)} ` +
          `${String(slice.length).padStart(2)} lines  ${slice.map((l) => l.id).join(' ')}`,
      );
    }
  }

  console.log(
    `\n${batches} batch${batches === 1 ? '' : 'es'}, ${written} of ${lines.length} lines, in ${opts.dir}` +
      (opts.dryRun ? ' (dry run — nothing written)' : ''),
  );
  if (!opts.dryRun) console.log(`next: ${path.join(opts.dir, 'README.md')} has the recording loop`);
}

/**
 * Line ids sitting in a batch file here that has produced no clip yet.
 *
 * The hash is compared too: a batch cut before the text was edited is not
 * waiting for anything useful, so its lines are free to be cut again.
 */
async function pendingLines(dir: string, index: Awaited<ReturnType<typeof readClipIndex>>): Promise<Set<string>> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'));
  const waiting = new Set<string>();
  for (const file of files) {
    const name = path.parse(file).name;
    if (index.batches[name]) continue;
    const sidecar = await readJson<BatchSidecar>(path.join(dir, file)).catch(() => null);
    for (const line of sidecar?.lines ?? []) {
      if (index.clips[line.id]?.spokenHash !== line.spokenHash) waiting.add(line.id);
    }
  }
  return waiting;
}

/** The first free number for this speaker and profile, never reusing one. */
function nextName(speaker: string, profile: string, taken: Set<string>): string {
  for (let i = 1; ; i++) {
    const name = batchName(speaker, profile, i);
    if (!taken.has(name)) return name;
  }
}

async function writeBatch(
  opts: Options,
  name: string,
  speaker: string,
  profile: string,
  profiles: ProfileBook,
  group: LineSpec[],
): Promise<void> {
  const settings = profiles.profiles[profile];
  if (!settings) throw new Error(`profiles.json has no profile "${profile}"`);

  const spoken = group.map(spokenFor);

  // Nothing but the text: no ids, no comments, no header. It exists to be
  // selected whole and pasted into a box, and anything else in it gets read
  // out loud in the recording.
  await writeFile(batchTextPath(opts.dir, name), `${spoken.join('\n')}\n`, 'utf8');

  const sidecar: BatchSidecar = {
    version: SIDECAR_VERSION,
    name,
    speaker,
    profile,
    profileSettings: settings,
    created: opts.date,
    text: `${name}.txt`,
    lines: group.map((line, i) => ({
      id: line.id,
      spoken: spoken[i]!,
      spokenHash: spokenHash(spoken[i]!),
    })),
  };
  await writeFile(sidecarPath(opts.dir, name), stringify(sidecar), 'utf8');
}

main().catch((error: unknown) => {
  console.error(`voice batch failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
