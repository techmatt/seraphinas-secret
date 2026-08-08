/**
 * The voice pipeline's contracts.
 *
 * The split that matters: everything below `VoiceProvider` is provider-specific
 * and stays inside `tools/voice/providers/`. Everything in `VoiceManifest` is
 * what the game sees, and it must never carry a provider's fingerprints — the
 * plan is to swap edge-tts for ElevenLabs without touching a line of game code.
 */

/** One authored line of dialog. `content/voice/lines.json` is an array of these. */
export interface LineSpec {
  /** Stable key. Becomes the audio filename and the game's lookup handle. */
  id: string;
  /** Which speaker in `voices.json` says it. */
  speaker: string;
  /** What is shown on screen, verbatim, punctuation and all. */
  text: string;
  /**
   * What is actually spoken, when that has to differ from what is shown.
   * Only phonics lines should need this — see `content/voice/lines.json`.
   * Must tokenise to the same number of words as `text`.
   */
  say?: string;
  /** Per-line prosody, overriding the speaker's. Same units as VoiceConfig. */
  rate?: string;
  pitch?: string;
  volume?: string;
  /** Free-text authoring note. Ignored by the build; never reaches the game. */
  note?: string;
}

/** How one speaker sounds, in whatever terms the current provider understands. */
export interface VoiceConfig {
  /** Provider voice id, e.g. an edge-tts short name like `en-US-AnaNeural`. */
  voice: string;
  /** Percentage, e.g. `-15%`. */
  rate?: string;
  /** Hertz offset, e.g. `+30Hz`. */
  pitch?: string;
  /** Percentage, e.g. `+10%`. */
  volume?: string;
}

/** `content/voice/voices.json`. */
export interface VoiceBook {
  /** Which provider the configs below are written for. */
  provider: string;
  speakers: Record<string, VoiceConfig>;
}

/** A word as the provider timed it. Times in seconds from the start of the clip. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface Synthesis {
  audio: Uint8Array;
  /** File extension for the returned bytes, without the dot. */
  extension: string;
  /** Provider tokens in spoken order. Punctuation is typically absent. */
  words: TimedWord[];
}

export interface VoiceProvider {
  /** Recorded in the manifest so a stale manifest is obvious after a swap. */
  readonly id: string;
  synthesize(text: string, voice: VoiceConfig): Promise<Synthesis>;
}

/** One line as the game sees it. */
export interface ManifestLine {
  id: string;
  speaker: string;
  /** The display text. Exactly `words.map(w => w.word).join(' ')`. */
  text: string;
  /** Path relative to the site root, e.g. `voice/seraphina_secret.mp3`. */
  audio: string;
  /**
   * Every whitespace-separated token of `text`, in order, so the game can
   * rebuild the line without re-tokenising. Tokens the provider did not time
   * (a lone em dash) carry `start === end` and so never highlight.
   */
  words: TimedWord[];
  /** End of the last timed word. Not the audio's length — there is usually a tail. */
  duration: number;
}

export interface VoiceManifest {
  /** Bumped when the shape below changes. */
  version: number;
  /** Informational: which provider filled this in. */
  provider: string;
  lines: ManifestLine[];
}
