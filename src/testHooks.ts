/**
 * The only surface Playwright is allowed to touch.
 *
 * Automated tests need to know the game booted and where the character is
 * without reading pixels. Keeping that on one narrow object means gameplay code
 * never grows test-shaped hacks, and the test spec has exactly one contract to
 * break.
 */

import { getAudioContext } from './audio/context';
import type { SessionData } from './state/session';

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

export interface NpcMarker extends Marker {
  /** Which way they are turned right now — they turn to face her when spoken to. */
  facing: 'down' | 'up' | 'left' | 'right';
  /** Everything they can say, in the order repeated presses will say it. */
  lines: string[];
}

/**
 * The quest, as everything outside the quest engine sees it.
 *
 * Two halves, and the split is the useful part. Everything down to `held` comes
 * off the engine and the session store, so it is the same answer in every zone —
 * which is how "she went indoors and came out again and is still halfway through"
 * becomes a thing a test can assert rather than a thing a person has to watch.
 * `objects` is what *this* zone has actually put on the ground because of it, and
 * it is the only way to catch the bookkeeping and the picture disagreeing.
 */
export interface QuestHooks {
  /** Which quest is on, or null. There is never more than one. */
  id: string | null;
  /** Which phase of it, by the quest's own phase id. */
  phase: string | null;
  /** The line the yellow button replays, and what the giver says if asked. */
  instruction: string | null;
  /** Whose voice that is: the npc who handed the job out. */
  giver: string | null;
  /** Who is wearing a thought bubble in this zone, or null once it is taken. */
  offering: string | null;
  /** Whether the bubble is actually built and on screen. */
  marker: boolean;
  /** The quest row, left to right. Empty when the phase wants nothing. */
  slots: { id: string; filled: boolean }[];
  /** Quest items in her pocket, in the order she found them. */
  held: string[];
  /** What this phase has standing in this zone right now. */
  objects: { id: string; x: number; y: number; broken: boolean }[];
  /** Whether this zone has the ritual's circle drawn on its floor. */
  circle: boolean;
  /**
   * Whether she is standing in it — which is exactly the question "does the
   * spell own the face buttons right now", and the reason it is worth a hook of
   * its own: the rule is a place, and a test has to be able to be in it.
   */
  inCircle: boolean;
  /** The colour he is asking for, or null when the sequence is finished. */
  step: string | null;
}

/**
 * What time of day it is, and what the evening has done about it.
 *
 * The clock itself is a single number — milliseconds since she woke — and every
 * other field here is something drawn *because* of that number, which is the
 * only reason they are worth reporting separately: a test that only saw the
 * clock could not tell "dusk arrived" from "dusk arrived and nothing happened".
 * See `state/dayClock.ts` and `world/dusk.ts`.
 */
