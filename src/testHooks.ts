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

export interface TreeMarker extends Marker {
  /** The layout says she may fell this one. */
  choppable: boolean;
  /** Whole tree, felled to a stump, or knocked out entirely. */
  state: 'standing' | 'stump' | 'gone';
}

export interface DoorwayMarker extends Marker {
  /** Room id on the far side. */
  to: string;
  /**
   * Walk into it, or stand at it and press green. A test driving the world has
   * to know which, because the two are different journeys.
   */
  enter: 'walk' | 'press';
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
   * The character: where her feet are in world space, and what she is doing
   * there. Her position is the point she is standing on — the same space every
   * marker below is in — not the middle of her sprite.
   *
   * `facing` is one of the game's four directions; `anim` is the logical
   * animation, which only ever names the three the sheet actually draws — so
   * facing left reports `walk-right` with `flipped` true. Those three together
   * are the only way to tell a real mirror from a missing animation.
   *
   * `artLoaded` is false when any sprite sheet did not arrive — hers or the
   * world's. The art is a side-loaded, gitignored asset pack, so "the pipeline
   * ran" is something the suite has to be able to fail on: an animation key
   * plays perfectly well over Phaser's missing-texture square.
   *
   * `frames` is which frame of its own sheet each visible paper-doll layer is
   * drawing, keyed by texture key. `anim` says what she is doing; this says
   * whether the picture is actually moving while she does it, which for a stack
   * of seven sprites sharing one animation name is a different question — see
   * `Character.frames`.
   */
  player: {
    x: number;
    y: number;
    facing: 'down' | 'up' | 'left' | 'right';
    anim: string;
    flipped: boolean;
    artLoaded: boolean;
    frames: Record<string, number>;
  };
  /**
   * The camera's top-left in world space, and how much of the world it shows.
   * The map is several screens across now, so "did walking move anything" and
   * "did the view stop at the edge of the world" are separate questions.
   */
  camera: { x: number; y: number; width: number; height: number };
  /**
   * The zone's shape, including where its walls are: `blocked` is one character
   * per tile, row-major, '1' where she cannot stand — the same string the map
   * file carries.
   *
   * A test used to steer by walking at a thing and hoping. There are buildings
   * and a wood in the way now, so it plans a route across this instead, which
   * is both more honest about what the world is and the only thing that gets
   * across a house with four rooms in it.
   */
  world: {
    width: number;
    height: number;
    /** One tile, on screen. */
    tile: number;
    cols: number;
    rows: number;
    blocked: string;
  };
  /**
   * Everything the green button reaches: this zone's pokeable props, any door
   * that is entered with a press rather than walked through, and every tree.
   *
   * Trees are in here because the game's rule is "the nearest one wins", and a
   * harness steering by a list the game does not use would be steering by a
   * different rule. What each tree currently *is* lives in `trees` below.
   *
   * Not the same list as "what the dot appears over" — a tree is reachable and
   * dotless. `promptDot` is what says whether the dot is actually on screen.
   */
  interactables: Marker[];
  /**
   * Whether the green proximity dot is showing. It marks a *selection* — the
   * one thing here the button is about — so props and press-doors raise it and
   * trees deliberately do not.
   */
  promptDot: boolean;
  /**
   * Every tree in the zone, and what is left of it.
   *
   * `standing` is a whole tree, `stump` is one she has felled, `gone` is one
   * whose stump she has knocked out — and only `gone` means the tile has been
   * handed back to the collision grid. `choppable` is the layout's decision;
   * an unchoppable tree shakes for ever and never leaves `standing`.
   */
  trees: TreeMarker[];
  /**
   * The four boxes and which one is lit. `slots` has a null for each empty box,
   * because an empty box is drawn and a test has to be able to see that.
   */
  tools: { slots: (string | null)[]; held: number; holding: string | null };
  /**
   * Put a tool in the first free box, standing in for the quest that will do it
   * later. Returns which box, or null if there was no room or she has one.
   */
  giveTool: (tool: string) => number | null;
  /** Take one back. Returns false for the axe, whoever asks. */
  takeTool: (tool: string) => boolean;
  /**
   * How many swings she has started, and how many blows have landed.
   *
   * Two numbers rather than one because they are two different claims: a swing
   * that started proves the button reached the animation, and a blow that
   * landed proves the animation reached the tree. A press during a swing is
   * neither, which is what makes holding green a rhythm instead of a stutter.
   */
  swings: number;
  whacks: number;
  /** This zone's doorways, at the centre of each opening. */
  doorways: DoorwayMarker[];
  /**
   * Named places worth standing in: the front of the house, the facade row, the
   * cave mouth, the wood. They come out of the map data, so a test steers to
   * "the woods" without knowing where the layout put it — and the screenshots
   * that audit how the world looks are taken at exactly these points.
   */
  landmarks: Marker[];
  /** How close the character must get before an interaction will fire. */
  interactRadius: number;
  /**
   * Whether the debug hitbox overlay is on screen — see DebugHitboxes. It is
   * normally a held key, which a screenshot cannot hold, so `debugHitboxes`
   * pins it and this reports what actually happened either way.
   */
  hitboxes: boolean;
  debugHitboxes: (on: boolean) => void;
  /**
   * What the renderer is actually managing. Headless Chromium runs this game an
   * order of magnitude slower than a real machine, and the exterior is a
   * culled tile layer plus a few hundred sprites, so it is worth being able to
   * ask rather than guess.
   */
  fps: number;
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
  /**
   * Stand her at a world-space point, camera and all.
   *
   * Strictly for the screenshot tour. The exterior is four thousand pixels
   * across and the harness drives it by holding arrow keys one round trip at a
   * time, so photographing five landmarks on foot costs minutes — and proves
   * nothing the walking tests do not already prove. Anything that asserts a
   * place is *reachable* still walks there.
   */
  teleport: (x: number, y: number) => void;
  /**
   * Pull the camera back until the whole zone is on screen, and put it back.
   *
   * The exterior is seventy tiles across and every other screenshot is a
   * close-up, so nothing in the audit trail could answer "does the composition
   * read from a distance" — which is the question the whole rebuild was about.
   * Strictly for that: the game itself never zooms.
   */
  overview: (fit: boolean) => void;
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
  player: {
    x: 0,
    y: 0,
    facing: 'down',
    anim: 'idle-down',
    flipped: false,
    artLoaded: false,
    frames: {},
  },
  camera: { x: 0, y: 0, width: 0, height: 0 },
  world: { width: 0, height: 0, tile: 0, cols: 0, rows: 0, blocked: '' },
  interactables: [],
  promptDot: false,
  trees: [],
  tools: { slots: [], held: 0, holding: null },
  giveTool: () => null,
  takeTool: () => false,
  swings: 0,
  whacks: 0,
  doorways: [],
  landmarks: [],
  interactRadius: 0,
  hitboxes: false,
  debugHitboxes: () => undefined,
  fps: 0,
  sparkles: 0,
  aliveParticles: 0,
  peakParticles: 0,
  pause: () => undefined,
  teleport: () => undefined,
  overview: () => undefined,
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
