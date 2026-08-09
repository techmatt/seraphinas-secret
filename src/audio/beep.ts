/**
 * Placeholder audio: a synthesised chime, no asset files.
 *
 * This exists to prove the audio path works end to end (context creation,
 * gesture-gated resume, actual sample output). Real sound design replaces it
 * later; the voice lines already have their own pipeline.
 */

import { getAudioContext, unlockAudio } from './context';

interface Note {
  freq: number;
  /** Seconds after the chime starts. */
  at: number;
  dur: number;
  peak?: number;
}

/** Never throws — audio failing must not kill the game. */
function playNotes(notes: Note[]): void {
  const c = getAudioContext();
  if (!c) return;
  unlockAudio();

  const now = c.currentTime;

  for (const note of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, now + note.at);

    // Quick attack, exponential tail. Nothing harsh for small ears.
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.exponentialRampToValueAtTime(note.peak ?? 0.22, now + note.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.02);
  }
}

/** A short two-note sparkle. The sound of poking something. */
export function playSparkleChime(): void {
  playNotes([
    { freq: 880, at: 0, dur: 0.16 },
    { freq: 1318.5, at: 0.09, dur: 0.22 },
  ]);
}

/**
 * The doorway's run of notes, played quickly — the sound of going somewhere.
 * The order is the caller's, so a flourish can rise on the way in and fall on
 * the way out; see world/transition.ts.
 */
export function playDoorChime(notes: number[]): void {
  playNotes(notes.map((freq, i) => ({ freq, at: i * 0.062, dur: 0.26 })));
}

/** The far side of the same chime: its last two notes, quieter, landing. */
export function playArriveChime(notes: number[]): void {
  playNotes(
    notes.slice(-2).map((freq, i) => ({ freq, at: i * 0.085, dur: 0.34, peak: 0.13 })),
  );
}
