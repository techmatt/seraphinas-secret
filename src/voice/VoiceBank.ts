/**
 * The game's entire knowledge of voice: `public/voice/manifest.json`.
 *
 * Nothing here knows which service made the audio, and nothing here may learn.
 * `tools/voice/` fills the manifest; swapping edge-tts for ElevenLabs must not
 * change a line of this file.
 */

import { getAudioContext, unlockAudio } from '../audio/context';

/** Times are seconds from the start of the clip. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface VoiceLine {
  id: string;
  speaker: string;
  /** Display text. Always `words.map(w => w.word).join(' ')`. */
  text: string;
  audio: string;
  words: TimedWord[];
  /** End of the last spoken word. The clip itself runs on a little longer. */
  duration: number;
}

interface VoiceManifestFile {
  version: number;
  provider: string;
  lines: VoiceLine[];
}

/** Voice loading must never be what stops a four-year-old from playing. */
export class VoiceBank {
  private readonly lines = new Map<string, VoiceLine>();
  private readonly buffers = new Map<string, AudioBuffer>();

  /** False when the manifest could not be read; the game plays on, silently. */
  loaded = false;

  async load(base = import.meta.env.BASE_URL): Promise<void> {
    let manifest: VoiceManifestFile;
    try {
      const response = await fetch(`${base}voice/manifest.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      manifest = (await response.json()) as VoiceManifestFile;
    } catch (error) {
      console.warn('voice: no manifest, running mute —', error);
      return;
    }

    for (const line of manifest.lines) this.lines.set(line.id, line);

    // Nine short clips is under 200 KB, so decode them all up front rather than
    // making the first press of A wait on a fetch.
    const ctx = getAudioContext();
    if (ctx) {
      await Promise.all(
        manifest.lines.map(async (line) => {
          try {
            const bytes = await (await fetch(`${base}${line.audio}`)).arrayBuffer();
            this.buffers.set(line.id, await ctx.decodeAudioData(bytes));
          } catch (error) {
            console.warn(`voice: could not decode ${line.id} —`, error);
          }
        }),
      );
    }

    this.loaded = true;
  }

  get(id: string): VoiceLine | undefined {
    return this.lines.get(id);
  }

  get ids(): string[] {
    return [...this.lines.keys()];
  }

  /**
   * Starts a clip and hands back a clock reading seconds since its first sample.
   * Returns null when there is nothing to play, so callers can still show the
   * text and run the highlight off their own clock.
   */
  play(id: string): VoicePlayback | null {
    const ctx = getAudioContext();
    const buffer = this.buffers.get(id);
    if (!ctx || !buffer) return null;

    unlockAudio();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();

    return new VoicePlayback(ctx, source);
  }
}

export class VoicePlayback {
  private readonly startedAt: number;
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly source: AudioBufferSourceNode,
  ) {
    this.startedAt = ctx.currentTime;
  }

  /** Seconds of audio played. Frozen once stopped. */
  get time(): number {
    return this.stopped ? 0 : this.ctx.currentTime - this.startedAt;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.source.stop();
    } catch {
      // Already ended; nothing to do.
    }
  }
}
