/**
 * `npm run voice:inspect` — check generated voice without listening to it.
 *
 * Two questions this answers, both of which cost a human a careful listen:
 *
 * 1. Do the word boundaries match the audio? Reported as a per-word lag: how
 *    long after a word's reported start the audio actually gets loud. Positive
 *    means the highlight lights up early.
 * 2. Is a phonics line making the letter's *sound* or saying its *name*?
 *    /s/ is unvoiced hiss — a very high zero-crossing rate. Any vowel is voiced
 *    and low. So a sustained "sss" is one unbroken S segment, the letter name
 *    "ess" is V then S, and "ess ess ess" is V S V S V S. The shape column
 *    shows those segments for the first word with their durations.
 *
 * Chromium does the mp3 decoding, since it is already installed for Playwright
 * and this machine has no ffmpeg.
 */

import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { TimedWord, VoiceManifest } from './types.js';

/** Frames quieter than this share of the clip's peak count as silence. */
const SILENCE = 0.05;

interface LineReport {
  audioSeconds: number;
  /** Silence after the last word. Every edge-tts clip has a surprising amount. */
  tail: number;
  /** Share of the clip's energy that falls inside some word's window. */
  coverage: number;
  lags: (number | null)[];
  shape: string;
}

async function main(): Promise<void> {
  const dir = process.argv[2] ?? path.join('public', 'voice');
  const manifest = JSON.parse(
    await readFile(path.join(dir, 'manifest.json'), 'utf8'),
  ) as VoiceManifest;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    // tsx compiles with esbuild's keepNames, which wraps functions in a `__name`
    // helper that does not travel into the page with the source text.
    await page.evaluate(() => {
      (globalThis as { __name?: unknown }).__name ??= <T>(fn: T) => fn;
    });

    const lags: number[] = [];

    for (const line of manifest.lines) {
      const bytes = await readFile(path.join(dir, path.basename(line.audio)));
      const timed = line.words.filter((w) => w.end > w.start);
      const report = await page.evaluate(measure, [
        bytes.toString('base64'),
        timed,
        SILENCE,
      ] as [string, TimedWord[], number]);

      lags.push(...report.lags.filter((l): l is number => l !== null));
      console.log(
        `${line.id.padEnd(20)} ${report.audioSeconds.toFixed(2)}s  tail ${report.tail.toFixed(2)}s  ` +
          `coverage ${report.coverage.toFixed(2)}  ${report.shape.padEnd(28)}  ` +
          `lags [${report.lags.map((l) => (l === null ? 'silent' : l.toFixed(3))).join(' ')}]`,
      );
    }

    lags.sort((a, b) => a - b);
    const mean = lags.reduce((a, b) => a + b, 0) / lags.length;
    console.log(
      `\n${lags.length} words: mean lag ${mean.toFixed(3)}s, median ${lags[lags.length >> 1]!.toFixed(3)}s, ` +
        `max ${lags[lags.length - 1]!.toFixed(3)}s, ` +
        `${lags.filter((l) => Math.abs(l) <= 0.05).length} within 50ms`,
    );
  } finally {
    await browser.close();
  }
}

/** Runs inside the page, where there is an audio decoder. */
async function measure([b64, words, silence]: [string, TimedWord[], number]): Promise<LineReport> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const buf = await new OfflineAudioContext(1, 1024, 24000).decodeAudioData(
    bytes.buffer as ArrayBuffer,
  );
  const sr = buf.sampleRate;
  const pcm = buf.getChannelData(0);

  const HOP = Math.round(sr * 0.005);
  const rms: number[] = [];
  const zcr: number[] = [];
  for (let i = 0; i + HOP <= pcm.length; i += HOP) {
    let energy = 0;
    let crossings = 0;
    for (let j = 1; j < HOP; j++) {
      const s = pcm[i + j]!;
      energy += s * s;
      if (s >= 0 !== pcm[i + j - 1]! >= 0) crossings++;
    }
    rms.push(Math.sqrt(energy / HOP));
    zcr.push(crossings / HOP);
  }

  const floor = Math.max(...rms) * silence;
  const frame = (t: number) => Math.max(0, Math.min(rms.length - 1, Math.round(t / 0.005)));

  const lags = words.map((w) => {
    const limit = frame(w.end);
    let i = frame(w.start);
    while (i <= limit && rms[i]! <= floor) i++;
    return i > limit ? null : Math.round((i * 0.005 - w.start) * 1000) / 1000;
  });

  let inside = 0;
  let total = 0;
  for (let i = 0; i < rms.length; i++) {
    const t = i * 0.005;
    const e = rms[i]! * rms[i]!;
    total += e;
    if (words.some((w) => t >= w.start && t < w.end)) inside += e;
  }

  // Voiced/hiss segmentation of the first word — the phonics question.
  const first = words[0]!;
  const marks: string[] = [];
  for (let i = frame(first.start); i <= frame(first.end); i++) {
    marks.push(rms[i]! < floor * 2 ? '_' : zcr[i]! > 0.45 ? 'S' : zcr[i]! < 0.25 ? 'V' : '-');
  }
  const runs: [string, number][] = [];
  for (const m of marks) {
    const last = runs[runs.length - 1];
    if (last && last[0] === m) last[1]++;
    else runs.push([m, 1]);
  }

  return {
    audioSeconds: pcm.length / sr,
    tail: pcm.length / sr - words[words.length - 1]!.end,
    coverage: inside / total,
    lags,
    shape: runs
      .filter(([m, n]) => n > 2 && m !== '_')
      .map(([m, n]) => `${m}${(n * 0.005).toFixed(2)}`)
      .join(' '),
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
