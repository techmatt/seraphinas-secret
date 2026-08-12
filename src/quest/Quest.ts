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
import type { Direction } from '../world/mapData';
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
 * The three buttons a ritual asks for, named by the only thing about them a
 * four-year-old can use: their colour.
 *
 * Which face button each colour *is* lives in `src/ui/ButtonDot.ts`, with the
 * rest of the pad. Nothing in the rules layer knows or needs to.
 */
export type RitualColor = 'red' | 'green' | 'blue';

/** One instruction of a ritual: a button to press, and the stone it burns. */
export interface RitualStep {
  /** The colour she is told, and the progress key the store logs. */
  id: RitualColor;
  /** Which of the stones in her pocket goes into the fire when she gets it. */
  gem: GemId;
  /** What he says to ask for it. */
  press: string;
  /** What he says when she presses something else. Never a buzzer. */
  retry: string;
}

/**
 * Where a ritual happens: a spot in a zone, and how close counts as being at it.
 *
 * `r` is in tiles, and it is doing two jobs that have to be the same number —
 * where the circle is drawn, and where the face buttons change meaning. A ring
 * on the floor that is not exactly the place the buttons work would be the
 * game lying about its own rules.
 */
export interface RitualSite {
  zone: string;
  x: number;
  y: number;
  r: number;
}

/**
 * Somebody the quest has moved. See `gather` on a Quest.
 *
 * They carry their own sheet and lines because a scene only ever has one zone's
 * map open, and the zone they are standing in is not the one they came from.
 */
export interface QuestGuest {
  id: string;
  /** Key into `src/world/characterSheets.ts`, same as a map npc's. */
  sheet: string;
  zone: string;
  /** Where their feet are, in tiles. */
  x: number;
  y: number;
  facing: Direction;
  /** What they say when there is nothing quest-shaped for them to say. */
  lines: string[];
}

/**
 * How a phase ends.
 *
 *  - **fetch** — one thing on the ground; the green button picks it up.
 *  - **collect** — several things to break open; any order (Matt), and each one
 *    fills its own slot on the quest row.
 *  - **travel** — go somewhere. It ends the moment she is standing in the zone
 *    it names, which is a thing the scene notices on its way up rather than
 *    anything she has to do when she gets there.
 *  - **ritual** — a fixed order of coloured buttons, pressed at one spot in the
 *    world. The one goal that takes the face buttons over, and only while she is
 *    standing inside `site`.
 *  - **park** — it does not. Where a quest waits, and where it stops for good.
 */
export type PhaseGoal =
  | { kind: 'fetch'; item: QuestItem }
  | { kind: 'collect'; rocks: QuestRock[] }
  | { kind: 'travel'; zone: string }
  | { kind: 'ritual'; site: RitualSite; steps: RitualStep[] }
  | { kind: 'park' };

export interface QuestPhase {
  /** Stable across edits to the quest — the session store holds this, not an index. */
  id: string;
  /**
   * What the quest-giver says about this phase: on the press that starts it, on
   * every press after, and every time the yellow button is asked to say it again.
   *
   * Absent means there is nothing left to say, which is what the end of a quest
   * is: the yellow dot goes, and the person who gave it out goes back to his own
   * idle chatter. See `whatTheySay` in RoomScene.
   */
  instruction?: string;
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
  /**
   * People the quest moves, and the phases it moves them for.
   *
   * They vanish from wherever the map put them and stand here instead, for
   * exactly as long as the quest is in one of `during` — which is a fact about
   * the store, so it survives a doorway and undoes itself the moment the quest
   * moves on. Nobody is *copied*: a guest and their map entry are the same
   * person, and never both on screen at once.
   */
  gather?: { during: string[]; guests: QuestGuest[] };
}

/** The rocks a phase wants, or none. Where the quest row's slots come from. */
export function rocksOf(phase: QuestPhase | null): QuestRock[] {
  return phase?.goal.kind === 'collect' ? phase.goal.rocks : [];
}

/** The thing a phase wants picked up, or null. */
export function itemOf(phase: QuestPhase | null): QuestItem | null {
  return phase?.goal.kind === 'fetch' ? phase.goal.item : null;
}

/** The ritual a phase is, or null for one that is not a ritual. */
export function ritualOf(
  phase: QuestPhase | null,
): { site: RitualSite; steps: RitualStep[] } | null {
  return phase?.goal.kind === 'ritual' ? phase.goal : null;
}
