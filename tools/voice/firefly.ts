/**
 * The Firefly side of the voice pipeline: profiles, batches, the clip store.
 *
 * Adobe Firefly is a web page, not an API. Matt pastes a batch of lines into it
 * by hand, downloads one WAV, and drops it beside the batch file; everything
 * after that is machinery, and this module is the vocabulary all of it shares.
 *
 * Three facts hold the whole thing together:
 *
 * 1. **The spoken text of a line is a pure function of the line.** The batch
 *    file, the hash stored beside a clip and the check at build time all call
 *    `spokenFor`, so "is this clip still the right recording" is a string
 *    comparison and never a judgement.
 * 2. **The hash is the only guard.** Alignment will happily fit the wrong
 *    words to the right audio and report itself confident, so nothing here
 *    ever infers that a clip matches its line — the recorded text is stored
 *    and compared verbatim.
 * 3. **Latest ingest wins.** The clip store is keyed by line id, so
 *    re-recording one line in a batch of one overwrites it. That is the patch
 *    mechanism; there is no other.
 *
 * Content-time only, like everything under `tools/`. The game still reads
 * nothing but `public/voice/manifest.json`.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { LineSpec, TimedWord } from './types.js';

/** Matt's drop folder: generated batch files in, downloaded WAVs back. */
export const BATCH_DIR = 'voice-batches';

/** Ingested per-line clips. Committed — a recording cannot be regenerated. */
export const CLIP_DIR = path.join('content', 'voice', 'clips');

/** The clip store's index, provenance and all. */
export const CLIP_INDEX = path.join(CLIP_DIR, 'index.json');

export const PROFILES_FILE = path.join('content', 'voice', 'profiles.json');
export const LINES_FILE = path.join('content', 'voice', 'lines.json');

/** Default lines per batch. Small enough that a re-record is cheap. */
export const DEFAULT_BATCH_SIZE = 12;

/**
 * Where a clip's loudness is normalised to: RMS over the frames that are not
 * silence, in dBFS. Measured off all 75 edge-tts clips, whose speech RMS runs
 * -21.2 to -16.5 with a median of -19.2 — so this target leaves the existing
 * voice almost exactly where it is and brings Firefly to meet it.
 */
export const TARGET_DBFS = -19;

/** Never let normalisation push a clip louder than this. */
export const PEAK_CEILING_DBFS = -1;

/**
 * Linear fade at each cut edge, seconds. The spike used 8 ms and nobody could
 * hear it; it is a constant rather than a literal because Matt has not yet put
 * a real Firefly join in his ears. `voice:ingest --fade` overrides it for a
 * one-off comparison, and this is the number to change when he has decided.
 */
export const FADE_SECONDS = 0.008;

/** Clips are written at edge-tts's own rate, so the two sit together. */
export const CLIP_RATE = 24_000;

/**
 * A word span the aligner was this unsure of gets looked at by a human. The
 * spike proved 0.40 is where the wandering words are: every word it flags
 * begins with a vowel or a nasal after silence, which is exactly where there
 * is no acoustic edge to find.
 */
export const REVIEW_SCORE = 0.4;

// -- profiles -----------------------------------------------------------------

export interface VoiceProfile {
  /** Firefly's own name for the voice. Placeholder until Matt picks. */
  voice: string;
  /** Firefly's UI knobs, verbatim, so a batch can be reproduced later. */
  settings: Record<string, string>;
  note?: string;
}

export interface ProfileBook {
  provider: string;
  note?: string;
  profiles: Record<string, VoiceProfile>;
  /** Speaker id → the profile they are normally recorded under. */
  speakers: Record<string, string>;
  /** Line ids matching `match` are cut under `profile` instead. */
  overrides: { match: string; profile: string; why?: string }[];
}

export async function readProfiles(file = PROFILES_FILE): Promise<ProfileBook> {
  return readJson<ProfileBook>(file);
}

/**
 * Which profile a line is recorded under.
 *
 * The speaker's own by default; an override wins, which is how the four book
 * pages are read at storybook pace by the same person who says everything else.
 */
export function profileFor(line: LineSpec, book: ProfileBook): string {
  for (const rule of book.overrides) {
    if (new RegExp(rule.match).test(line.id)) return rule.profile;
  }
  const speaker = book.speakers[line.speaker];
  if (!speaker) {
    throw new Error(`line "${line.id}" has speaker "${line.speaker}", which profiles.json lacks`);
  }
  return speaker;
}

// -- the spoken text, and its hash --------------------------------------------

/**
 * Exactly what goes in the batch file, and therefore exactly what Firefly is
 * asked to say.
 *
 * `say` where the line has one — the split that exists because a mid-line "!"
 * buys a second of dead air. Whitespace is collapsed and terminal punctuation
 * is added where it is missing, because a bare word ("Wardrobe") pasted into a
 * TTS box gets read as if the sentence were still coming. Neither changes the
 * token count, so `align.ts`'s display mapping is untouched.
 */
export function spokenFor(line: LineSpec): string {
  const raw = (line.say ?? line.text).trim().replace(/\s+/g, ' ');
  return /[.!?…]$/.test(raw) ? raw : `${raw}.`;
}

/**
 * The whole guard against playing a clip of the wrong words.
 *
 * Stored beside the clip at ingest, recomputed at build. A mismatch means the
 * line was edited after it was recorded, and the build falls back rather than
 * playing audio that no longer says what is on the screen.
 */
