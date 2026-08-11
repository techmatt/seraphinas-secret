/**
 * How a Cute Fantasy character sheet is laid out, as data.
 *
 * Nothing here hard-codes a frame index. A sheet is a grid, an animation is a
 * row of that grid, and a character is a stack of sheets that share the grid —
 * which is exactly the arrangement the pack ships. Every player sheet in
 * `Player/` is 576x3584 (measured off the PNGs, the read_me does not say), and
 * the NPC sheets in `Cute_Fantasy_Characters/` follow the same row convention
 * at a different frame size, so they land here as another CharacterSheet rather
 * than as another pile of numbers somewhere else.
 *
 * Two conventions come from the pack's author and are the reason this file can
 * be as short as it is:
 *
 *  - **Three directions on the sheet, four in the game.** Rows are drawn facing
 *    down, right and up. Left is right with `flipX`, never its own row.
 *  - **Paper dolls.** The body, shoes, trousers, shirt and hair are separate
 *    sheets on the same grid, drawn back to front. The layer order below is the
 *    one in the pack's own Aseprite file, so a shirt cannot end up under a
 *    torso.
 */

/** Which way she is facing in the game. */
export type Direction = 'down' | 'up' | 'left' | 'right';

/** Which way a row of the sheet is drawn. Left is absent on purpose. */
export type SheetDirection = 'down' | 'up' | 'right';

/** Everything she can be doing. Grows as rows of the sheet get used. */
export type AnimName = 'idle' | 'walk';

/** The row that gets mirrored when she walks left. */
export function sheetDirection(facing: Direction): SheetDirection {
  return facing === 'left' ? 'right' : facing;
}

/** The logical animation key a test reads: `walk-right`, `idle-down`. */
export function animKeyFor(name: AnimName, facing: Direction): string {
  return `${name}-${sheetDirection(facing)}`;
}

/** One row of one sheet: what it is, where it is, and how fast it runs. */
export interface AnimRow {
  name: AnimName;
  facing: SheetDirection;
  /** Row in the grid, counting from the top. */
  row: number;
  frames: number;
  frameRate: number;
}

/** One sheet in the stack. `file` is a URL under `public/`. */
export interface SheetLayer {
  /** Phaser texture key. */
  key: string;
  file: string;
}

export interface CharacterSheet {
  /** Prefixes this character's Phaser animation keys. */
  id: string;
  /** Frame grid, measured from the PNG. */
  frameWidth: number;
  frameHeight: number;
  columns: number;
  /** Back to front. Every layer shares the grid and the rows. */
  layers: SheetLayer[];
  anims: AnimRow[];
}

/** Where `npm run assets:sync` puts the pack, from the browser's point of view. */
const PLAYER = 'assets/Cute_Fantasy/Player';

/**
 * The player grid: 9 columns of 64x64 across 56 rows. The character is drawn
 * about 16x18 px in the middle of each frame — the rest is room for the swings
 * of the tool animations further down the sheet.
 */
const PLAYER_GRID = { frameWidth: 64, frameHeight: 64, columns: 9 } as const;

/**
 * Rows 0-2 are idle, 3-5 are the walk cycle, both in the pack's down / right /
 * up order. Idle is a slow breath rather than a hold, so it runs at half the
 * walk's rate.
 */
const PLAYER_ROWS: AnimRow[] = [
  { name: 'idle', facing: 'down', row: 0, frames: 6, frameRate: 6 },
  { name: 'idle', facing: 'right', row: 1, frames: 6, frameRate: 6 },
  { name: 'idle', facing: 'up', row: 2, frames: 6, frameRate: 6 },
  { name: 'walk', facing: 'down', row: 3, frames: 6, frameRate: 10 },
  { name: 'walk', facing: 'right', row: 4, frames: 6, frameRate: 10 },
  { name: 'walk', facing: 'up', row: 5, frames: 6, frameRate: 10 },
];

/**
 * Seraphina: long golden hair, a pink shirt and blue trousers. The colours are
 * chosen to hold up against both floors she walks on — a dusk-purple yard and
 * a brown floorboard house — because she has to be the easiest thing on screen
 * to find.
 *
 * The hair is the blessed outfit's, and it is the same style she always had:
 * the pack draws every hair style in five colours on one grid, so gold is a
 * different file and nothing else. Brown lost her against the wood and the
 * floorboards; gold is the one colour in the palette that nothing else outdoors
 * is wearing.
 */
export const SERAPHINA: CharacterSheet = {
  id: 'seraphina',
  ...PLAYER_GRID,
  layers: [
    { key: 'seraphina-base', file: `${PLAYER}/Player_Base/Player_Base_animations.png` },
    { key: 'seraphina-shoes', file: `${PLAYER}/Feet/Shoes_1_Brown.png` },
    { key: 'seraphina-legs', file: `${PLAYER}/Legs/OG_Pants/Pants_1_Blue.png` },
    { key: 'seraphina-chest', file: `${PLAYER}/Chest/OG_Shirt/Shirt_1_Pink.png` },
    { key: 'seraphina-hair', file: `${PLAYER}/Head/Hair_4/Hair_4_Blonde.png` },
  ],
  anims: PLAYER_ROWS,
};
