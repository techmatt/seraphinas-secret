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
 * A spot in the world a quest cares about: a thing lying in the grass, or a
 * place to walk to. In tiles, like everything a quest writes down.
 *
 * The general form of `QuestRock` and `QuestItem`, which those two are not
 * because each of them carries an id that means something else as well — a gem's
 * id picks its colour, an item's picks the box it goes into on the tool row. A
 * carrot's id is only a progress key, and a den has no id at all worth having.
 */
export interface QuestSpot {
  id: string;
  zone: string;
  x: number;
  y: number;
}

/**
 * A ring of trees a quest plants, and what is inside it.
 *
 * The pen exists only while the quest does: it is spawned on the press that
 * takes the job, and it is not in `content/world/` for the same reason the
 * stones are not — the world is the same world without it, and the build's
 * reachability gate has no business being asked about something that is not
 * there most of the time. `quest.spec` stands in, over the live collision grid.
 *
 * `x, y` is the ring's top-left corner and `size` is how many tiles across it
 * is, so the trees are its border and what they enclose is `size - 2` square.
 */
export interface QuestPen {
  zone: string;
  x: number;
  y: number;
  size: number;
  /** Where each bunny starts, inside the ring. In tiles. */
  bunnies: { id: string; x: number; y: number }[];
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
 * What a `gather` phase is picking up, as one word.
 *
 * It picks the picture lying in the grass, the picture in the box on the quest
 * row, and the word she says as she straightens up — three things that must
 * always be the same thing, so they are one field rather than three. It is a
 * *name*, not a sprite: which pixels a carrot is drawn from is the scene's
 * business and a rules layer that knew would be a rules layer with an art pack
 * in it. See `GATHER_ART` in RoomScene, `KIND_ICONS` in QuestRow, and
 * `nameOf` in `voice/barks.ts` — all three keyed off this one string.
 */
export type Gathered = 'carrot' | 'storybook';

/**
 * How a phase ends.
 *
 *  - **fetch** — one thing on the ground; the green button picks it up.
 *  - **collect** — several things to break open; any order (Matt), and each one
 *    fills its own slot on the quest row.
 *  - **travel** — go somewhere. It ends the moment she is standing in the zone
 *    it names, which is a thing the scene notices on its way up rather than
 *    anything she has to do when she gets there. With `at`, it is a *spot*
 *    inside that zone instead, and the scene watches her walk into it — which
 *    is the only difference, and it is why it is the same kind: "go there" is
 *    one instruction whether the there is a cave or a clearing.
 *  - **fell** — knock over this many of the trees the quest planted. Any of
 *    them, in any order; a fall fills a box and the stumps can be left standing.
 *  - **gather** — several things lying in the grass, picked up with the green
 *    button in any order. `collect`'s twin for a thing that is not hit with
 *    anything: the row and the freedom are the same, and only the verb differs.
 *    `of` says what they are; three carrots and one storybook are the same
 *    phase with a different noun in it.
 *  - **book** — sit somewhere with a book and be read to. It ends when the last
 *    page has been turned, and the pages are the progress keys: one per page, so
 *    closing the book and coming back is the same shape of thing as walking out
 *    of the spell circle mid-ritual. The reader itself is `ui/BookReader.ts`;
 *    all a quest says is which book, and where she has to be sitting.
 *  - **lure** — bring somebody home, one at a time, and one at a time is
 *    *enforced*: tagging a second while the first is following is a funny
 *    nothing. The quest names who and where; how a bunny follows is the scene's.
 *  - **ritual** — a fixed order of coloured buttons, pressed standing in the
 *    ring on the floor of `zone`. The one goal that takes the face buttons
 *    over, and only in there. A quest does not say where the ring is or how big
 *    it is: the ring belongs to the zone, which is what draws it and what the
 *    scene measures her against — see `circle` in the map data. All a ritual
 *    picks is which floor it is standing on.
 *  - **park** — it does not. Where a quest waits, and where it stops for good.
 */
export type PhaseGoal =
  | { kind: 'fetch'; item: QuestItem }
  | { kind: 'collect'; rocks: QuestRock[] }
  | { kind: 'travel'; zone: string; at?: { x: number; y: number; r: number } }
  | { kind: 'ritual'; zone: string; steps: RitualStep[] }
  | { kind: 'fell'; falls: string[] }
  | { kind: 'gather'; items: QuestSpot[]; of: Gathered }
  | { kind: 'lure'; bunnies: string[]; den: QuestSpot }
  | { kind: 'book'; zone: string; at: { x: number; y: number; r: number }; book: string; pages: string[] }
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
  /**
   * A ring of trees this quest plants, and what it pens in.
   *
   * It is out the moment the job is taken and stays out until the night resets
   * the quest — through the phase that fells four of it, and past the end of the
   * quest, because a ring of stumps in a clearing is the afternoon she had and
   * tidying it away the instant the last bunny is home would be the game taking
   * it back. See `QuestPen`.
   */
  pen?: QuestPen;
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
): { zone: string; steps: RitualStep[] } | null {
  return phase?.goal.kind === 'ritual' ? phase.goal : null;
}

/** The things a phase wants picked up off the ground, or none. */
export function pickupsOf(phase: QuestPhase | null): QuestSpot[] {
  return phase?.goal.kind === 'gather' ? phase.goal.items : [];
}

/** What those things are, or null for a phase that is not picking anything up. */
export function gatheredBy(phase: QuestPhase | null): Gathered | null {
  return phase?.goal.kind === 'gather' ? phase.goal.of : null;
}

/**
 * The reading a phase is, or null. Which book, where she has to be sitting, and
 * the progress key of each page.
 */
export function readingOf(
  phase: QuestPhase | null,
): { zone: string; x: number; y: number; r: number; book: string; pages: string[] } | null {
  const goal = phase?.goal;
  if (goal?.kind !== 'book') return null;
  return { zone: goal.zone, ...goal.at, book: goal.book, pages: goal.pages };
}

/** The lure a phase is, or null. Who has to be brought home, and where home is. */
export function lureOf(
  phase: QuestPhase | null,
): { bunnies: string[]; den: QuestSpot } | null {
  return phase?.goal.kind === 'lure' ? phase.goal : null;
}

/** The place a phase wants her to walk to, or null for anything else. */
export function walkToOf(
  phase: QuestPhase | null,
): { zone: string; x: number; y: number; r: number } | null {
  const goal = phase?.goal;
  if (goal?.kind !== 'travel' || !goal.at) return null;
  return { zone: goal.zone, ...goal.at };
}
