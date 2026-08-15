/**
 * The node side of the forced aligner — spawn `aligner.py`, get word spans back.
 *
 * The aligner is Python because torchaudio's CTC forced alignment is; the rest
 * of the voice pipeline is TypeScript and stays that way. This module is the
 * seam, and it is written to be the one the future Firefly ingest calls: hand
 * it every clip in the batch at once, because loading the acoustic model costs
 * several seconds and aligning a line costs a fraction of one.
 *
 * What comes back is spans over the *spoken* words. Turning those into the
 * manifest's display-token space is `../align.ts` — do not do it here.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

import type { TimedWord } from '../types.js';

const HERE = path.join('tools', 'voice', 'align');

/** Set `VOICE_ALIGN_PYTHON` to point at a different interpreter. */
function interpreter(): string {
  const fromEnv = process.env.VOICE_ALIGN_PYTHON;
  if (fromEnv) return fromEnv;
  return process.platform === 'win32'
    ? path.join(HERE, '.venv', 'Scripts', 'python.exe')
    : path.join(HERE, '.venv', 'bin', 'python');
}

export interface AlignJob {
  id: string;
  /** Path to a wav or mp3, readable by libsndfile. */
  audio: string;
  /** Exactly what is spoken in it — the `say` form where there is one. */
  text: string | string[];
}

export interface AlignResult {
  id: string;
  /** Absent when `error` is set. Scores ride along for confidence reporting. */
  words?: (TimedWord & { score: number })[];
  error?: string;
  /** Wall clock for this line alone, model load excluded. */
  seconds: number;
}

export interface AlignRun {
  model: string;
  /** Emission-delay correction applied, in seconds. */
  latency: number;
  loadSeconds: number;
  results: AlignResult[];
}

export type AlignModel = 'wav2vec2_base' | 'mms_fa';

/** `latency` overrides the model's built-in correction; 0 gives raw CTC spans. */
export async function runAligner(
  jobs: AlignJob[],
  model: AlignModel,
  latency?: number,
): Promise<AlignRun> {
  const args = [path.join(HERE, 'aligner.py'), '-', '--model', model];
  if (latency !== undefined) args.push('--latency', String(latency));

  const child = spawn(interpreter(), args, { stdio: ['pipe', 'pipe', 'inherit'] });

  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stdin.end(JSON.stringify(jobs));

  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`aligner.py exited ${code} — is the venv built? see README.md`);

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as AlignRun;
}
