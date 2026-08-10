/**
 * The only surface Playwright is allowed to touch.
 *
 * Automated tests need to know the game booted and where the character is
 * without reading pixels. Keeping that on one narrow object means gameplay code
 * never grows test-shaped hacks, and the test spec has exactly one contract to
 * break.
 */

import { getAudioContext } from './audio/context';

/** Anything on screen a test might want to walk to, in world space. */
export interface Marker {
  id: string;
  x: number;
  y: number;
}

export interface DoorwayMarker extends Marker {
  /** Room id on the far side. */
  to: string;
}

export interface TestHooks {
  /** Flips true once a room scene has finished create(). */
  ready: boolean;
  /**
   * Which scene is live. The game now opens on the title screen, so "booted" and
   * "playable" are two different moments and a test has to be able to tell them
   * apart.
   */
  scene: 'title' | 'room' | null;
  /**
   * Which room is on screen. One scene serves the whole room graph, so `scene`
   * cannot answer "did walking through the archway actually take her anywhere".
   */
  room: string | null;
  /**
   * True from the moment a doorway fires until the far room has been built. The
   * character is not under her own control during this.
   */
  transitioning: boolean;
  /**
   * State of the shared AudioContext: 'suspended' until a gesture unlocks it,
   * 'running' after, or 'none' where the browser has no AudioContext at all.
   * The title screen exists mostly to move this to 'running', so it is worth
   * being able to assert on.
   */
  audio: string;
  /**
   * The character: where she is in world space, and what she is doing there.
   *
   * `facing` is one of the game's four directions; `anim` is the logical
   * animation, which only ever names the three the sheet actually draws — so
   * facing left reports `walk-right` with `flipped` true. Those three together
   * are the only way to tell a real mirror from a missing animation.
   *
   * `artLoaded` is false when a sprite sheet did not arrive. Her art is a
   * side-loaded, gitignored asset pack now, so "the pipeline ran" is something
   * the suite has to be able to fail on — an animation key plays perfectly well
   * over Phaser's missing-texture square.
   */
  player: {
    x: number;
    y: number;
    facing: 'down' | 'up' | 'left' | 'right';
    anim: string;
    flipped: boolean;
    artLoaded: boolean;
  };
  /** This room's pokeable props, so tests can steer instead of guessing. */
  interactables: Marker[];
  /** This room's doorways, at the centre of each opening. */
  doorways: DoorwayMarker[];
  /** How close the character must get before an interaction will fire. */
  interactRadius: number;
  /** How many times the juicy interaction has fired. */
  sparkles: number;
  /** Particles currently alive. */
  aliveParticles: number;
  /**
   * High-water mark of aliveParticles. A burst is gone within a second, which is
   * easily less than a screenshot round trip, so the instantaneous count cannot
   * tell "never emitted" from "read too late". This can.
   */
  peakParticles: number;
  /**
   * Freeze the live scene so a screenshot catches the juice mid-flight. Paused
   * scenes still render, they just stop updating.
   */
  pause: () => void;
  voice: VoiceHooks;
}

/**
 * Highlight-on-speak is the mechanic most worth testing and the least testable
 * in real time: a word's turn can be under 150 ms, which no round trip beats.
 * So the test drives the line's clock directly instead of racing playback.
 */
export interface VoiceHooks {
  /** True once the manifest and its audio have finished loading. */
  loaded: boolean;
  /** Manifest line ids, so a test can assert on content it did not hardcode. */
  ids: string[];
  /** The line currently in the bubble, or null. */
  lineId: string | null;
  /** Display tokens of that line, in order. */
  words: string[];
  /** Index into `words` of the glowing one, or -1 between words. */
  highlighted: number;
  /** Start a line by id, without walking to anything. */
  say: (id: string) => void;
  /** Jump the line's clock to `seconds` and stop the audio, so it holds still. */
  scrub: (seconds: number) => void;
  /** Word timings of a manifest line, for asserting against what is shown. */
  timings: (id: string) => { word: string; start: number; end: number }[];
}

declare global {
  interface Window {
    __seraphina?: TestHooks;
  }
}

/**
 * `?fastBoot=1` skips the title screen's spoken greeting, which costs every
 * test that only wants to be in a room about two and a half seconds. The press
 * itself still happens, because it is what unlocks audio and wakes the pad —
 * skipping that would mean the suite stopped testing the real entry path.
 *
 * A query flag rather than a hook function: the title screen has already begun
 * by the time Playwright could call anything.
 */
export const FAST_BOOT =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('fastBoot');

export const hooks: TestHooks = {
  ready: false,
  scene: null,
  room: null,
  transitioning: false,
  audio: 'none',
  player: { x: 0, y: 0, facing: 'down', anim: 'idle-down', flipped: false, artLoaded: false },
  interactables: [],
  doorways: [],
  interactRadius: 0,
  sparkles: 0,
  aliveParticles: 0,
  peakParticles: 0,
  pause: () => undefined,
  voice: {
    loaded: false,
    ids: [],
    lineId: null,
    words: [],
    highlighted: -1,
    say: () => undefined,
    scrub: () => undefined,
    timings: () => [],
  },
};

export function installTestHooks(): void {
  window.__seraphina = hooks;
}

/**
 * The AudioContext's state lives outside the game's own bookkeeping, so it has
 * to be read rather than written. Scenes call this once a frame.
 */
export function syncAudioHook(): void {
  hooks.audio = getAudioContext()?.state ?? 'none';
}
