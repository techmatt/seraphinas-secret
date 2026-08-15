/**
 * `npm run voice:ingest` — a downloaded batch recording becomes committed clips.
 *
 * This is the other end of Matt's manual loop. He pasted `dad-01.txt` into
 * Adobe Firefly, downloaded the WAV, and saved it as `dad-01.wav` beside the
 * batch file. From here it is all machinery: align the recording against the
 * exact text the generator wrote, cut it into one clip per line, trim, level
 * and encode each one, and record enough provenance that a clip can be trusted
 * or disowned months later without listening to it.
 *
 *   npm run voice:ingest                    every batch with audio not yet taken
 *   npm run voice:ingest -- dad-01          one batch by name
 *   npm run voice:ingest -- --force         redo batches already ingested
 *   npm run voice:ingest -- --fade 0.012    a longer join, for an ear check
 *
 * **Latest ingest wins.** The clip store is keyed by line id, so re-recording
 * one line as a batch of one overwrites whatever was there. That is the patch
 * mechanism and there is no other one.
 *
 * What this deliberately does *not* do is decide whether a clip still matches
 * its line. It records the text that was spoken; `build.ts` compares. Alignment
 * will fit the wrong words to the right audio and report itself confident, so
 * the hash is the only guard there is.
 */

import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BATCH_DIR,
  CLIP_DIR,
  CLIP_INDEX,
  CLIP_INDEX_VERSION,
  PEAK_CEILING_DBFS,
  REVIEW_SCORE,
  SIDECAR_VERSION,
  TARGET_DBFS,
  readClipIndex,
  readJson,
  readLines,
  sidecarPath,
  sortedByKey,
  spokenFor,
  stringify,
  type BatchSidecar,
  type ClipRecord,
  type ScoredWord,
} from './firefly.js';

/** Anything libsndfile decodes, most-likely-first. Firefly hands out WAV. */
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg', '.aiff', '.aif', '.w64'];

interface Options {
  dir: string;
  outDir: string;
  names: string[];
  force: boolean;
  fade?: number;
  model: string;
  date: string;
}

/** What `ingest.py` hands back. Times in seconds, levels in dBFS. */
interface IngestResult {
  model: string;
  latency: number;
  sourceRate: number;
  sourceChannels: number;
  clipRate: number;
  audioSeconds: number;
  loadSeconds: number;
  alignSeconds: number;
  targetDbfs: number;
  fadeSeconds: number;
  boundaries: { after: string; gapSeconds: number; cutSeconds: number; usable: boolean }[];
  lines: {
    id: string;
    file: string;
    bytes: number;
    seconds: number;
    cutStart: number;
    cutEnd: number;
    trimmedHead: number;
    trimmedTail: number;
    usableGap: boolean;
    speechDbfs: number;
    gainDb: number;
    peakDbfs: number;
    words: ScoredWord[];
  }[];
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    dir: BATCH_DIR,
    outDir: CLIP_DIR,
    names: [],
    force: false,
    model: 'wav2vec2_base',
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
    else if (arg === '--out') opts.outDir = value();
    else if (arg === '--force') opts.force = true;
    else if (arg === '--fade') opts.fade = Number(value());
    else if (arg === '--model') opts.model = value();
    else if (arg === '--date') opts.date = value();
    else if (arg.startsWith('--')) throw new Error(`unknown argument ${arg}`);
    else opts.names.push(path.parse(arg).name);
  }

  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const lines = await readLines();
  const spoken = new Map(lines.map((line) => [line.id, spokenFor(line)]));
  const index = await readClipIndex();

  const names = opts.names.length ? opts.names : await allBatches(opts.dir);
  if (!names.length) {
    console.log(`no batches in ${opts.dir} — run npm run voice:batch first`);
    return;
  }

  await mkdir(opts.outDir, { recursive: true });

  let ingested = 0;
  let clips = 0;
  for (const name of names) {
    const sidecar = await readJson<BatchSidecar>(sidecarPath(opts.dir, name)).catch(() => null);
    if (!sidecar) {
      console.log(`${name}: no sidecar — skipped`);
      continue;
    }
    if (sidecar.version !== SIDECAR_VERSION) {
      throw new Error(`${name}: sidecar version ${sidecar.version}, this tool speaks ${SIDECAR_VERSION}`);
    }

    const audio = await findAudio(opts.dir, name);
    if (!audio) {
      if (opts.names.length) console.log(`${name}: no recording yet (looked for ${name}.wav)`);
      continue;
    }

    const stats = await stat(audio);
    const already = index.batches[name];
    if (
      !opts.force &&
      already &&
      already.audioBytes === stats.size &&
      already.audioMtimeMs === Math.round(stats.mtimeMs)
    ) {
      console.log(`${name}: unchanged since ${already.ingested} — skipped (--force to redo)`);
      continue;
    }

    const result = await runIngest(opts, audio, sidecar);
    ingested++;
    clips += report(name, sidecar, result, spoken);

    for (let i = 0; i < sidecar.lines.length; i++) {
      const entry = sidecar.lines[i]!;
      const line = result.lines[i]!;
      const scores = line.words.filter((w) => w.end > w.start).map((w) => w.score);
      index.clips[entry.id] = {
        provider: 'firefly',
        batch: name,
        indexInBatch: i,
        speaker: sidecar.speaker,
        profile: sidecar.profile,
        voice: sidecar.profileSettings.voice,
        // The hash of what was RECORDED, not of what the line says today. The
        // build compares the two; that comparison is the whole stale check.
        spoken: entry.spoken,
        spokenHash: entry.spokenHash,
        audio: path.basename(line.file),
        bytes: line.bytes,
        seconds: line.seconds,
        ingested: opts.date,
        align: {
          model: result.model,
          latency: result.latency,
          minScore: scores.length ? round(Math.min(...scores)) : 0,
          medianScore: round(median(scores)),
          review: line.words
            .filter((w) => w.end > w.start && w.score <= REVIEW_SCORE)
            .map((w) => ({ word: w.word, score: w.score })),
        },
        cut: {
          startSeconds: line.cutStart,
          endSeconds: line.cutEnd,
          trimmedHead: line.trimmedHead,
          trimmedTail: line.trimmedTail,
          usableGap: line.usableGap,
        },
        loudness: {
          targetDbfs: result.targetDbfs,
          gainDb: line.gainDb,
          peakDbfs: line.peakDbfs,
          speechDbfs: line.speechDbfs,
        },
        words: line.words,
      } satisfies ClipRecord;
    }

    index.batches[name] = {
      ingested: opts.date,
      audio: path.basename(audio),
      audioBytes: stats.size,
      audioMtimeMs: Math.round(stats.mtimeMs),
      sourceRate: result.sourceRate,
      lineIds: sidecar.lines.map((l) => l.id),
    };
  }

  if (!ingested) {
    console.log('nothing to ingest');
    return;
  }

  index.version = CLIP_INDEX_VERSION;
  index.clips = sortedByKey(index.clips);
  index.batches = sortedByKey(index.batches);
  await writeFile(CLIP_INDEX, stringify(index), 'utf8');

  console.log(
    `\n${ingested} batch${ingested === 1 ? '' : 'es'}, ${clips} clips, ` +
      `${Object.keys(index.clips).length} of ${lines.length} lines now recorded`,
  );
  console.log('next: npm run voice:build, then npm run voice:status');
}

