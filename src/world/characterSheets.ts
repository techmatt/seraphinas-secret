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
export type AnimName = 'idle' | 'walk' | 'chop';

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
  /**
   * How many times it repeats after the first pass. Absent means for ever,
   * which is what standing and walking do. A swing is `0`: it happens once and
   * she goes back to standing there.
   */
  repeat?: number;
}

/** The key an override table is written under: `chop-right`, `walk-down`. */
export type RowKey = `${AnimName}-${SheetDirection}`;

/** One sheet in the stack. `file` is a URL under `public/`. */
export interface SheetLayer {
  /** Phaser texture key. */
  key: string;
  file: string;
  /**
   * Columns in *this* sheet, when it is not laid out on the character's grid.
   *
   * The pack ships a tool as a crop rather than as a full-height paper doll: the
   * iron tools are six columns by twelve rows, being four tools' worth of three
   * directions, against the character's own nine by fifty-six. Same 64-pixel
   * frame, different grid — so the frame index has to be worked out per layer.
   */
  columns?: number;
  /**
   * Which of the character's animations this layer draws at all, and which of
   * its own rows draws each one.
   *
   * A layer with this is a *partial* one: it is hidden during anything not
   * listed. That is the whole reason the axe can be a layer rather than a
   * separate sprite — she is only ever drawn holding it during the swing,
   * because the swing is the only thing the pack drew her holding it during.
   */
  rows?: Partial<Record<RowKey, number>>;
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
  /**
   * How big this character is drawn, as a fraction of everybody else. Absent is
   * full size.
   *
   * The pack draws one body and the game scales it, which is the only way a
   * little sister is little: there is no smaller sheet. The *product* of this
   * and WORLD_SCALE has to be a whole number, for the same reason WORLD_SCALE is
   * one — a fractional scale turns square pixels into uneven ones, and a
   * four-year-old will not know why her sister looks smudged.
   */
  scale?: number;
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
 *
 * Rows 35-37 are the axe swing, in the same order. The pack ships no frame tags
 * and its read_me is licence text, so this was measured off the PNGs: rows 6-49
 * come in triples, and the pair of triples at 35-37 and 38-40 are the only ones
 * whose hands travel from above her head to below her knees across six frames.
 * Overlaying the iron-tools sheet on each candidate settled which — the axe's
 * handle lands in her hands in every frame of 35-37, and its swoosh arc is drawn
 * to match that body. See CHOP_ROWS below for its half of the same measurement.
 *
 * 38-40 is the identical body under a different tool. It is left unmapped: a
 * hammer swing is a later prompt's problem, and mapping a row nothing draws
 * would be a guess written down as a fact.
 */
const STANDING_ROWS: AnimRow[] = [
  { name: 'idle', facing: 'down', row: 0, frames: 6, frameRate: 6 },
  { name: 'idle', facing: 'right', row: 1, frames: 6, frameRate: 6 },
  { name: 'idle', facing: 'up', row: 2, frames: 6, frameRate: 6 },
  { name: 'walk', facing: 'down', row: 3, frames: 6, frameRate: 10 },
  { name: 'walk', facing: 'right', row: 4, frames: 6, frameRate: 10 },
  { name: 'walk', facing: 'up', row: 5, frames: 6, frameRate: 10 },
];

const PLAYER_ROWS: AnimRow[] = [
  ...STANDING_ROWS,
  // Twelve a second: half a second of swing, which is long enough to read as a
  // wind-up and short enough that she is never waiting to be allowed to move.
  { name: 'chop', facing: 'down', row: 35, frames: 6, frameRate: 12, repeat: 0 },
  { name: 'chop', facing: 'right', row: 36, frames: 6, frameRate: 12, repeat: 0 },
  { name: 'chop', facing: 'up', row: 37, frames: 6, frameRate: 12, repeat: 0 },
];

/**
 * The axe, on its own grid.
 *
 * `Iron_Tools.png` is six columns by twelve rows of the same 64-pixel frame:
 * four tools, three directions each, in the sheet's own order — axe, pickaxe,
 * hoe, watering can. The axe is the first three, which is the only group drawn
 * as a wide sweep with a swoosh rather than as a downward thrust into the
 * ground. Nothing else in the sheet is mapped, because nothing else is a tool
 * she has.
 */
const AXE_ROWS: Partial<Record<`${AnimName}-${SheetDirection}`, number>> = {
  'chop-down': 0,
  'chop-right': 1,
  'chop-up': 2,
};

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
    { key: 'seraphina-hands', file: `${PLAYER}/Hands/Hands_1_Bare.png` },
    { key: 'seraphina-hair', file: `${PLAYER}/Head/Hair_4/Hair_4_Blonde.png` },
    // Last, because the pack's own layer order ends `hands, tool_top` — the axe
    // is drawn in front of the girl holding it, which is what an axe swung
    // towards the camera does.
    {
      key: 'seraphina-axe',
      file: `${PLAYER}/Tools/Iron/Iron_Tools.png`,
      columns: 6,
      rows: AXE_ROWS,
    },
  ],
  anims: PLAYER_ROWS,
};

