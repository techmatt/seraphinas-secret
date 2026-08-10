/**
 * Design resolution. The canvas scales to fit whatever window it lands in, so
 * every scene can lay itself out against these numbers and forget about the
 * real window size.
 *
 * These live apart from main.ts on purpose: main.ts constructs the game as a
 * side effect, and scenes importing the entry point back would be a cycle.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Pixels per tile in the Cute Fantasy pack. Map data is measured in these. */
export const TILE = 16;

/**
 * The one scale the whole world agrees on.
 *
 * Tiles, buildings, trees and Seraphina are all drawn by the same artist at the
 * same pixel density, so exactly one number turns pack pixels into screen
 * pixels — and any second number would be the thing that makes her too big for
 * her own front door. Four puts twenty tiles across the screen: her house is
 * six of them wide, she is about one, and the camera has somewhere to go.
 *
 * A whole number, because a fractional one is what turns square pixels into
 * uneven ones.
 */
export const WORLD_SCALE = 4;

/** One tile, on screen. */
export const TILE_SIZE = TILE * WORLD_SCALE;

/**
 * Draw order. Everything between `ground` and `hud` sorts by its own base y, so
 * a tree she is standing in front of covers her and one she is behind does not
 * — which is why the middle of this list is a gap rather than a number.
 */
export const DEPTH = {
  ground: -100,
  /** Rugs and anything else lying flat: above the tiles, under every sprite. */
  floorPiece: -80,
  /** Light on the floor: under the things standing on it. */
  doorLight: -50,
  /** ...y-sorted world objects live here, at their own base y... */
  /** The hitbox overlay: over everything in the world, under everything in the UI. */
  debug: 80_000,
  prompt: 90_000,
  sparkles: 95_000,
  speech: 100_000,
  hud: 100_100,
} as const;
