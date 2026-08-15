/**
 * The Secret Cave: one chamber, cut into the north cliff.
 *
 * Deliberately small and sparse. Twenty tiles by eleven is exactly one screen
 * at this scale, so it is a room she can see all of from the doorway, with one
 * thing in it worth walking to — the fire — and enough rubble round the edges
 * that the middle of the floor reads as cleared rather than empty. Dragons live
 * here someday; there is nothing dragon-shaped in it yet.
 *
 * **It is built out of the interior room system, not the pack's cave sheets.**
 * `Tiles/Cave/` does exist — a warm-brown rubble floor drawn as a 3x5 autotile
 * block, and a boulder wall — but that wall sheet is not a *run kit*: it has no
 * seamed left/right columns and its rows are nowhere near where `WALL_ROWS`
 * looks, so a cave material would have meant a second wall pipeline for one
 * room. The walls are therefore the room system's grey cobble (`stone`).
 *
 * The *floor* is the pack's, because a chamber built entirely out of somebody's
 * kitchen reads as a cellar with the light on — which is what the first cut of
 * this room looked like. `Cave_Floor_Middle.png` is a single flat tile of warm
 * dark rock, and one entry in `FLOOR_PATTERNS` (`cavern`) was enough to reach
 * it. What keeps it cozy rather than a dungeon is the fire and the four torches
 * on the wall, which throw real pools of light — see `glow` in the catalog.
 *
 *      0                     21
 *    0 +==== rock above ======+
 *    4 |  torches on the face |   <- three rows of wall face, capped in timber
 *    7 |                      |
 *   11 |       the fire       |   <- the chamber floor: 20 x 11
 *   17 |                      |
 *   18 +========= out ========+   <- the mouth, and the last row of the map
 */

import { Cells, rect, scatter } from '../../../tools/world/shapes.js';
import type { ZoneLayout } from '../../../tools/world/types.js';

export const COLS = 22;

/**
 * One row past the mouth, and no more. The opening is cut in the last row of
 * the map on purpose: a spare row underneath it would be unpainted, unblocked,
 * and therefore a corridor running the width of the world under the floor. The
 * house's front door is in its last row for the same reason.
 */
export const ROWS = 19;

/** How much wall face stands at the head of the chamber. The house's number. */
const FACE = 3;

/** The open floor: where her feet may go. Walls are drawn around and above it. */
const FLOOR = { x: 1, y: 7, w: 20, h: 11 };

/** Rows of the wall face: the one torches hang on, the one things stand on. */
const HUNG = FLOOR.y - FACE;
const STANDS = FLOOR.y - 2;

/**
 * The fire, and therefore the room — the point every other thing in here is
 * arranged around, in tiles, at the foot of the flame.
 *
 * It is not only scenery: the spell circle below is drawn around this point and
 * the ritual's two guests stand beside it. The quest writes the same two numbers down
 * itself rather than importing them — `content/` is build-time source and the
 * game only reads what the generator wrote — so if this moves, `FIRE` in
 * `src/quest/quests.ts` moves with it, and `quest.spec` is what notices if it
 * does not.
 */
export const FIRE = { x: 10.5, y: 11.5 } as const;

/**
 * How far the ring on the floor stands from the fire, in tiles.
 *
 * Two and a half — big enough that a four-year-old aiming a thumbstick lands in
 * it without having to mean to, and small enough that the rest of the chamber is
 * unmistakably outside it.
 *
 * The ring is the cave's, not the quest's: it is scratched into this floor
 * whether or not anybody is casting anything, which is why it is written here
 * and drawn for every visit. What the *ritual* does is agree to use it — the
 * quest writes the same numbers down itself, for the same reason `FIRE` is
 * written down twice, and `quest.spec` stands in the ring and presses the
 * buttons, which is what notices if the two ever stop meaning the same circle.
 */
const CIRCLE = 2.5;

/** The opening in the bottom wall, which is the way back out to the cliff. */
const MOUTH = rect(10, 18, 2, 1);

/**
 * Worn rock across the chamber floor: thin, and thinner still down the middle,
 * where the fire and its circle are going to be.
 */
const WORN = scatter({
  region: rect(FLOOR.x, FLOOR.y, FLOOR.w, FLOOR.h),
  images: ['caveStain', 'caveStain2', 'caveStain3'],
  chance: 0.22,
  spacing: 1,
  seed: 20_260_812,
  avoid: new Cells(rect(7, 9, 8, 6)),
});