/**
 * The rest of the cast, drawn off the same body.
 *
 * The pack's own NPC sheets are no help here: `NPCs (Premade)/` is eight adults
 * with jobs — a bartender, a miner, a chef — and `Cute_Fantasy_Characters/` is
 * knights, orcs, goblins and angels on a different grid again. There is no
 * child in the pack except the one the paper doll makes, so a child is what the
 * paper doll makes. Which is the arrangement paying off rather than a
 * compromise: a new person is six file paths, on the grid everything already
 * agrees on, with the walk cycle and the idle breath already registered.
 *
 * They are given `STANDING_ROWS` and no axe. Nobody but Seraphina swings
 * anything, and a chop row mapped for somebody who cannot chop is a fact
 * written down that nothing checks.
 */
const kid = (
  id: string,
  parts: { hair: string; shirt: string; legs: string; feet: string },
  scale?: number,
): CharacterSheet => ({
  id,
  ...PLAYER_GRID,
  layers: [
    { key: `${id}-base`, file: `${PLAYER}/Player_Base/Player_Base_animations.png` },
    { key: `${id}-shoes`, file: `${PLAYER}/Feet/${parts.feet}.png` },
    { key: `${id}-legs`, file: `${PLAYER}/Legs/OG_Pants/${parts.legs}.png` },
    { key: `${id}-chest`, file: `${PLAYER}/Chest/OG_Shirt/${parts.shirt}.png` },
    { key: `${id}-hands`, file: `${PLAYER}/Hands/Hands_1_Bare.png` },
    { key: `${id}-hair`, file: `${PLAYER}/Head/${parts.hair}.png` },
  ],
  anims: STANDING_ROWS,
  ...(scale === undefined ? {} : { scale }),
});

/**
 * Sneak: next door, her age, and reading. Short tousled brown hair against her
 * long gold, and a purple shirt — the one colour nobody else in the village
 * wears, and the nearest the pack's palette comes to a wizard. His spell book
 * is a separate sprite lying open at his feet; there is no frame of anybody
 * holding a book, and a boy standing over one reads as reading.
 */
export const SNEAK: CharacterSheet = kid('sneak', {
  hair: 'Hair_2/Hair_2_Brown',
  shirt: 'Shirt_1_Purple',
  legs: 'Pants_1_Brown',
  feet: 'Shoes_1_Brown',
});

/**
 * Hazel: the little sister, and little is the whole of it. There is no smaller
 * body in the pack, so she is the same one at three quarters — which is 3x
 * against everybody else's 4x, and so still a whole number of screen pixels per
 * pack pixel. Anything else would draw her out of a different, blurrier game.
 *
 * Brown hair in a bun and an orange shirt: family enough to be a sister, unlike
 * enough that a four-year-old never has to look twice to tell which one she is
 * driving.
 */
export const HAZEL: CharacterSheet = kid(
  'hazel',
  {
    hair: 'Hair_6/Hair_6_Brown',
    shirt: 'Shirt_1_Orange',
    legs: 'Pants_1_Brown',
    feet: 'Shoes_1_Brown',
  },
  0.75,
);

/**
 * Every sheet a map file may name. Map data carries the string; this is the one
 * place that turns it into layers — the same arrangement as a line id and the
 * voice manifest, so a person in the layout is authored content and never a
 * pile of file paths in `content/`.
 */
export const CHARACTER_SHEETS: Record<string, CharacterSheet> = {
  seraphina: SERAPHINA,
  sneak: SNEAK,
  hazel: HAZEL,
};
