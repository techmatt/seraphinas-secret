/**
 * Which slices of the pack's icon sheet a tool is drawn from.
 *
 * The same arrangement as `tools/world/catalog.ts` and for the same reason —
 * measure somebody else's PNG once and write it down — but on this side of the
 * fence, because the generator has no business knowing what an axe looks like in
 * a box and the game may not reach into `tools/`. The world catalog describes
 * places; this describes the HUD.
 *
 * `Tool_Icons_Outline.png` is ten 16x16 icons in a row: bow, axe, pickaxe,
 * hammer, sword, hoe, watering can, fishing rod, satchel, torch. The outlined
 * set rather than the bare one, because these are drawn over a dark frame and
 * the outline is what stops a grey axe head disappearing into it.
 */

/** Where `npm run assets:sync` puts the pack, from the browser's point of view. */
const ICONS = 'assets/Cute_Fantasy/Icons/Outline/Tool_Icons_Outline.png';

/** One icon on the sheet: the file, and which 16-pixel slot along it. */
export interface IconDef {
  /** Phaser texture key. One key per sheet; the slot is a frame inside it. */
  file: string;
  /** Slot index from the left. */
  slot: number;
}

export const ICON_SIZE = 16;

export const TOOL_ICONS = {
  axe: { file: ICONS, slot: 1 },
  hammer: { file: ICONS, slot: 3 },
} as const satisfies Record<string, IconDef>;

/** Every sheet an icon comes off, so a scene can queue them in one line. */
export const ICON_SHEETS = [...new Set(Object.values(TOOL_ICONS).map((i) => i.file))];
