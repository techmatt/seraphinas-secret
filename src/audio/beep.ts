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
 * The hammer going into stone: a hard crack with grit behind it.
 *
 * Higher and shorter than the axe's woody thunk, because the two have to be
 * tellable apart with your eyes shut — that is most of how "the hammer is for
 * the stones" gets learned without anybody saying it. `step` escalates the same
 * way, and for the same reason: the escalation *is* the progress bar.
 */
export function playRockCrack(step: number): void {
  const drop = Math.min(step, 2);
  playNotes([
    { freq: 392 - drop * 40, at: 0, dur: 0.07, peak: 0.17 + drop * 0.04 },
    { freq: 262 - drop * 24, at: 0.03, dur: 0.11, peak: 0.14 + drop * 0.04 },
  ]);
  playNoise(0.07 + drop * 0.02, 5200, 1400, 0.09 + drop * 0.03);
}

/**
 * A stone coming open and the gem inside it: the crack, then three bright notes
 * climbing out of it. The biggest noise a single blow makes in this game.
 */
export function playGemBreak(): void {
  playNoise(0.3, 5600, 900, 0.2);
  playNotes([
    { freq: 196, at: 0, dur: 0.16, peak: 0.2 },
    { freq: 987.8, at: 0.1, dur: 0.22 },
    { freq: 1318.5, at: 0.19, dur: 0.24 },
    { freq: 1760, at: 0.28, dur: 0.34 },
  ]);
}

/**
 * Picking something up: two notes going up, and nothing underneath them. Small
 * on purpose — the celebration belongs to the thing that just became possible,
 * not to bending down.
 */
export function playPickup(): void {
  playNotes([
    { freq: 659.3, at: 0, dur: 0.14 },
    { freq: 987.8, at: 0.08, dur: 0.2 },
  ]);
}

/**
 * A page turning: a short sweep of paper, and two soft notes over the top.
 *
 * Mostly noise rather than mostly notes, because paper is the one thing in this
 * file that has no pitch — a chime on its own would be a spell, and what just
 * happened is a page. The band slides *up* rather than down, which is the one
 * place in this file that happens: everything else here falls because it is
 * splitting, tumbling or landing, and a page goes the other way.
 */
export function playPageTurn(): void {
  playNoise(0.24, 700, 3200, 0.075);
  playNotes([
    { freq: 587.3, at: 0.06, dur: 0.14, peak: 0.12 },
    { freq: 880, at: 0.15, dur: 0.2, peak: 0.13 },
  ]);
}

/**
 * A coin landing in the pocket: two bright notes a fifth apart, and a third one
 * on top of them that rings on.
 *
 * Higher and thinner than anything else in the file on purpose — a coin is small
 * and metal, and everything else here is wood, stone or magic. It is meant to be
 * the sound she recognises before she has looked at the corner of the screen.
 */
export function playCoin(): void {
  playNotes([
    { freq: 1318.5, at: 0, dur: 0.1, peak: 0.15 },
    { freq: 1975.5, at: 0.06, dur: 0.14, peak: 0.13 },
    { freq: 2637, at: 0.11, dur: 0.3, peak: 0.09 },
  ]);
}

/**
 * A coin she has no room for, bouncing off a full pocket.
 *
 * The same metal, going the other way: down rather than up, and shorter. It has
 * to be unmistakably *not* the sound above — she has three coins and this one
 * did not go in — while being just as pleased about it. There is no fourth box
 * to look at and nothing is said; the noise and the bounce are the whole of the
 * answer. See CLAUDE.md, "No fail states".
 */
export function playCoinBounce(): void {
  playNotes([
    { freq: 1975.5, at: 0, dur: 0.08, peak: 0.12 },
    { freq: 1318.5, at: 0.07, dur: 0.1, peak: 0.11 },
    { freq: 1567.98, at: 0.15, dur: 0.18, peak: 0.09 },
  ]);
}

/**
 * The big one: a rising run with a chord on the end of it. For the moments the
 * whole quest turns over — the job being taken, and the last stone cracking.
 */
export function playFanfare(): void {
  playNotes([
    { freq: 523.3, at: 0, dur: 0.18 },
    { freq: 659.3, at: 0.1, dur: 0.18 },
    { freq: 784, at: 0.2, dur: 0.2 },
    { freq: 1046.5, at: 0.3, dur: 0.42 },
    { freq: 1318.5, at: 0.32, dur: 0.42, peak: 0.18 },
    { freq: 1568, at: 0.34, dur: 0.46, peak: 0.16 },
  ]);
}