export const CAVE: ZoneLayout = {
  id: 'cave',
  cols: COLS,
  rows: ROWS,
  // Nearly black, with a little warmth left in it. This is what shows through
  // wherever no tile is drawn, which in here is the rock above the wall.
  backdrop: 0x120d14,
  rooms: [{ id: 'chamber', floor: FLOOR, pattern: 'cavern', wall: 'stone', face: FACE }],
  openings: MOUTH,
  place: [
    // Torches on the wall face, spaced along it. The pack draws these as an
    // eight-frame strip, so the light in here moves.
    { image: 'torch', x: 3, y: HUNG },
    { image: 'torch', x: 8, y: HUNG },
    { image: 'torch', x: 13, y: HUNG },
    { image: 'torch', x: 18, y: HUNG },

    // Somebody camps here. The barrels and the log say so without a word, and
    // both stand with their feet on the skirting row, the way the house's
    // furniture does.
    { image: 'barrel', x: 5, y: STANDS },
    { image: 'barrelBlue', x: 6.1, y: STANDS - 0.2 },
    { image: 'log', x: 14.6, y: 9.4 },
    { image: 'picnicBasket', x: 16.2, y: 10.2 },

    // Worn patches in the rock, laid flat. Twenty tiles of one flat brown is a
    // floor nobody has ever walked on; these are what make it ground.
    ...WORN,

    // Rubble round the edges, all of it walk-through. It keeps off the middle
    // of the floor and off the line between the mouth and the fire: this is a
    // room she is going to be steered across by somebody who is four.
    { image: 'rock', x: 2, y: 8.4 },
    { image: 'rockSmall', x: 3.4, y: 9.2 },
    { image: 'mossyStump', x: 1.5, y: 12.6 },
    { image: 'rock', x: 19.2, y: 8.6 },
    { image: 'rockSmall', x: 17.6, y: 9.4 },
    { image: 'rock', x: 20, y: 13.4 },
    { image: 'rockSmall', x: 4.2, y: 16.4 },
    { image: 'rockSmall', x: 16.8, y: 16.2 },
    { image: 'toadstoolPurple', x: 2.6, y: 15.4 },
    { image: 'toadstoolBlue', x: 18.4, y: 15.5 },
    { image: 'toadstoolPurple', x: 6.5, y: 8.5 },
  ],
  spawns: {
    // A couple of tiles inside the mouth, facing into the room — she has walked
    // in, so the first thing on screen is the fire she was sent to, and she is
    // clear of the doorway she came through. See `doorwaysArmed` in RoomScene.
    start: { x: 10.9, y: 15.4, facing: 'up' },
    from_outside: { x: 10.9, y: 15.4, facing: 'up' },
  },
  doorways: [
    {
      id: 'cave_to_outside',
      x: 10,
      y: 17.2,
      w: 2,
      h: 1.8,
      to: 'outside',
      toSpawn: 'from_cave',
      // Walking out is the whole interaction, in here and in every interior.
      // Only doors you walk *into* ask for a press — see the Outside.
      enter: 'walk',
      flourish: 'hush',
      tint: 0xffd98a,
      facing: 'down',
    },
  ],
  props: [
    // The one thing in here worth pressing.
    // The logs block their own tile — see `campfire` in the catalog — so she
    // walks round the fire rather than standing in it, which is also what keeps
    // the middle of the ritual's circle clear.
    {
      id: 'cave_campfire',
      image: 'campfire',
      x: FIRE.x - 0.5,
      y: FIRE.y - 2,
      // Over the flame rather than the middle of a two-tile picture, so the
      // green dot is on the fire and not on the smoke above it.
      at: { x: FIRE.x, y: FIRE.y - 0.6 },
      line: 'seraphina_campfire',
    },
    { id: 'cave_hoard', image: 'chest', x: 3, y: 13.6, line: 'seraphina_secret' },
  ],
  landmarks: [
    { id: 'cave_fire', x: FIRE.x, y: FIRE.y + 2 },
    { id: 'cave_chamber', x: 10.9, y: 15 },
  ],
  // Round the fire, and the reason the middle of the floor was left clear.
  circle: { x: FIRE.x, y: FIRE.y, r: CIRCLE },
};
