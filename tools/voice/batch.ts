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
 * Batches are never mixed: one voice profile, because that is what the Firefly
 * UI is set up for at the moment of pasting. Coverage-first is the default —
 * the lines with no clip yet — and a batch of one line is legal and ordinary,
 * since that is how a single edited line gets re-recorded.
 *
 *   npm run voice:batch                       every line lacking a clip
 *   npm run voice:batch -- --speaker dad      one speaker's gaps
 *   npm run voice:batch -- --profile storybook
 *   npm run voice:batch -- --ids a,b,c        exactly these, gaps or not
 *   npm run voice:batch -- --stale            only lines whose text has changed
 *   npm run voice:batch -- --all              everything, gaps or not
 *   npm run voice:batch -- --again            re-cut lines already waiting in a batch
 *   npm run voice:batch -- --per-profile      one file per profile, whole script
 *   npm run voice:batch -- --size 15 --dry-run
 *
 * `--per-profile` is the sit-down-and-record-the-whole-thing mode: every line of
 * a profile in one file named after that profile — `dad.txt`, `storybook.txt` —
 * with no numbering and no size limit, because the unit of work is a recording
 * session and not a dozen lines. It implies `--all`. If a single paste turns out
 * to be more than Firefly will speak in one go, that is what `--size` is for.
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

/** One batch's worth of candidates: never more than one profile. */
interface Group {
  /** The one speaker in it, or `mixed` — see `writeBatch`. */
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
  /** One file per profile, named after it, holding all of it. Implies `--all`. */
  perProfile: boolean;
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
    perProfile: false,
    dryRun: false,
    date: new Date().toISOString().slice(0, 10),
  };
  let sized = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };

    if (arg === '--dir') opts.dir = value();
    else if (arg === '--size') ((opts.size = Number(value())), (sized = true));
    else if (arg === '--speaker') opts.speaker = value();
    else if (arg === '--profile') opts.profile = value();
    else if (arg === '--ids') opts.ids = value().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--stale') opts.select = 'stale';
    else if (arg === '--all') opts.select = 'all';
    else if (arg === '--again') opts.again = true;
    else if (arg === '--per-profile') opts.perProfile = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--date') opts.date = value();
    else throw new Error(`unknown argument ${arg}`);
  }

  if (!Number.isInteger(opts.size) || opts.size < 1) throw new Error('--size wants a positive integer');

  // A whole profile is the point of the mode, so it takes everything and does
  // not split — unless a --size was actually typed, which is the escape hatch
  // for a Firefly that will not swallow a thirty-line paste.
  if (opts.perProfile) {
    if (opts.select === 'missing') opts.select = 'all';
    if (!sized) opts.size = Number.MAX_SAFE_INTEGER;
    opts.again = true;
  }

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

  // One profile per batch: the profile is what Firefly's UI is set to when the
  // paste happens, and getting it wrong is a whole re-record. Normally the
  // speaker is split on too, because a speaker is a person and a session is a
  // person; `--per-profile` drops that, since the Firefly setup is the same
  // either way and the point of the mode is one file to paste.
  const groups = new Map<string, Group>();
  for (const line of chosen) {
    const profile = profileFor(line, profiles);
    const key = opts.perProfile ? profile : `${line.speaker}/${profile}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { speaker: line.speaker, profile, lines: [] }));
    else if (group.speaker !== line.speaker) group.speaker = MIXED_SPEAKER;
    group.lines.push(line);
  }

  await mkdir(opts.dir, { recursive: true });
  const taken = new Set((await readdir(opts.dir).catch(() => [])).map((f) => path.parse(f).name));

  let batches = 0;
  let written = 0;
  for (const { speaker, profile, lines: group } of groups.values()) {
    // Named after the profile, unnumbered, one per profile — so a re-cut lands
    // on the same file rather than accumulating `dad-02`, `dad-03`. Splitting
    // is the exception here, and only `--size` asks for it.
    const single = opts.perProfile && group.length <= opts.size;
    for (let i = 0; i < group.length; i += opts.size) {
      const slice = group.slice(i, i + opts.size);
      const name = single ? profile : nextName(speaker, profile, taken);
      if (single && taken.has(name)) console.log(`(${name} already existed here — overwritten)`);
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

/** A batch holding more than one speaker, which only `--per-profile` can make. */
const MIXED_SPEAKER = 'mixed';

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
  //
  // A blank line between two lines, because the cut between two clips goes at
  // the quietest point in the gap and the gap has to exist. It costs nothing
  // when Firefly would have paused anyway, and it is the documented fix when it
  // would not have — so it is how every batch is written rather than a remedy
  // Matt applies by hand after a run-together comes back. The ingest never
  // reads this file, only the sidecar, so the spacing changes no timings.
  await writeFile(batchTextPath(opts.dir, name), `${spoken.join('\n\n')}\n`, 'utf8');

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
      // Per line as well as per batch: a whole-profile batch can hold two
      // speakers, and the clip's provenance should say which one said it.
      speaker: line.speaker,
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
