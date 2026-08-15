/**
 * Part 2 of the forced-alignment spike: cutting a batch recording into lines.
 *
 * Firefly is a web UI. Matt will paste a paragraph in and get one file back, so
 * the ingest has to find the line boundaries itself. This rehearses that with
 * edge-tts standing in: one continuous utterance of ten sentences — synthesised
 * as a paragraph, never concatenated from existing clips, so the run-on between
 * sentences is real — then aligned, then cut, then each cut clip re-aligned on
 * its own to see whether it survived the knife.
 *
 *   npx tsx tools/voice/align/spikeBatch.ts [--model mms_fa] [--tight]
 *
 * `--tight` speaks the same ten sentences with commas where the full stops
 * were. edge-tts pauses about 0.9 s at a full stop, which makes finding the
 * joins far too easy; a comma buys a fifth of that, and that is the version
 * that says whether the cutter is actually any good.
 *
 * Writes the batch mp3 and the cut wavs to scratch/voice-align/batch/ for
 * anyone who wants to listen to the joins.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EdgeTtsProvider } from '../providers/edgeTts.js';
import type { TimedWord, VoiceBook } from '../types.js';
import { runAligner, type AlignModel } from './runAligner.js';

const OUT = path.join('scratch', 'voice-align', 'batch');

/**
 * Ten sentences in Seraphina's own voice, which is what most of the book is.
 * Deliberately uneven: a two-clause opener, a five-word sentence, an
 * exclamation, and a comma splice — the joins are the thing being tested, so
 * the sentences either side of them should not all sound the same.
 */
const PARAGRAPH = [
  'This is the day I found the secret.',
  'I woke up when the sun came through my window.',
  'Dad was already outside with the bunnies.',
  'I put on my boots and ran down the hill.',
  'The woods were so quiet I could hear my own feet.',
  'A little frog hopped right over my toes!',
  'I followed him all the way to the old well.',
  'Something down there was sparkling.',
  'I leaned over and I saw it.',
  'It was a tiny door, and it was open.',
];

interface CutBoundary {
  after: string;
  gapSeconds: number;
  cutSeconds: number;
  usable: boolean;
}

interface CutLine {
  id: string;
  file: string;
  start: number;
  end: number;
  words: (TimedWord & { score: number })[];
}

interface CutResult {
  model: string;
  audioSeconds: number;
  alignSeconds: number;
  lines: CutLine[];
  boundaries: CutBoundary[];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const model = (argv.includes('--model')
    ? argv[argv.indexOf('--model') + 1]
    : 'wav2vec2_base') as AlignModel;
  const tight = argv.includes('--tight');

  const dir = tight ? path.join(OUT, 'tight') : OUT;
  await mkdir(dir, { recursive: true });
  const batchAudio = path.join(dir, 'batch.mp3');

  const book = JSON.parse(
    await readFile(path.join('content', 'voice', 'voices.json'), 'utf8'),
  ) as VoiceBook;
  const voice = book.speakers.seraphina!;

  // The lines keep their real punctuation either way — it is only what gets
  // *spoken* that changes, which is the same `say`/`text` split the book uses.
  const utterance = tight
    ? `${PARAGRAPH.map((s) => s.replace(/[.!?]$/, '')).join(', ')}.`
    : PARAGRAPH.join(' ');

  console.log(`synthesising ${PARAGRAPH.length} sentences as one${tight ? ' comma-joined' : ''} utterance…`);
  const synth = await new EdgeTtsProvider().synthesize(utterance, voice);
  await writeFile(batchAudio, synth.audio);
  await writeFile(
    path.join(dir, 'batch-truth.json'),
    `${JSON.stringify({ utterance, words: synth.words }, null, 1)}\n`,
  );
  console.log(`  ${(synth.audio.length / 1024).toFixed(0)} KB, ${synth.words.length} words timed`);

  const lines = PARAGRAPH.map((text, i) => ({ id: `batch_${String(i + 1).padStart(2, '0')}`, text }));
  const cut = await runCutter({ audio: batchAudio, lines, outDir: dir }, model);

  reportBoundaries(cut, lines, synth.words);
  await reportRealignment(cut, lines, model);

  await writeFile(path.join(dir, `cuts-${model}.json`), `${JSON.stringify(cut, null, 1)}\n`);
  console.log(`\naudio and dumps: ${dir}`);
}

/**
 * Where the aligner put the joins, against where edge-tts says they are.
 *
 * edge-tts timed every word of the paragraph, so the true gap either side of a
 * sentence boundary is known — and the cut has to land inside it.
 */
