/**
 * Placeholder audio: a synthesised chime, no asset files.
 *
 * This exists to prove the audio path works end to end (context creation,
 * gesture-gated resume, actual sample output). Real sound design replaces it
 * later; the voice lines already have their own pipeline.
 */

import { getAudioContext, unlockAudio } from './context';

/** A short two-note sparkle. Never throws — audio failing must not kill the game. */
export function playSparkleChime(): void {
  const c = getAudioContext();
  if (!c) return;
  unlockAudio();

  const now = c.currentTime;
  const notes = [
    { freq: 880, at: 0, dur: 0.16 },
    { freq: 1318.5, at: 0.09, dur: 0.22 },
  ];

  for (const note of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, now + note.at);

    // Quick attack, exponential tail. Nothing harsh for small ears.
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.exponentialRampToValueAtTime(0.22, now + note.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.02);
  }
}