export interface DayHooks {
  /** Milliseconds since she last woke up. */
  elapsed: number;
  /** 0 in full daylight, 1 once the evening has finished coming in. */
  dusk: number;
  /** Whether this zone is one the evening happens in at all. */
  outdoors: boolean;
  /** How many fireflies are out. Zero indoors, and zero in daylight. */
  fireflies: number;
  /** How many `glow`-flagged pictures are standing in this zone. */
  lamps: number;
  /** How far up their evening halo is, 0 to 1. */
  lampGlow: number;
  /** Whether Dad has called her in from the house yet today. */
  dadCalled: boolean;
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
   * Everything the green button reaches: this zone's pokeable props, its people,
   * and any door entered with a press rather than walked through. Nearest wins,
   * and the winner is what the dot is over — so this list is exactly the list of
   * things that can wear the dot.
   *
   * Trees are deliberately not in it. The axe is what green does when this list
   * has nothing in reach, so a tree is never in competition with a shed; what
   * each tree currently *is* lives in `trees` below.
   */
  interactables: Marker[];
  /**
   * Whether the green proximity dot is showing. It marks a *selection* — the one
   * thing here the button is about — so everything in `interactables` raises it
   * and nothing else does.
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
   * The people in this zone. They are also in `interactables` — the green button
   * treats a person exactly like a chest — and this is the extra half a test
   * needs: which way they are turned, and what they are going to say next.
   */
  npcs: NpcMarker[];
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
  /** Where she is in the one quest that can be running. See QuestHooks. */
  quest: QuestHooks;
  /**
   * The session store, copied out.
   *
   * Read-only by construction rather than by promise: it hands back a deep copy,
   * so a test can look at the thing the whole game is remembering and cannot
   * accidentally become part of it. A function rather than a field because it is
   * a snapshot of something that changes, and a field would be a snapshot of
   * whenever the last frame happened to run.
   */
  session: () => SessionData;
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
  /**
   * Frames in which a tree that still exists had nothing drawn for it.
   *
   * The number the felling animation is judged by, and it must stay zero. A tree
   * pivots out of its own tile early in its fall, so a stump raised when the fall
   * *lands* leaves a beat of bare ground where a tree was standing — one visible
   * frame's worth of the world forgetting itself, which no screenshot can be
   * pointed at. Counted every frame instead; see `watchForStumpGap`.
   */
  treeGaps: number;
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
  /**
   * Nights slept.
   *
   * Counted rather than inferred from the store, because the store after a
   * night's sleep is indistinguishable from the store before anything ever
   * happened — that is the whole point of it — so "she slept" and "she never had
   * a quest in the first place" would otherwise be the same reading. It is also
   * the only edge a test can wait on: the sequence runs for three seconds and
   * ends in a scene restart, and this goes up the instant the second press
   * lands.
   */
  sleeps: number;
  /** What time of day it is, and what the light is doing about it. See DayHooks. */
  day: DayHooks;
  /**
   * Skip the day forward. Strictly for the suite.
   *
   * The evening arrives eight minutes after she wakes and takes two more to
   * finish arriving, and no test is waiting ten minutes for it. Shortening those
   * constants under a test would be testing a day she never plays, so this
   * pushes the same clock along instead and every threshold stays where it
   * really is. See `dayClock.warp`.
   */
  warpDay: (ms: number) => void;
  /**
   * The lines she said at bedtime, in order, most recent night.
   *
   * The one part of the recap worth pinning: *which* sentences a day earns is
   * logic, and it is decided once from a store snapshot taken before the night
   * clears it — see `state/recap.ts`. How they are paced over the starfield is
   * Matt's eyes, not a number a test should be guarding.
   */
  recap: string[];
  /**
   * Wrong buttons pressed inside the spell circle.
   *
   * Counted rather than inferred, because the claim a wrong press makes is a
   * negative one — nothing moved — and a test that only checked the state was
   * unchanged would pass just as well against a button that did nothing at all.
   */
  ritualMisses: number;
  /**
   * Where the faeries are, or empty before they exist. Read every frame, so
   * "they came with her through the door" is a thing the suite can settle.
   */
  faeries: { x: number; y: number }[];
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
  /**
   * The balloon: whether it is up, whose it is, and where in the world it sits.
   *
   * `speaker` is the load-bearing field. A balloon that always appears over the
   * player says nothing about who is talking, and which of the two people on
   * screen the words belong to is the one thing a pre-reader has to get out of a
   * conversation. `x, y` is what makes that checkable rather than claimed — it
   * has to be over her sister, not merely labelled with her sister's name.
   */
  bubble: { visible: boolean; speaker: string; x: number; y: number };
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
  npcs: [],
  tools: { slots: [], held: 0, holding: null },
  giveTool: () => null,
  takeTool: () => false,
  quest: {
    id: null,
    phase: null,
    instruction: null,
    giver: null,
    offering: null,
    marker: false,
    slots: [],
    held: [],
    objects: [],
    circle: false,
    inCircle: false,
    step: null,
  },
  session: () => ({ run: { quest: null, items: [], granted: [], faeries: false }, world: {} }),
  swings: 0,
  whacks: 0,
  treeGaps: 0,
  doorways: [],
  landmarks: [],
  interactRadius: 0,
  hitboxes: false,
  debugHitboxes: () => undefined,
  fps: 0,
  sparkles: 0,
  sleeps: 0,
  day: {
    elapsed: 0,
    dusk: 0,
    outdoors: false,
    fireflies: 0,
    lamps: 0,
    lampGlow: 0,
    dadCalled: false,
  },
  warpDay: () => undefined,
  recap: [],
  ritualMisses: 0,
  faeries: [],
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
    bubble: { visible: false, speaker: 'seraphina', x: 0, y: 0 },
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