function reportBoundaries(cut: CutResult, lines: { text: string }[], truth: TimedWord[]): void {
  // edge-tts times spoken words only, and the paragraph has no punctuation-only
  // tokens, so the counts line up one for one.
  const counts = lines.map((l) => l.text.trim().split(/\s+/).length);
  const trueGaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < counts.length - 1; i++) {
    cursor += counts[i]!;
    trueGaps.push({ start: truth[cursor - 1]!.end, end: truth[cursor]!.start });
  }

  console.log(`\nline boundaries (${cut.audioSeconds}s of audio, aligned in ${cut.alignSeconds}s)\n`);
  console.log(`${'after'.padEnd(10)}  gap(ms)  true(ms)   cut(s)  inside true gap  usable silence`);
  let inside = 0;
  for (let i = 0; i < cut.boundaries.length; i++) {
    const b = cut.boundaries[i]!;
    const t = trueGaps[i]!;
    const within = b.cutSeconds >= t.start && b.cutSeconds <= t.end;
    if (within) inside++;
    console.log(
      `${b.after.padEnd(10)} ${(b.gapSeconds * 1000).toFixed(0).padStart(8)} ` +
        `${((t.end - t.start) * 1000).toFixed(0).padStart(9)} ${b.cutSeconds.toFixed(3).padStart(8)}  ` +
        `${(within ? 'yes' : 'NO').padStart(15)}  ${(b.usable ? 'yes' : 'NO').padStart(14)}`,
    );
  }

  const gaps = cut.boundaries.map((b) => b.gapSeconds * 1000);
  const unusable = cut.boundaries.filter((b) => !b.usable);
  console.log(
    `\ngaps: min ${Math.min(...gaps).toFixed(0)}ms median ${median(gaps).toFixed(0)}ms ` +
      `max ${Math.max(...gaps).toFixed(0)}ms over ${gaps.length} boundaries`,
  );
  console.log(
    `${inside}/${cut.boundaries.length} cuts land inside the true inter-sentence gap; ` +
      `${unusable.length} boundaries had no run of silence to cut in` +
      (unusable.length ? ` (${unusable.map((b) => b.after).join(', ')})` : ''),
  );
}

/**
 * The real test of a cut: does the clip stand on its own?
 *
 * Re-aligning each piece against its own sentence, with no neighbours to lean
 * on, both checks the audio survived and shows what the ingest would get if it
 * cut first and aligned afterwards.
 */
async function reportRealignment(
  cut: CutResult,
  lines: { id: string; text: string }[],
  model: AlignModel,
): Promise<void> {
  const jobs = cut.lines.map((l, i) => ({ id: l.id, audio: l.file, text: lines[i]!.text }));
  const run = await runAligner(jobs, model);

  console.log(`\nre-aligning each cut clip on its own (start drift vs the batch pass, ms)\n`);
  console.log(`${'clip'.padEnd(10)} words  length   median   p95   max  worst score`);
  const all: number[] = [];
  for (let i = 0; i < run.results.length; i++) {
    const result = run.results[i]!;
    const batch = cut.lines[i]!;
    if (result.error) {
      console.log(`${result.id.padEnd(10)} FAILED  ${result.error}`);
      continue;
    }
    const drift = result.words!.map((w, j) => Math.abs(w.start - batch.words[j]!.start) * 1000);
    all.push(...drift);
    console.log(
      `${result.id.padEnd(10)} ${String(drift.length).padStart(5)} ` +
        `${(batch.end - batch.start).toFixed(2).padStart(7)}s ` +
        `${median(drift).toFixed(0).padStart(8)} ${pct(drift, 95).toFixed(0).padStart(5)} ` +
        `${Math.max(...drift).toFixed(0).padStart(5)}  ${Math.min(...result.words!.map((w) => w.score)).toFixed(2)}`,
    );
  }
  console.log(
    `\nall ${all.length} words: median ${median(all).toFixed(0)}ms ` +
      `p95 ${pct(all, 95).toFixed(0)}ms max ${Math.max(...all).toFixed(0)}ms`,
  );
}

async function runCutter(spec: unknown, model: AlignModel): Promise<CutResult> {
  const python =
    process.env.VOICE_ALIGN_PYTHON ??
    path.join(
      'tools',
      'voice',
      'align',
      '.venv',
      ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']),
    );
  const child = spawn(python, [path.join('tools', 'voice', 'align', 'cutter.py'), '-', '--model', model], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stdin.end(JSON.stringify(spec));
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`cutter.py exited ${code}`);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as CutResult;
}

const median = (v: number[]) => pct(v, 50);

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
