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
  /**
   * The evening, laid over the world outdoors: above every standing thing, so
   * the whole place dims together rather than a house at a time.
   *
   * Three layers, because the point of the evening is what it makes visible.
   * `dusk` is the sheet of blue that takes the light out; `duskLight` is the
   * halo a lamp post throws once there is something for it to throw it *into*;
   * `fireflies` are the motes that come out over both. Everything above this —
   * the overlay, the faeries, the green dot, the balloon, the row along the
   * bottom — is deliberately out of reach of it: nothing she is being asked to
   * press may ever be dimmed.
   */
  dusk: 79_000,
  duskLight: 79_001,
  fireflies: 79_002,
  /** The hitbox overlay: over everything in the world, under everything in the UI. */
  debug: 80_000,
  /**
   * The faeries: over every standing thing, so a barrel never eats one — and
   * under the green dot, the balloon and the row along the bottom, so three
   * lights bobbing round her head can never be what hides the thing she is
   * being asked to press.
   */
  faeries: 85_000,
  prompt: 90_000,
  sparkles: 95_000,
  /**
   * The open book: a takeover, so it covers the world, the green dot and every
   * sparkle coming off either.
   *
   * Under the balloon and under the HUD rows, which is deliberate on both
   * counts. Hazel's delight as a page turns is somebody talking and has to be
   * readable over the page she is talking about; the rows are taken off screen
   * by hand while the book is up rather than drawn over — see
   * `RoomScene.openBook` — because a takeover that left the tool belt showing
   * would be asking her to press a button that does nothing.
   */
  book: 99_000,
  speech: 100_000,
  hud: 100_100,
} as const;
