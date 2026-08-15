/**
 * Part 1 of the forced-alignment spike: how close is alignment to the truth?
 *
 * Every clip in `public/voice/` was made by edge-tts, which reported its own
 * word boundaries — so for these lines we have ground truth. Align the same
 * audio from the text alone, map it into display-token space exactly as the
 * build does, and diff. That number is the answer to "can Firefly WAVs, which
 * come with no timings at all, be timed by alignment instead".
 *
 *   npx tsx tools/voice/align/spikePerLine.ts [--model mms_fa] [--raw] [--all]
 *
 * `--raw` turns off the aligner's emission-delay correction, which is how that
 * correction's constant was measured in the first place.
 *
 * Offline analysis. Nothing here writes to `public/`, and nothing in the game
 * knows it exists.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { align, isSpeakable, tokenize } from '../align.js';
import type { LineSpec, TimedWord, VoiceManifest } from '../types.js';
import { runAligner, type AlignModel, type AlignResult } from './runAligner.js';

/**
 * Twenty-seven lines chosen to break it if it can be broken, not to flatter it:
 * one-word barks where there is no context to lean on, the longest quest
 * instructions, every speaker, both pitch-shifted kids, the lines whose `say`
 * text differs from what is shown, and all four storybook pages — those run at
 * -22% and slowed prosody is the obvious robustness risk.
 */
const SAMPLE = [
  // seraphina, her own rate (-8%)
  'seraphina_axe', // one word, 0.69 s — the hardest case there is
  'seraphina_malachite', // one long word
  'seraphina_hello', // say differs
  'seraphina_sparky', // say differs, -25%, and an em dash token
  'seraphina_secret', // ten words
  'seraphina_bed', // two sentences
  'seraphina_one_bunny',
  'seraphina_recap_bunnies',
  'seraphina_goodnight', // say differs
  // the storybook pages, -22%
  'book_pip_moon_1',
  'book_pip_moon_2',
  'book_pip_moon_3',
  'book_pip_moon_4',
  // dad, a grown man at -10% and -15Hz
  'dad_bedtime',
  'dad_shed',
  'dad_quest_pen', // say differs, eleven words
  'dad_quest_lure',
  'dad_bunny_coin',
  // hazel, +40Hz — pitched up hard
  'hazel_pretty',
  'hazel_play', // say differs
  'hazel_story_read',
  'hazel_book_best', // say differs
  // sneak, -35Hz — pitched down hard
  'sneak_faeries', // say differs, twelve words
  'sneak_quest_stones', // say differs, fourteen words
  'sneak_press_red',
  'sneak_faeries_real', // say differs
  'sneak_secrets', // say differs
];

/** Above this, the wrong word is lit when a word is spoken. Highlight-visible. */
const VISIBLE_MS = 100;

interface LineError {
  id: string;
  speaker: string;
  words: number;
  /** Per-display-word |aligned start - edge-tts start|, milliseconds. */
  startErrors: number[];
  endErrors: number[];
  /** The same starts, signed, so a systematic bias is visible as one. */
  startBias: number[];
  worstScore: number;
  seconds: number;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const model = (argv.includes('--model')
    ? argv[argv.indexOf('--model') + 1]
    : 'wav2vec2_base') as AlignModel;
  const all = argv.includes('--all');
  const raw = argv.includes('--raw');

  const specs = JSON.parse(
    await readFile(path.join('content', 'voice', 'lines.json'), 'utf8'),
  ) as LineSpec[];
  const manifest = JSON.parse(
    await readFile(path.join('public', 'voice', 'manifest.json'), 'utf8'),
  ) as VoiceManifest;

  const wanted = all ? specs.map((s) => s.id) : SAMPLE;
  const byId = new Map(specs.map((s) => [s.id, s]));
  const timed = new Map(manifest.lines.map((l) => [l.id, l]));

  const jobs = wanted.map((id) => {
    const spec = byId.get(id);
    if (!spec) throw new Error(`no such line "${id}" in lines.json`);
    return { id, audio: path.join('public', 'voice', `${id}.mp3`), text: spec.say ?? spec.text };
  });

  console.log(`aligning ${jobs.length} lines with ${model}${raw ? ' (raw)' : ''}…`);
  const run = await runAligner(jobs, model, raw ? 0 : undefined);