/**
 * One batch through `ingest.py`.
 *
 * Every tunable is passed rather than defaulted on the Python side, so the
 * numbers live in `firefly.ts` and there is one place to change them.
 */
async function runIngest(opts: Options, audio: string, sidecar: BatchSidecar): Promise<IngestResult> {
  const spec = {
    audio,
    outDir: opts.outDir,
    model: opts.model,
    targetDbfs: TARGET_DBFS,
    peakCeilingDbfs: PEAK_CEILING_DBFS,
    ...(opts.fade === undefined ? {} : { fadeSeconds: opts.fade }),
    // The text the generator wrote, verbatim: the cut points are found by
    // aligning against exactly this, so a paraphrase here shifts every clip.
    lines: sidecar.lines.map((l) => ({ id: l.id, text: l.spoken })),
  };

  const python =
    process.env.VOICE_ALIGN_PYTHON ??
    path.join(
      'tools',
      'voice',
      'align',
      '.venv',
      ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']),
    );
  const child = spawn(python, [path.join('tools', 'voice', 'align', 'ingest.py'), '-'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stdin.end(JSON.stringify(spec));

  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`ingest.py exited ${code} — is the venv built? see align/README.md`);

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as IngestResult;
}

/** One table per batch: what came out, and everything worth a second look. */
function report(
  name: string,
  sidecar: BatchSidecar,
  result: IngestResult,
  spoken: Map<string, string>,
): number {
  console.log(
    `\n${name} — ${sidecar.speaker}/${sidecar.profile}, ${result.sourceRate} Hz ` +
      `${result.sourceChannels === 1 ? 'mono' : `${result.sourceChannels}ch`} → ${result.clipRate} Hz mono mp3, ` +
      `${result.audioSeconds}s aligned in ${result.alignSeconds}s`,
  );
  console.log(`${'line'.padEnd(24)} secs   gain  peak  worst  trimmed   review`);

  for (let i = 0; i < result.lines.length; i++) {
    const line = result.lines[i]!;
    const scores = line.words.filter((w) => w.end > w.start).map((w) => w.score);
    const worst = scores.length ? Math.min(...scores) : 0;
    const review = line.words.filter((w) => w.end > w.start && w.score <= REVIEW_SCORE);
    console.log(
      `${line.id.padEnd(24)} ${line.seconds.toFixed(2).padStart(4)} ` +
        `${line.gainDb.toFixed(1).padStart(6)} ${line.peakDbfs.toFixed(1).padStart(5)} ` +
        `${worst.toFixed(2).padStart(6)} ` +
        `${`${(line.trimmedHead * 1000).toFixed(0)}/${(line.trimmedTail * 1000).toFixed(0)}ms`.padStart(9)}   ` +
        (review.length ? review.map((w) => `${w.word} ${w.score.toFixed(2)}`).join(', ') : '') +
        (line.usableGap ? '' : '  NO SILENT GAP AT A CUT'),
    );
  }

  // A line whose text moved after the batch was cut is recorded correctly and
  // stale on arrival — worth saying here rather than letting the build find it.
  const drifted = sidecar.lines.filter((l) => spoken.get(l.id) !== l.spoken);
  for (const line of drifted) {
    console.log(
      `  ! ${line.id} was edited after this batch was cut — the clip is stale on arrival, re-batch it`,
    );
  }

  return result.lines.length;
}

/** Batch names in the folder, in the order they were cut. */
async function allBatches(dir: string): Promise<string[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  return files.filter((f) => f.endsWith('.json')).map((f) => path.parse(f).name).sort();
}

async function findAudio(dir: string, name: string): Promise<string | null> {
  for (const extension of AUDIO_EXTENSIONS) {
    const file = path.join(dir, `${name}${extension}`);
    if (await stat(file).then(() => true, () => false)) return file;
  }
  return null;
}

const round = (n: number) => Math.round(n * 100) / 100;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

main().catch((error: unknown) => {
  console.error(`voice ingest failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