export function spokenHash(spoken: string): string {
  return createHash('sha256').update(spoken).digest('hex').slice(0, 16);
}

// -- batches ------------------------------------------------------------------

/** The sidecar written beside every generated batch `.txt`. */
export interface BatchSidecar {
  /** Bumped if this shape changes. */
  version: number;
  name: string;
  speaker: string;
  profile: string;
  /** Snapshot of the profile as it stood when the batch was cut. */
  profileSettings: VoiceProfile;
  /** ISO date. What was true about the text on the day it was pasted. */
  created: string;
  /** The text file to paste, relative to the batch folder. */
  text: string;
  /** In the order they are spoken, which is the order they are cut apart. */
  lines: { id: string; spoken: string; spokenHash: string }[];
}

export const SIDECAR_VERSION = 1;

export function sidecarPath(dir: string, name: string): string {
  return path.join(dir, `${name}.json`);
}

export function batchTextPath(dir: string, name: string): string {
  return path.join(dir, `${name}.txt`);
}

/**
 * A batch's name, from what it holds.
 *
 * Speaker and profile are both in it because a batch is never mixed, and the
 * pair is what Firefly has to be set up for. The usual case — a speaker
 * recorded under their own profile — collapses to just the speaker, so most
 * names read `dad-01` and only the odd one reads `seraphina-storybook-01`.
 */
export function batchName(speaker: string, profile: string, index: number): string {
  const stem = speaker === profile ? speaker : `${speaker}-${profile}`;
  return `${stem}-${String(index).padStart(2, '0')}`;
}

// -- the clip store -----------------------------------------------------------

/** A spoken-word span as the aligner reported it, clip-relative. */
export type ScoredWord = TimedWord & { score: number };

/** One ingested recording. Everything needed to trust it, or to disown it. */
export interface ClipRecord {
  provider: string;
  /** Which batch it was cut out of, and where in it. */
  batch: string;
  indexInBatch: number;
  speaker: string;
  profile: string;
  /** The profile's voice at the time of recording, not at the time of reading. */
  voice: string;
  /** What was actually recorded, verbatim, and its hash. The build's guard. */
  spoken: string;
  spokenHash: string;
  /** File name inside CLIP_DIR. */
  audio: string;
  bytes: number;
  seconds: number;
  ingested: string;
  align: {
    model: string;
    latency: number;
    minScore: number;
    medianScore: number;
    /** Words at or under REVIEW_SCORE, for the status report and the debug view. */
    review: { word: string; score: number }[];
  };
  cut: {
    /** Where in the batch recording this clip came from. */
    startSeconds: number;
    endSeconds: number;
    trimmedHead: number;
    trimmedTail: number;
    /** False when the aligner found no run of silence to cut in. */
    usableGap: boolean;
  };
  loudness: { targetDbfs: number; gainDb: number; peakDbfs: number; speechDbfs: number };
  /** Spoken-token spans, rebased to this clip. Punctuation-only tokens included. */
  words: ScoredWord[];
}

/** What a batch's audio looked like when it was ingested, so `--all` can skip it. */
export interface BatchRecord {
  ingested: string;
  audio: string;
  audioBytes: number;
  audioMtimeMs: number;
  sourceRate: number;
  lineIds: string[];
}

export interface ClipIndex {
  version: number;
  clips: Record<string, ClipRecord>;
  batches: Record<string, BatchRecord>;
}

export const CLIP_INDEX_VERSION = 1;

export async function readClipIndex(file = CLIP_INDEX): Promise<ClipIndex> {
  const empty: ClipIndex = { version: CLIP_INDEX_VERSION, clips: {}, batches: {} };
  const index = await readJson<ClipIndex>(file).catch(() => empty);
  index.clips ??= {};
  index.batches ??= {};
  return index;
}

/** How a line resolved: what the build does, and what the status report prints. */
export type ClipState =
  | { state: 'fresh'; clip: ClipRecord }
  | { state: 'stale'; clip: ClipRecord }
  | { state: 'missing' };

/**
 * Whether the recording on disk still says what the line says.
 *
 * Deliberately the only question asked: never "does the audio sound like the
 * text", because forced alignment answers that one wrongly and confidently.
 */
export function clipStateFor(line: LineSpec, index: ClipIndex): ClipState {
  const clip = index.clips[line.id];
  if (!clip) return { state: 'missing' };
  return clip.spokenHash === spokenHash(spokenFor(line)) ? { state: 'fresh', clip } : { state: 'stale', clip };
}

/**
 * Forget any clip whose audio file is no longer on disk.
 *
 * A recording deleted by hand — a take Matt did not like — must show up as a
 * coverage gap and not as a build that cannot find a file. Returns the ids it
 * dropped so the caller can say so; the index on disk is left alone, because
 * the next ingest rewrites it anyway and a build should not quietly edit
 * content.
 */
export async function forgetMissingAudio(index: ClipIndex, dir = CLIP_DIR): Promise<string[]> {
  const dropped: string[] = [];
  for (const [id, clip] of Object.entries(index.clips)) {
    const there = await stat(path.join(dir, clip.audio)).then(
      () => true,
      () => false,
    );
    if (!there) {
      delete index.clips[id];
      dropped.push(id);
    }
  }
  return dropped;
}

export async function readLines(file = LINES_FILE): Promise<LineSpec[]> {
  return readJson<LineSpec[]>(file);
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/** Newline-terminated, two-space — so a re-ingest of nothing is no diff. */
export function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Keys in a stable order, so the index does not churn between ingests. */
export function sortedByKey<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