  const errors: LineError[] = [];
  for (const result of run.results) {
    const spec = byId.get(result.id)!;
    const truth = timed.get(result.id)!;
    if (result.error) {
      console.log(`${result.id.padEnd(24)} FAILED  ${result.error}`);
      continue;
    }

    const mapped = toDisplayTokens(spec, result);
    const startErrors: number[] = [];
    const endErrors: number[] = [];
    const startBias: number[] = [];
    for (let i = 0; i < mapped.length; i++) {
      const got = mapped[i]!;
      const want = truth.words[i]!;
      if (want.end <= want.start) continue; // punctuation, never highlighted
      startErrors.push(Math.abs(got.start - want.start) * 1000);
      endErrors.push(Math.abs(got.end - want.end) * 1000);
      startBias.push((got.start - want.start) * 1000);
    }

    errors.push({
      id: result.id,
      speaker: spec.rate === '-22%' ? 'storybook' : spec.speaker,
      words: startErrors.length,
      startErrors,
      endErrors,
      startBias,
      worstScore: Math.min(...result.words!.filter((w) => w.end > w.start).map((w) => w.score)),
      seconds: result.seconds,
    });
  }

  report(`${model} latency ${run.latency}s`, run.loadSeconds, errors);

  const out = path.join(
    'scratch',
    'voice-align',
    `perline-${model}${raw ? '-raw' : ''}${all ? '-all' : ''}.json`,
  );
  await writeFile(out, `${JSON.stringify({ model, run, errors }, null, 1)}\n`);
  console.log(`\nfull dump: ${out}`);
}

/**
 * Spoken word spans → the manifest's display tokens, through the build's own
 * `align()`. This is the fiddly half of the future ingest: the aligner speaks
 * in `say` words, the game highlights `text` tokens, and punctuation-only
 * tokens have to come out with `start === end` so they never light up.
 */
function toDisplayTokens(spec: LineSpec, result: AlignResult): TimedWord[] {
  const spokenTokens = tokenize(spec.say ?? spec.text);
  const spans = result.words!;
  if (spans.length !== spokenTokens.length) {
    throw new Error(`${spec.id}: aligner returned ${spans.length} of ${spokenTokens.length} tokens`);
  }
  // `align()` wants only the tokens a provider would have timed, in order.
  const spoken = spans
    .filter((_, i) => isSpeakable(spokenTokens[i]!))
    .map(({ word, start, end }) => ({ word, start, end }));
  return align(spec.text, spoken, spec.say !== undefined);
}

function report(model: string, loadSeconds: number, errors: LineError[]): void {
  const speakers = [...new Set(errors.map((e) => e.speaker))];

  console.log(`\nper-line, ${model} (start error against edge-tts, ms)\n`);
  console.log(`${'line'.padEnd(24)} ${'spk'.padEnd(10)}  n  median   p95   max  worst score`);
  for (const e of [...errors].sort((a, b) => max(b.startErrors) - max(a.startErrors))) {
    console.log(
      `${e.id.padEnd(24)} ${e.speaker.padEnd(10)} ${String(e.words).padStart(2)} ` +
        `${fmt(median(e.startErrors))} ${fmt(pct(e.startErrors, 95))} ${fmt(max(e.startErrors))}  ` +
        `${e.worstScore.toFixed(2)}`,
    );
  }

  console.log(`\nby speaker (population = words with a real span)\n`);
  console.log(`${'speaker'.padEnd(12)} lines words  median   p95   max  over ${VISIBLE_MS}ms`);
  for (const speaker of [...speakers, 'ALL']) {
    const group = speaker === 'ALL' ? errors : errors.filter((e) => e.speaker === speaker);
    const starts = group.flatMap((e) => e.startErrors);
    const over = starts.filter((v) => v > VISIBLE_MS).length;
    console.log(
      `${speaker.padEnd(12)} ${String(group.length).padStart(5)} ${String(starts.length).padStart(5)} ` +
        `${fmt(median(starts))} ${fmt(pct(starts, 95))} ${fmt(max(starts))}  ` +
        `${over} (${((over / starts.length) * 100).toFixed(1)}%)`,
    );
  }

  const ends = errors.flatMap((e) => e.endErrors);
  const bias = errors.flatMap((e) => e.startBias);
  const seconds = errors.map((e) => e.seconds);
  const audio = errors.length;
  console.log(
    `\nend-of-word error: median ${fmt(median(ends))} p95 ${fmt(pct(ends, 95))} max ${fmt(max(ends))}`,
  );
  console.log(
    `signed start bias (aligned - edge-tts): median ${fmt(median(bias))} ` +
      `p5 ${fmt(pct(bias, 5))} p95 ${fmt(pct(bias, 95))} — a constant here is a fixable one`,
  );
  console.log(
    `cost: model load ${loadSeconds.toFixed(1)}s once, then ` +
      `${(seconds.reduce((a, b) => a + b, 0) / audio).toFixed(2)}s per line ` +
      `(max ${max(seconds).toFixed(2)}s over ${audio} lines)`,
  );
}

const fmt = (v: number) => v.toFixed(0).padStart(6);
const max = (v: number[]) => (v.length ? Math.max(...v) : 0);
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
