/**
 * The sound debug view's two side doors: the build's debug sidecar, and the
 * review file a listening session writes back.
 *
 * **This is the one file under `src/` that knows a provider exists**, and it is
 * dev tooling rather than the game. The rule it is standing next to — the game
 * may read nothing but `public/voice/manifest.json` — is about the game: swap
 * edge-tts for ElevenLabs and every file that draws, speaks or plays anything
 * must be untouched. Auditing a recording session is the opposite job, and it
 * cannot be done without knowing which batch a clip came out of. So the
 * knowledge is quarantined here, in a module nothing but
 * `SoundDebugScene` imports, reading a file nothing but this module reads.
 *
 * The type below mirrors `tools/voice/debugSidecar.ts`, the way `tests/harness.ts`
 * mirrors `src/testHooks.ts`: the producer owns the shape, this is the reader's
 * copy of it, and they are two files that have to agree.
 */

/** What is wrong with a line, in the words `npm run voice:status` already uses. */
export type VoiceDebugFlag = 'stale' | 'low-confidence' | 'tight-join' | 'profile-moved';

export interface VoiceDebugWord {
  word: string;
  score: number;
  /** Into the *displayed* words, so a ribbon can be marked with it directly. */
  index: number;
}

export interface VoiceDebugLine {
  id: string;
  speaker: string;
  profile: string;
  provider: string;
  batch: string | null;
  flags: VoiceDebugFlag[];
  low: VoiceDebugWord[];
  seconds: number;
}

export interface VoiceDebugFile {
  version: number;
  fallback: string;
  reviewScore: number;
  totals: { lines: number; recorded: number; stale: number };
  groups: { key: string; recorded: number; total: number }[];
  batches: { name: string; ingested: string; lines: number }[];
  lines: VoiceDebugLine[];
}

/** Where the dev server appends what Matt marked. Shown on screen, so he knows. */
export const REVIEW_FILE = 'scratch/voice-review.json';

/** The dev-server route that appends to it. See `vite.config.ts`. */
const REVIEW_ROUTE = '/__voice-review';

/**
 * Read the sidecar, or null if there is not one.
 *
 * Null is a real answer, not a failure: a checkout that has never run
 * `npm run voice:build` has a manifest committed and no sidecar, and the view
 * says so on screen rather than refusing to open.
 */
export async function loadVoiceDebug(base = import.meta.env.BASE_URL): Promise<VoiceDebugFile | null> {
  try {
    const response = await fetch(`${base}voice/debug.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as VoiceDebugFile;
  } catch (error) {
    console.warn('sound debug: no debug.json — run npm run voice:build —', error);
    return null;
  }
}

/** What the review route says back: how many marks the file now holds. */
export interface MarkResult {
  ok: boolean;
  /** Marks in the file after this one, or a sentence explaining why not. */
  detail: string;
}

/**
 * Append a line id to the review file, with the moment it was marked.
 *
 * Deliberately dumb: append-only, one POST, no de-duplication and no way to
 * take a mark back. Matt will not hand-edit a file, so this is how a listening
 * session's verdicts reach the next prompt, and the useful property of a log is
 * that marking the same line twice is a thing the log remembers.
 *
 * Only the dev server can do this — there is nothing to write to in a built
 * page — so a failure is reported on screen rather than swallowed.
 */
export async function markForReview(id: string): Promise<MarkResult> {
  try {
    const response = await fetch(REVIEW_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { marks?: number };
    return { ok: true, detail: `${body.marks ?? '?'} marked` };
  } catch (error) {
    return {
      ok: false,
      detail: `could not write ${REVIEW_FILE} (${error instanceof Error ? error.message : String(error)}) — dev server only`,
    };
  }
}
