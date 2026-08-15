/**
 * `public/voice/debug.json` — what the in-game sound debug view reads.
 *
 * The manifest is the game's contract and says nothing about where a clip came
 * from, deliberately: no file under `src/` may learn that a provider exists.
 * But *auditing* a recording session is exactly the job of knowing which lines
 * came back from Firefly, out of which batch, and which words the aligner was
 * unsure of — so that knowledge is written to a second file, beside the
 * manifest and never inside it.
 *
 * The split is the point. Delete this file and the game is unchanged; the debug
 * view is the one screen that reads it, it is dev-only, and Julia has no way to
 * reach it. See `src/debug/SoundDebugScene.ts`.
 *
 * Everything here is a re-shaping of things already true in
 * `content/voice/clips/index.json` and `content/voice/profiles.json`. Nothing is
 * measured here and nothing is decided here — the same three flags
 * `npm run voice:status` prints, plus the word indices the ribbon needs, which
 * are the one thing status has no use for.
 */

import { isSpeakable } from './align.js';
import {
  PLACEHOLDER_VOICE,
  REVIEW_SCORE,
  clipStateFor,
  isSimulated,
  profileFor,
  type ClipIndex,
  type ProfileBook,
} from './firefly.js';
import type { LineSpec, ManifestLine } from './types.js';

export const DEBUG_SIDECAR_VERSION = 2;

/** What is wrong with a line, in the words `voice:status` already uses. */
export type VoiceDebugFlag =
  | 'stale'
  | 'simulated'
  | 'low-confidence'
  | 'tight-join'
  | 'profile-moved';

/**
 * A word the aligner placed but was not sure of.
 *
 * `index` is into the *displayed* words — the manifest's tokens, punctuation and
 * all — not into the spoken ones, because what the view does with it is light
 * that word up in a real `WordRibbon`. The mapping is the same one `align.ts`
 * makes: the nth speakable display token is the nth spoken token.
 */
export interface VoiceDebugWord {
  word: string;
  score: number;
  index: number;
}

export interface VoiceDebugLine {
  id: string;
  speaker: string;
  /** Which Firefly setup it is recorded under — the unit a batch is cut in. */
  profile: string;
  /** `firefly` for an ingested recording, else whatever synthesised it. */
  provider: string;
  /** The batch it was cut out of, or null for a line nobody has recorded. */
  batch: string | null;
  flags: VoiceDebugFlag[];
  /** Empty unless the line carries the `low-confidence` flag. */
  low: VoiceDebugWord[];
  /** End of the last word, as the manifest reports it. */
  seconds: number;
}

export interface VoiceDebugBatch {
  name: string;
  ingested: string;
  lines: number;
}

export interface VoiceDebugFile {
  version: number;
  /** Where an unrecorded line's audio comes from, for the provider filter. */
  fallback: string;
  /** The score at or under which a word is worth an ear. See `REVIEW_SCORE`. */
  reviewScore: number;
  /** `recorded` is real recordings only — a simulated clip is counted apart. */
  totals: { lines: number; recorded: number; simulated: number; stale: number };
  /** Coverage by speaker/profile, exactly as `voice:status` groups it. */
  groups: { key: string; recorded: number; simulated: number; total: number }[];
  batches: VoiceDebugBatch[];
  lines: VoiceDebugLine[];
}

/**
 * @param lines    the authored lines, in authored order
 * @param manifest what the build just wrote, keyed the same way
 * @param fallback the provider id an unrecorded line was synthesised by
 */
export function buildDebugSidecar(
  lines: LineSpec[],
  manifest: ManifestLine[],
  clips: ClipIndex,
  profiles: ProfileBook,
  fallback: string,
): VoiceDebugFile {
  const shown = new Map(manifest.map((entry) => [entry.id, entry]));
  const groups = new Map<string, { recorded: number; simulated: number; total: number }>();

  const out: VoiceDebugLine[] = [];
  let recorded = 0;
  let simulated = 0;
  let stale = 0;

  for (const line of lines) {
    const profile = profileFor(line, profiles);
    const state = clipStateFor(line, clips);
    const entry = shown.get(line.id);

    const group = groups.get(`${line.speaker}/${profile}`) ?? { recorded: 0, simulated: 0, total: 0 };
    group.total++;
    if (state.state === 'fresh') {
      if (isSimulated(state.clip)) group.simulated++;
      else group.recorded++;
    }
    groups.set(`${line.speaker}/${profile}`, group);

    const flags: VoiceDebugFlag[] = [];
    const low: VoiceDebugWord[] = [];

    if (state.state === 'stale') {
      // A recording that says the wrong thing: it exists, it sounds fine, and
      // the build has quietly declined to use it. The loudest flag there is.
      stale++;
      flags.push('stale');
    }
    if (state.state === 'fresh') {
      const clip = state.clip;
      // A stand-in is not a recording. It plays, so it is in the list and can
      // be listened to; it is badged so nobody reads the row as finished work,
      // and it counts towards nothing above.
      if (isSimulated(clip)) {
        simulated++;
        flags.push('simulated');
      } else {
        recorded++;
      }
      if (clip.align.review.length) {
        flags.push('low-confidence');
        low.push(...lowWords(clip.words, entry?.words ?? []));
      }
      if (!clip.cut.usableGap) flags.push('tight-join');
      // Prosody lives in the Firefly profile rather than in our data, so a
      // profile edited after a batch was cut is a silent change of voice. A
      // clip recorded while the profile still said TBD has no voice to have
      // drifted from — see the same carve-out in `status.ts`.
      if (
        clip.voice !== PLACEHOLDER_VOICE &&
        clip.voice !== profiles.profiles[clip.profile]?.voice
      ) {
        flags.push('profile-moved');
      }
    }

    out.push({
      id: line.id,
      speaker: line.speaker,
      profile,
      provider: state.state === 'fresh' ? state.clip.provider : fallback,
      batch: state.state === 'missing' ? null : state.clip.batch,
      flags,
      low,
      seconds: entry?.duration ?? 0,
    });
  }

  return {
    version: DEBUG_SIDECAR_VERSION,
    fallback,
    reviewScore: REVIEW_SCORE,
    totals: { lines: lines.length, recorded, simulated, stale },
    groups: [...groups]
      .map(([key, counts]) => ({ key, ...counts }))
      .sort((a, b) => (a.key < b.key ? -1 : 1)),
    batches: Object.entries(clips.batches)
      .map(([name, batch]) => ({
        name,
        ingested: batch.ingested,
        lines: batch.lineIds.length,
      }))
      .sort((a, b) => (a.name < b.name ? -1 : 1)),
    lines: out,
  };
}

/**
 * The unsure words, placed on the sentence the game actually shows.
 *
 * `clip.words` are spoken tokens with punctuation-only placeholders among them;
 * the manifest's are display tokens, which carry their punctuation. `align.ts`
 * pairs them by counting speakable tokens on both sides, and this counts the
 * same way rather than re-deriving the rule — anything cleverer here would be a
 * second implementation of the one mapping in this pipeline that must not drift.
 */
function lowWords(
  spokenWithGaps: { word: string; score: number }[],
  display: { word: string }[],
): VoiceDebugWord[] {
  const spoken = spokenWithGaps.filter((w) => isSpeakable(w.word));
  const out: VoiceDebugWord[] = [];
  let cursor = 0;

  for (let index = 0; index < display.length; index++) {
    const token = display[index]!.word;
    if (!isSpeakable(token)) continue;
    const said = spoken[cursor++];
    if (said && said.score <= REVIEW_SCORE) {
      out.push({ word: token, score: said.score, index });
    }
  }

  return out;
}
