/**
 * What a quest *is*, as data.
 *
 * A quest is an ordered list of phases. A phase has one objective, one voiced
 * instruction, and one rule for when it is over. Nothing in this file is
 * specific to the faerie quest — the engine reads these shapes and the scene
 * draws them, and adding a second quest is a second entry in `QUESTS` rather
 * than a second code path anywhere.
 *
 * There is deliberately no callback in here. A phase's completion rule is a
 * *kind* rather than a function, because a phase whose rule is a closure is a
 * phase that cannot be written down, saved, restored on the far side of a
 * doorway, or asserted on by a test. Three kinds cover the whole of the first
 * quest, and the fourth is somebody else's prompt.
 */

import type { GemId } from '../ui/toolIcons';
import type { ToolId } from '../world/ToolBelt';

/**
 * Something lying in the world for her to pick up, and the tool it turns into.
 *
 * `x, y` is in tiles and names the point it stands on, which is what she walks
 * up to and where the green dot appears — the same thing a prop's position
 * means. It carries its own zone because a quest spans the world and a scene
 * only ever builds one bit of it.
 */
export interface QuestItem {
  /** Progress key, and the tool it goes into her belt as. */
  id: ToolId;
  zone: string;
  x: number;
  y: number;
}

/** One of the stones, and where it is sitting. Positions are in tiles. */
export interface QuestRock {
  id: GemId;
  zone: string;
  x: number;
  y: number;
}

/**
 * How a phase ends.
 *
 *  - **fetch** — one thing on the ground; the green button picks it up.
 *  - **collect** — several things to break open; any order (Matt), and each one
 *    fills its own slot on the quest row.
 *  - **park** — it does not. Where a quest waits for the prompt that finishes it.
 */
export type PhaseGoal =
  | { kind: 'fetch'; item: QuestItem }
  | { kind: 'collect'; rocks: QuestRock[] }
  | { kind: 'park' };

export interface QuestPhase {
  /** Stable across edits to the quest — the session store holds this, not an index. */
  id: string;
  /**
   * What the quest-giver says about this phase: on the press that starts it, on
   * every press after, and every time the yellow button is asked to say it again.
   */
  instruction: string;
  goal: PhaseGoal;
}

export interface Quest {
  id: string;
  /** Whose head the thought bubble floats over. An npc id in the map data. */
  giver: string;
  /**
   * What he says while he is offering it, in order. Pressing green says the next
   * one; the last one is the press that starts the quest.
   */
  offer: string[];
  phases: QuestPhase[];
}

/** The rocks a phase wants, or none. Where the quest row's slots come from. */
export function rocksOf(phase: QuestPhase | null): QuestRock[] {
  return phase?.goal.kind === 'collect' ? phase.goal.rocks : [];
}

/** The thing a phase wants picked up, or null. */
export function itemOf(phase: QuestPhase | null): QuestItem | null {
  return phase?.goal.kind === 'fetch' ? phase.goal.item : null;
}