/**
 * A wrong button in the circle: the fire spits, and nothing else happens.
 *
 * Deliberately *not* a buzzer, and deliberately not sad. It is a short scatter
 * of noise with a little upward flick on the end of it, which is the sound of a
 * firework that did not go off — the sound of a thing that was funny. See
 * CLAUDE.md, "No fail states".
 */
export function playFizzle(): void {
  playNoise(0.22, 900, 2600, 0.1);
  playNotes([
    { freq: 330, at: 0.04, dur: 0.08, peak: 0.12 },
    { freq: 294, at: 0.12, dur: 0.1, peak: 0.1 },
  ]);
}

/**
 * The giggle that goes with it: three little rising notes, quiet and quick.
 *
 * A stand-in for two children laughing, out of the same oscillator as everything
 * else in this file. It is here rather than in the voice pipeline because a
 * giggle is not a *word* — nothing lights up when it plays, so it is a sound
 * effect, and putting it through the reading machinery would have been a line
 * with no text.
 */
export function playGiggle(): void {
  playNotes([
    { freq: 880, at: 0, dur: 0.09, peak: 0.11 },
    { freq: 1046.5, at: 0.09, dur: 0.09, peak: 0.12 },
    { freq: 1174.7, at: 0.17, dur: 0.13, peak: 0.1 },
    { freq: 987.8, at: 0.28, dur: 0.12, peak: 0.08 },
  ]);
}

/**
 * The summoning. The longest and biggest noise in the game by some way: a swell
 * underneath, a rising run over the top of it, and a chord that stays.
 *
 * The fanfare is what a phase gets. This is what the whole quest gets, once, and
 * it is meant to be obviously more than anything she has heard so far.
 */
export function playSummon(): void {
  playNoise(1.1, 300, 3600, 0.12);
  const run = [523.3, 659.3, 784, 987.8, 1174.7, 1318.5, 1568];
  playNotes([
    ...run.map((freq, i) => ({ freq, at: i * 0.085, dur: 0.3, peak: 0.16 })),
    // And the chord it lands on, held.
    { freq: 1046.5, at: 0.72, dur: 1.1, peak: 0.2 },
    { freq: 1318.5, at: 0.74, dur: 1.1, peak: 0.17 },
    { freq: 1568, at: 0.76, dur: 1.2, peak: 0.15 },
    { freq: 2093, at: 0.8, dur: 1.2, peak: 0.11 },
  ]);
}

/**
 * Going to sleep: a long falling run under a soft wash, ending low and held.
 *
 * The opposite shape to everything else in this file. A chime in this game goes
 * up because nearly everything in this game is good news arriving; a day ending
 * is the one thing that settles, so this walks down an octave and a half and
 * stays there. The noise under it is the quietest in the file and slides
 * downwards too — the sound of a room going dark rather than of a thing
 * breaking.
 */
export function playSleepChime(): void {
  playNoise(1.4, 1800, 200, 0.05);
  const fall = [784, 659.3, 587.3, 493.9, 392, 329.6];
  playNotes([
    ...fall.map((freq, i) => ({ freq, at: i * 0.16, dur: 0.5, peak: 0.13 - i * 0.008 })),
    // And the low pair it lands on, held long enough to be the night itself.
    { freq: 261.6, at: 1, dur: 1.5, peak: 0.1 },
    { freq: 196, at: 1.02, dur: 1.6, peak: 0.08 },
  ]);
}

/**
 * Waking up: the sleep chime run backwards, brighter, with the morning on the
 * end of it.
 *
 * Deliberately the same notes the other way up, because the two are one gesture
 * with a night in the middle — and a four-year-old who has heard the day go down
 * knows what the same run coming back up means without being told. Bigger than
 * a doorway and smaller than the summoning: this is a thing she can do every
 * day, and nothing she does every day should be the loudest sound in the game.
 */
export function playWakeChime(): void {
  const rise = [329.6, 392, 493.9, 587.3, 659.3, 784, 987.8];
  playNotes([
    ...rise.map((freq, i) => ({ freq, at: i * 0.07, dur: 0.26, peak: 0.15 })),
    { freq: 1046.5, at: 0.52, dur: 0.8, peak: 0.18 },
    { freq: 1318.5, at: 0.54, dur: 0.8, peak: 0.14 },
    { freq: 1568, at: 0.56, dur: 0.85, peak: 0.11 },
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
