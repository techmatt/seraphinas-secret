/**
 * Which slices of the pack's icon sheets a carried thing is drawn from.
 *
 * The same arrangement as `tools/world/catalog.ts` and for the same reason —
 * measure somebody else's PNG once and write it down — but on this side of the
 * fence, because the generator has no business knowing what an axe looks like in
 * a box and the game may not reach into `tools/`. The world catalog describes
 * places; this describes the things she carries, and the two small pictures a
 * quest puts on the ground for her to pick up.
 *
 * Every sheet here is an exact grid of 16-pixel cells, which is why they are
 * loaded as Phaser spritesheets and addressed by frame number rather than by
 * rectangle. That is also what lets one entry serve both jobs a gem has: the
 * lump of rock standing in the grass and the gem drawn in its slot on the HUD
 * are two frames of the same sheet.
 *
 * `Tool_Icons_Outline.png` is ten 16x16 icons in a row: bow, axe, pickaxe,
 * hammer, sword, mallet, spade, fishing rod, ore, torch. The outlined set rather
 * than the bare one, because these are drawn over a dark frame and the outline is
 * what stops a grey axe head disappearing into it — and, for the one that gets
 * left lying in the grass, what stops it disappearing into the road.
 */

/** Where `npm run assets:sync` puts the pack, from the browser's point of view. */
const ICONS = 'assets/Cute_Fantasy/Icons/Outline/Tool_Icons_Outline.png';

/**
 * `Ores.png`: eight columns by eight rows of 16x16 cells, and both axes mean
 * something. Down the sheet are the ores — plain stone, copper, gold, green,
 * blue, amber, red, purple — and across it are the forms each comes in: a stone
 * with the gem showing in column 0, whole crystal lumps in 1 to 4, then loose
 * gems, a cluster and an ingot in 5 to 7 drawn as item icons with a cream
 * outline round them.
 *
 * So a gem is two frames of one sheet: column 1 is what she finds in the grass
 * and column 6 is what ends up in her pocket. Measured with `world:measure` and
 * read off the pixels; the pack ships no read_me but the grid is exact.
 */
const ORES = 'assets/Cute_Fantasy/Outdoor decoration/Ores.png';

const ORE_COLUMNS = 8;

/**
 * The UI pack's icon sheet — 39 columns by 16 rows of 16x16 cells, and the only
 * thing in this game drawn from a pack other than the base one.
 *
 * Its first row is five things in filled / half / empty triples: heart, star,
 * coin, lightning, shield. The coin is the third triple, so a whole gold coin is
 * column 6 of row 0 and the sheet is 39 wide — hence the frame number below,
 * which is `0 * 39 + 6`. Measured with `world:measure`; the pack ships a
 * license-only readme, as they all do.
 *
 * The empty coin at column 8 is deliberately unused. An empty slot in this game
 * is a *ghost of the thing itself* — see QuestRow — and the pack's empty coin is
 * near enough black to disappear into the dark box it would be drawn on.
 */
const UI_ICONS = 'assets/Cute_Fantasy_UI/UI/UI_Icons.png';

/** One icon on a sheet: the file, and which 16-pixel slot along it. */
export interface IconDef {
  /** Phaser texture key. One key per sheet; the slot is a frame inside it. */
  file: string;
  /** Slot index from the left, or frame number on a grid. */
  slot: number;
}

export const ICON_SIZE = 16;

export const TOOL_ICONS = {
  axe: { file: ICONS, slot: 1 },
  hammer: { file: ICONS, slot: 3 },
} as const satisfies Record<string, IconDef>;

/** The one coin picture: gold, whole, 16x16. Both a filled slot and a ghost. */
export const COIN_ICON: IconDef = { file: UI_ICONS, slot: 6 };

/**
 * The three magic stones, by the names Sneak calls them.
 *
 * `rock` is the lump standing in the world, `slot` is the gem on the quest row.
 * The colours are the pack's own and they are the whole of the reading: she is
 * four, and "the green one" is a thing she can be told and can then find.
 */
export interface GemDef extends IconDef {
  /** Frame of the same sheet for the rock she cracks open. */
  rock: number;
  /** What its burst and its shimmer are tinted. */
  tint: number;
}

const gem = (row: number, tint: number): GemDef => ({
  file: ORES,
  rock: row * ORE_COLUMNS + 1,
  slot: row * ORE_COLUMNS + 6,
  tint,
});

export const GEM_ICONS = {
  malachite: gem(3, 0x63c74d),
  sapphire: gem(4, 0x33bdf7),
  ruby: gem(6, 0xe8483f),
} as const satisfies Record<string, GemDef>;

/** The three stones, by name. */
export type GemId = keyof typeof GEM_ICONS;

export const GEM_IDS = Object.keys(GEM_ICONS) as GemId[];

/**
 * Every sheet an icon comes off, so a scene can queue them in one line. All
 * three are cut on the same 16-pixel grid, which is the only reason one loader
 * call does for all of them.
 */
export const ICON_SHEETS = [
  ...new Set([
    ...Object.values(TOOL_ICONS).map((i) => i.file),
    ...Object.values(GEM_ICONS).map((i) => i.file),
    COIN_ICON.file,
  ]),
];
