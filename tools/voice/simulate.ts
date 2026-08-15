/**
 * `npm run voice:simulate` — stand in for Matt at the Firefly web page.
 *
 * The whole ingest depends on a thing nobody has yet: a single WAV containing
 * a batch of lines read one after another, with no marks in it saying where
 * one ends. This makes one. It takes a generated batch file, speaks the entire
 * thing as ONE continuous edge-tts utterance — never ten clips concatenated,
 * because the run-on between sentences is exactly what the cutter has to cope
 * with — and writes it as `<batch>.wav` where the ingest expects the download.
 *
 *   npm run voice:simulate                 every batch with no recording yet
 *   npm run voice:simulate -- dad-01       one batch
 *   npm run voice:simulate -- --rate 48000
 *
 * The default rate is 44.1 kHz on purpose: it is not the aligner's 16 kHz and
 * not the clips' 24 kHz, so a simulated ingest exercises both resamplings. What
 * this cannot rehearse is Firefly's actual voice, its actual pause between two
 * pasted lines, or its actual sample rate — see the batch folder's README for
 * what to check on the first real recording.
 *
 * Content-time, and a rehearsal at that: nothing here is part of the real loop.
 */

import { spawn } from 'node:child_process';
import { readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BATCH_DIR, readJson, type BatchSidecar } from './firefly.js';
import { EdgeTtsProvider } from './providers/edgeTts.js';
import type { VoiceBook } from './types.js';

interface Options {
  dir: string;
  names: string[];
  rate: number;
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { dir: BATCH_DIR, names: [], rate: 44_100, force: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--dir') opts.dir = argv[++i] ?? '';
    else if (arg === '--rate') opts.rate = Number(argv[++i]);
    else if (arg === '--force') opts.force = true;
    else if (arg.startsWith('--')) throw new Error(`unknown argument ${arg}`);
    else opts.names.push(path.parse(arg).name);
  }

  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const book = await readJson<VoiceBook>(path.join('content', 'voice', 'voices.json'));
  const provider = new EdgeTtsProvider();

  const names = opts.names.length
    ? opts.names
    : (await readdir(opts.dir).catch(() => [] as string[]))
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.parse(f).name)
        .sort();

  for (const name of names) {
    const wav = path.join(opts.dir, `${name}.wav`);
    if (!opts.force && (await exists(wav))) {
      console.log(`${name}: already recorded — skipped (--force to redo)`);
      continue;
    }

    const sidecar = await readJson<BatchSidecar>(path.join(opts.dir, `${name}.json`));
    const voice = book.speakers[sidecar.speaker];
    if (!voice) throw new Error(`${name}: voices.json has no speaker "${sidecar.speaker}"`);

    // One utterance, joined by a single space. Each line already ends in
    // terminal punctuation, which is what buys the pause the cutter cuts in.
    const utterance = sidecar.lines.map((l) => l.spoken).join(' ');
    const synth = await provider.synthesize(utterance, voice);

    const scratch = path.join(opts.dir, `${name}.simulated.mp3`);
    await writeFile(scratch, synth.audio);
    const converted = await toWav(scratch, wav, opts.rate);
    await unlink(scratch);

    console.log(
      `${name}: ${sidecar.lines.length} lines, ${converted.seconds}s, ` +
        `${converted.rate} Hz ${converted.channels === 1 ? 'mono' : 'stereo'} → ${wav}`,
    );
  }

  console.log('\nnext: npm run voice:ingest');
}

interface Converted {
  rate: number;
  channels: number;
  seconds: number;
}

async function toWav(source: string, target: string, rate: number): Promise<Converted> {
  const python =
    process.env.VOICE_ALIGN_PYTHON ??
    path.join(
      'tools',
      'voice',
      'align',
      '.venv',
      ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']),
    );
  const child = spawn(
    python,
    [path.join('tools', 'voice', 'align', 'towav.py'), source, target, '--rate', String(rate)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );

  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`towav.py exited ${code}`);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Converted;
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

main().catch((error: unknown) => {
  console.error(`voice simulate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
