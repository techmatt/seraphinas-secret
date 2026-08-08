/**
 * edge-tts provider — Microsoft Edge's online neural voices.
 *
 * Free, no API key, and it streams word-boundary events, which is the only
 * reason it is here: without per-word timings there is no highlight-on-speak.
 * These are proxy voices; ElevenLabs replaces them later, and nothing outside
 * this file should have to care when it does.
 */

import { Communicate } from 'edge-tts-universal';
import type { Synthesis, TimedWord, VoiceConfig, VoiceProvider } from '../types.js';

/** The service reports offsets in 100-nanosecond ticks. */
const TICKS_PER_SECOND = 10_000_000;

/** A cold WebSocket handshake is usually well under a second; be generous anyway. */
const CONNECTION_TIMEOUT_MS = 20_000;

/** Transient socket failures are common enough to be worth one automatic retry. */
const ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class EdgeTtsProvider implements VoiceProvider {
  readonly id = 'edge-tts';

  async synthesize(text: string, voice: VoiceConfig): Promise<Synthesis> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        return await this.once(text, voice);
      } catch (error) {
        lastError = error;
        if (attempt < ATTEMPTS) await sleep(attempt * 750);
      }
    }

    throw new Error(
      `edge-tts failed after ${ATTEMPTS} attempts for ${JSON.stringify(text)}: ${String(lastError)}`,
    );
  }

  private async once(text: string, voice: VoiceConfig): Promise<Synthesis> {
    const communicate = new Communicate(text, {
      voice: voice.voice,
      rate: voice.rate,
      pitch: voice.pitch,
      volume: voice.volume,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
    });

    const chunks: Uint8Array[] = [];
    const words: TimedWord[] = [];

    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio' && chunk.data) {
        chunks.push(chunk.data);
      } else if (chunk.type === 'WordBoundary') {
        const offset = chunk.offset ?? 0;
        const duration = chunk.duration ?? 0;
        words.push({
          word: chunk.text ?? '',
          start: round(offset / TICKS_PER_SECOND),
          end: round((offset + duration) / TICKS_PER_SECOND),
        });
      }
    }

    const audio = Buffer.concat(chunks);
    if (audio.length === 0) throw new Error('no audio bytes received');
    if (words.length === 0) throw new Error('no word boundaries received');

    return { audio, extension: 'mp3', words };
  }
}

/** Milliseconds is plenty of resolution, and it keeps the manifest readable. */
function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
