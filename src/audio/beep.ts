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

/**
 * A burst of filtered noise: wood splitting, or a canopy coming through itself.
 *
 * The only thing in here that is not an oscillator, because the one sound a
 * triangle wave cannot make is a crash. Still synthesised and still never
 * throws — real sound design replaces all of this together.
 */
function playNoise(seconds: number, from: number, to: number, peak: number): void {
  const c = getAudioContext();
  if (!c) return;
  unlockAudio();

  const frames = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) samples[i] = Math.random() * 2 - 1;

  const source = c.createBufferSource();
  source.buffer = buffer;

  // A band sliding down the spectrum. Rising would read as a whistle; falling
  // is what every splitting, tumbling, landing thing in the world does.
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  const now = c.currentTime;
  filter.frequency.setValueAtTime(from, now);
  filter.frequency.exponentialRampToValueAtTime(to, now + seconds);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  source.start(now);
  source.stop(now + seconds);
}

/**
 * The axe going in: a woody knock with a bit of split behind it.
 *
 * `step` is how many blows have landed on this thing, and it lowers the pitch
 * and raises the volume — the sound escalates exactly the way the shake and the
 * leaves do, because all three are the only thing telling her the tree is
 * nearly down. Nothing on screen counts, and nothing needs to.
 */
export function playChopThunk(step: number): void {
  const drop = Math.min(step, 2);
  playNotes([
    { freq: 196 - drop * 26, at: 0, dur: 0.1, peak: 0.2 + drop * 0.04 },
    { freq: 131 - drop * 16, at: 0.02, dur: 0.16, peak: 0.16 + drop * 0.04 },
  ]);
  playNoise(0.09 + drop * 0.02, 2600, 700, 0.1 + drop * 0.03);
}

/**
 * The axe going through nothing: a short breath of air, and no knock.
 *
 * A swing that hits nothing still has to answer, because pressing green and
 * hearing silence is the one way this game can look broken. It is deliberately
 * the quietest thing in the file — a whiff is not an event, it is the absence of
 * one, and a whiff as loud as a blow would teach her that hitting air is worth
 * doing.
 */
export function playWhoosh(): void {
  playNoise(0.16, 1400, 380, 0.045);
}

/** The whole thing coming down: a long crash, then it lands. */
export function playTreeCrash(): void {
  playNoise(0.62, 3400, 220, 0.22);
  playNotes([
    { freq: 130.8, at: 0.34, dur: 0.4, peak: 0.24 },
    { freq: 87.3, at: 0.42, dur: 0.5, peak: 0.22 },
    // Three bright notes on top of the thud, because this is the big moment and
    // a crash on its own would read as something having gone wrong.
    { freq: 659.3, at: 0.4, dur: 0.24 },
    { freq: 880, at: 0.5, dur: 0.24 },
    { freq: 1318.5, at: 0.6, dur: 0.32 },
  ]);
}

/** The stump popping out: a short hollow knock and a little rise. */
export function playStumpPop(): void {
  playNotes([
    { freq: 261.6, at: 0, dur: 0.12, peak: 0.2 },
    { freq: 523.3, at: 0.07, dur: 0.18 },
  ]);
  playNoise(0.12, 1800, 500, 0.12);
}

/** A short two-note sparkle. The sound of poking something. */
export function playSparkleChime(): void {
  playNotes([
    { freq: 880, at: 0, dur: 0.16 },
    { freq: 1318.5, at: 0.09, dur: 0.22 },
  ]);
}

/**
 * Two soft low knocks: the sound of a door that is not going to open today.
 * Deliberately friendly rather than a buzzer — a locked shed is a joke here,
 * not a wrong answer.
 */
export function playThudChime(): void {
  playNotes([
    { freq: 174.6, at: 0, dur: 0.11, peak: 0.18 },
    { freq: 146.8, at: 0.11, dur: 0.14, peak: 0.16 },
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
