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

import Phaser from 'phaser';

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

/**
 * `Crops.png`: seven columns by twenty-two crops, two 16-pixel rows each. Per
 * crop the row runs sign, seed jar, sprout, two growing stages, the mature plant
 * standing in the ground, and the harvested item with a cream outline — so a
 * crop's world form and its pocket form are two cells of one row.
 *
 * It divides exactly on the 16-pixel grid, seven wide, which is the only reason
 * one frame number does for it: the carrot in the ground is row 5, column 5.
 */
const CROPS = 'assets/Cute_Fantasy/Crops/Crops.png';

/**
 * The food icons, eight columns by twelve rows of 16 px. The outlined set, for
 * the reason everything else here is outlined: these are drawn on a dark box and
 * on a dirt road, and the cream edge is what stops them being part of either.
 */
const FOOD_ICONS = 'assets/Cute_Fantasy/Icons/Outline/Food_Icons_Outline.png';

/**
 * The resource icons, six by six. Row 4 column 0 is a cut log with its rings
 * showing, which is this game's picture of "a tree came down".
 */
const RESOURCE_ICONS = 'assets/Cute_Fantasy/Icons/Outline/Resources_Icons_Outline.png';

/**
 * The UI pack's book sheet, and the one rectangle of it this game uses: an open
 * two-page spread, 224x134 pixels at (8, 5).
 *
 * The only picture in twelve packs that is already the thing the book reader
 * draws — a tan spread with a spine down the middle and two blank pages either
 * side of it — so the reader is a picture with a sentence laid on it rather than
 * a rectangle somebody drew in code. Measured with `world:measure`, like every
 * other rectangle in this game.
 *
 * It is loaded as a plain image and given one named sub-frame, rather than as a
 * spritesheet: 1680x432 divides on the 16-pixel grid, but the spread does not
 * sit on it — it is 14 tiles across starting half a tile in. That is the same
 * arrangement `BUNNY_ICON` has, and `frameOf` in QuestRow already knows both.
 */
export const BOOK_SHEET = 'assets/Cute_Fantasy_UI/UI/Book_UI.png';
export const BOOK_SPREAD = { frame: 'bookSpread', x: 8, y: 5, w: 224, h: 134 } as const;

/**
 * Register the spread as a named frame on the sheet. Idempotent, and safe to
 * call before the sheet has arrived — a zone whose art never loaded draws the
 * reader's own fallback and throws nothing.
 */
export function registerBookArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BOOK_SHEET)) return;
  const texture = scene.textures.get(BOOK_SHEET);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  if (texture.has(BOOK_SPREAD.frame)) return;
  texture.add(BOOK_SPREAD.frame, 0, BOOK_SPREAD.x, BOOK_SPREAD.y, BOOK_SPREAD.w, BOOK_SPREAD.h);
}

/**
 * `Placeable_Decoration.png`: nine columns by eleven rows of 16-pixel cells of
 * small things that sit on furniture. Row 3, column 5 is a little open book —
 * the same cell `tools/world/catalog.ts` calls `book` and stands on the shelf in
 * her bedroom, which is why it needs no measuring: it has been in the world
 * since the house was built.
 *
 * The storybook is drawn from it rather than from the reader's own two-page
 * spread, which is fourteen times the size and comes out a thin sliver at one
 * tile. The picture she picks up, the box on the quest row and the book lying
 * open on the rug are all this one cell.
 */
const DECOR = 'assets/Cute_Fantasy/Buildings/House_Decor/Placeable_Decoration.png';
const DECOR_COLUMNS = 9;

export const BOOK_ICON: IconDef = { file: DECOR, slot: 3 * DECOR_COLUMNS + 5 };

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
 * A carrot, twice: one standing in the ground and one in her pocket.
 *
 * Two sheets rather than the two cells of `Crops.png` the pack pairs, because
 * the pocket half is drawn for a box and the ground half is drawn for the
 * ground. The outlined food icon is also on a sheet the HUD already reaches for,
 * so it costs nothing that the crop sheet's own icon would not.
 */
export const CARROT_WORLD: IconDef = { file: CROPS, slot: 5 * 7 + 5 };
export const CARROT_ICON: IconDef = { file: FOOD_ICONS, slot: 4 * 8 + 2 };

/**
 * The log: what a felled tiny tree puts in a box on the quest row.
 *
 * The row draws the thing she is collecting, and what the pen phase collects is
 * *falls* — so the box holds what a fall leaves, not what she is hitting. It is
 * also the only picture in the pack that reads as "wood" at 48 pixels; a tiny
 * tree at that size is a green smudge, and the box next to it would be a tiny
 * tree that had not been felled yet, which is the opposite of what it means.
 */
export const LOG_ICON: IconDef = { file: RESOURCE_ICONS, slot: 4 * 6 + 0 };

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
    CARROT_WORLD.file,
    CARROT_ICON.file,
    LOG_ICON.file,
    BOOK_ICON.file,
  ]),
];
