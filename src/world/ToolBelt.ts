/**
 * What she is carrying: four slots, one of them welded shut.
 *
 * The axe lives in slot one and can never be taken out of it, because the first
 * thing a four-year-old learns about this game must not be a thing the game can
 * later take away. Slots two to four are the quest system's, and they are built
 * now and empty on purpose — a row that grows a box when you are given something
 * is a row that changed shape, and a row that had an empty box in it all along is
 * a row that filled up. She can see the difference; she cannot read either.
 *
 * There is one of these per page load rather than one per scene. Walking through
 * a doorway rebuilds the room scene from scratch, and an inventory that emptied
 * itself every time she went indoors would be the same bug as losing progress.
 */

import { TOOL_ICONS } from '../ui/toolIcons';

/** Everything she can be given. Grows as quests grant things. */
export type ToolId = keyof typeof TOOL_ICONS;

/** How many boxes are on the row. Every one of them is drawn, filled or not. */
export const SLOTS = 4;

/** The one she starts with and keeps. */
export const PERMANENT: ToolId = 'axe';

/** Which slot that is. Slot one, and it is never anywhere else. */
const PERMANENT_SLOT = 0;

export class ToolBelt {
  private readonly boxes: (ToolId | null)[] = Array.from({ length: SLOTS }, (_, i) =>
    i === PERMANENT_SLOT ? PERMANENT : null,
  );

  /** Which box is lit. Always a filled one — see `settle`. */
  private slot = PERMANENT_SLOT;

  /** The row, left to right, with a null for each empty box. */
  get slots(): readonly (ToolId | null)[] {
    return this.boxes;
  }

  get heldSlot(): number {
    return this.slot;
  }

  get held(): ToolId | null {
    return this.boxes[this.slot] ?? null;
  }

  holding(tool: ToolId): boolean {
    return this.held === tool;
  }

  /**
   * Put a tool in the first empty box. Returns which one, or null if the row is
   * full or she already has one — nothing in this game is worth carrying twice.
   */
  give(tool: ToolId): number | null {
    if (this.boxes.includes(tool)) return null;
    const free = this.boxes.indexOf(null);
    if (free < 0) return null;
    this.boxes[free] = tool;
    return free;
  }

  /**
   * Take a tool back — what a quest does when it is finished with the hammer it
   * lent her. Returns whether anything was actually taken; the axe never is,
   * whoever asks and however they ask.
   */
  take(tool: ToolId): boolean {
    if (tool === PERMANENT) return false;
    const at = this.boxes.indexOf(tool);
    if (at < 0) return false;
    this.boxes[at] = null;
    this.settle();
    return true;
  }

  /**
   * Every borrowed tool, back at once. What a night's sleep does to the row.
   *
   * Not a loop of `take` on the outside, because the caller would have to know
   * what is in the boxes to write that loop — and the one thing that is certain
   * about the row after a quest was abandoned halfway is that nobody knows what
   * is in it. The axe is untouched, here as everywhere: slot one is welded shut
   * and this is not the thing that unwelds it.
   */
  clear(): void {
    for (let i = 0; i < SLOTS; i++) {
      if (this.boxes[i] !== PERMANENT) this.boxes[i] = null;
    }
    this.settle();
  }

  /**
   * Put a tool in her hand outright.
   *
   * What a quest does the moment it grants one, so the thing she was just given
   * is the thing she is holding — a four-year-old who has to find the blue
   * button before her new hammer does anything has been handed a puzzle instead
   * of a hammer. Tool-switching gets its practice honestly, the first time she
   * wants the axe back.
   *
   * Returns whether she is now holding it.
   */
  hold(tool: ToolId): boolean {
    const at = this.boxes.indexOf(tool);
    if (at < 0) return false;
    this.slot = at;
    return true;
  }

  /**
   * The blue button: the next tool along, wrapping, skipping empty boxes.
   *
   * Returns whether the held tool actually changed. With only the axe it cannot,
   * and that false is what the HUD turns into a bounce — because a button that
   * does nothing at all is a button she stops pressing, and tool-switching is a
   * skill this game is deliberately teaching before there is anything to switch
   * to.
   */
  cycle(): boolean {
    for (let step = 1; step <= SLOTS; step++) {
      const next = (this.slot + step) % SLOTS;
      if (!this.boxes[next]) continue;
      if (next === this.slot) return false;
      this.slot = next;
      return true;
    }
    return false;
  }

  /** Never leave the light on an empty box. */
  private settle(): void {
    if (this.boxes[this.slot]) return;
    this.slot = PERMANENT_SLOT;
  }
}

/**
 * Hers, for as long as the page is open. Scenes come and go; this does not.
 *
 * Nothing persists across a reload — there is no save layer in this game yet and
 * this is not the prompt that builds one. A tool a quest granted is gone on
 * refresh, which is the same deal a chopped tree gets.
 */
export const toolBelt = new ToolBelt();
