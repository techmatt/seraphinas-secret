/**
 * What the game remembers while the page is open.
 *
 * Everything in this game used to live for exactly as long as one zone. Walking
 * through a doorway rebuilds the room scene from scratch, and the map data it
 * rebuilds from is the file the generator wrote — so a felled tree stood back up
 * the moment she went indoors and came out again, and a quest could not exist at
 * all, because a quest is a thing you are halfway through.
 *
 * So: one store, one page load. Zones read it when they are built and write to
 * it as things happen. Nothing here touches disk. There is no save layer in this
 * game and this is not the file that adds one — a reload is a fresh morning, and
 * that is the same deal a chopped tree has always had.
 *
 * **The shape is the point.** It is split into two halves, by what they are
 * about rather than by how long they last:
 *
 *  - **`run`** — the quest, what she is carrying for it, and what it has lent
 *    her.
 *  - **`world`** — what she has changed about a place: the trees she has felled,
 *    keyed by zone.
 *
 * Both are cleared by a night's sleep (Matt, 2026-08-12: *everything* resets, no
 * exceptions — the world regenerates overnight, so the wood she cleared is
 * standing again in the morning). That was not always true of `world`, and the
 * old split was drawn around the difference; there is no difference now, and the
 * halves earn their keep on shape alone. Anything a later prompt wants to *keep*
 * across a night — coins, a count of days, which quests she has ever finished —
 * is a third half, and the point of `resetForSleep` naming the event rather than
 * the extent is that such a thing has an obvious side to land on.
 */

import type { TreeState } from '../world/Tree';

/** A cell of the collision grid, as the map data writes them. */
export type Cell = [number, number];

/**
 * How far through a quest she is.
 *
 * `phase` is a phase id rather than an index, so inserting a phase into a quest
 * cannot silently move somebody who is halfway through it. `done` is the
 * per-phase progress — the ids of the things this phase wanted that she has —
 * and it is cleared on every phase change, because the next phase wants
 * different things.
 */
export interface QuestState {
  id: string;
  phase: string;
  done: string[];
}

/** What one tree has had happen to it. */
export interface TreeDelta {
  state: TreeState;
  /** Blows landed since the last time it changed shape. */
  landed: number;
}

/** Everything she has changed about one zone. */
export interface ZoneDelta {
  /** Keyed by the map data's own tree id. */
  trees: Record<string, TreeDelta>;
}

/**
 * The whole store, as plain data.
 *
 * Written down as one interface rather than as fields on the class because it is
 * the thing `resetForSleep` cuts in half and the thing the test hooks hand out —
 * and both of those want to be able to point at the seam.
 */
export interface SessionData {
  /** The quest and everything it handed her. Cleared by sleep. */
  run: {
    quest: QuestState | null;
    /** Quest items in hand, in the order she picked them up. */
    items: string[];
    /** Tools a quest has lent her. The axe is not one; it is hers. */
    granted: string[];
    /**
     * The faeries are out, and following her.
     *
     * A flag rather than a list of three, because there is nothing to remember
     * about one: they have no positions worth keeping — they are wherever she
     * is — and no state that outlives a zone. In `run` because that is what they
     * are about: they came out of a quest, and the night that resets the quest
     * is the night they go home.
     */
    faeries: boolean;
  };
  /** The marks she has left on places, keyed by zone id. Cleared by sleep. */
  world: Record<string, ZoneDelta>;
}

export class SessionState {
  private data: SessionData = SessionState.empty();

  private static empty(): SessionData {
    return { run: { quest: null, items: [], granted: [], faeries: false }, world: {} };
  }

  /** A deep copy, for anyone who only wants to look. */
  snapshot(): SessionData {
    return {
      run: {
        quest: this.data.run.quest ? { ...this.data.run.quest, done: [...this.data.run.quest.done] } : null,
        items: [...this.data.run.items],
        granted: [...this.data.run.granted],
        faeries: this.data.run.faeries,
      },
      world: Object.fromEntries(
        Object.entries(this.data.world).map(([zone, delta]) => [
          zone,
          { trees: { ...delta.trees } },
        ]),
      ),
    };
  }

  // --- the quest ------------------------------------------------------------

  get quest(): QuestState | null {
    return this.data.run.quest;
  }

  /** Start one. There is only ever one — see QuestEngine. */
  begin(id: string, phase: string): QuestState {
    const quest: QuestState = { id, phase, done: [] };
    this.data.run.quest = quest;
    return quest;
  }

  /** Move to the next phase. Per-phase progress starts empty again. */
  enterPhase(phase: string): void {
    const quest = this.data.run.quest;
    if (!quest) return;
    quest.phase = phase;
    quest.done = [];
  }

  /** Mark one of this phase's objectives done. Returns how many now are. */
  finish(what: string): number {
    const quest = this.data.run.quest;
    if (!quest) return 0;
    if (!quest.done.includes(what)) quest.done.push(what);
    return quest.done.length;
  }

  did(what: string): boolean {
    return this.data.run.quest?.done.includes(what) ?? false;
  }

  // --- what she is carrying -------------------------------------------------

  get items(): readonly string[] {
    return this.data.run.items;
  }

  /** Put a quest item in her pocket. Nothing is ever carried twice. */
  take(item: string): boolean {
    if (this.data.run.items.includes(item)) return false;
    this.data.run.items.push(item);
    return true;
  }

  has(item: string): boolean {
    return this.data.run.items.includes(item);
  }

  /**
   * Take one back out of her pocket. What a quest does when a thing she has been
   * carrying is spent — a stone going into the fire is not hers any more, and a
   * row that still showed it would be the game forgetting what it just drew.
   */
  drop(item: string): boolean {
    const at = this.data.run.items.indexOf(item);
    if (at < 0) return false;
    this.data.run.items.splice(at, 1);
    return true;
  }

  // --- what is following her ------------------------------------------------

  get faeries(): boolean {
    return this.data.run.faeries;
  }

  /** They are out. Nothing puts them back but a night's sleep, or a page reload. */
  summonFaeries(): void {
    this.data.run.faeries = true;
  }

  get granted(): readonly string[] {
    return this.data.run.granted;
  }

  /**
   * Remember that a quest lent her a tool.
   *
   * The belt itself is `ToolBelt`, which is what the row on screen is drawn from
   * and what the blue button cycles. This is the *record* — the list sleep and a
   * finished quest hand back — and it is deliberately not the same object: a belt
   * that had to be asked what came from where would be a belt that knows about
   * quests.
   */
  grant(tool: string): boolean {
    if (this.data.run.granted.includes(tool)) return false;
    this.data.run.granted.push(tool);
    return true;
  }

  ungrant(tool: string): void {
    const at = this.data.run.granted.indexOf(tool);
    if (at >= 0) this.data.run.granted.splice(at, 1);
  }

  // --- what she has changed about a place -----------------------------------

  /** This zone's deltas, made if it has none yet. */
  private zone(id: string): ZoneDelta {
    return (this.data.world[id] ??= { trees: {} });
  }

  /** Everything that has happened to this zone's trees, or an empty record. */
  trees(zoneId: string): Readonly<Record<string, TreeDelta>> {
    return this.data.world[zoneId]?.trees ?? {};
  }

  /**
   * Remember what a tree is now. Written on every blow rather than only when it
   * changes shape, so a tree she hit twice and walked away from is still two
   * blows in when she comes back.
   */
  rememberTree(zoneId: string, treeId: string, delta: TreeDelta): void {
    this.zone(zoneId).trees[treeId] = { ...delta };
  }

  // --- the seam -------------------------------------------------------------

  /**
   * A night's sleep: the quest, what it gave her, what she was carrying for it,
   * and every mark she left on the world — all gone. She wakes to the morning
   * the generator wrote.
   *
   * It clears the whole store today, which makes it the same code as `reset`,
   * and it is still its own method: the two are the same *extent* and different
   * *events*, and the first thing that has to survive a night without surviving
   * a page reload will need somewhere to be excluded, which is here. The store
   * is what the sweep is written against; the belt and the offer counters live
   * elsewhere and are swept beside it — see `src/state/sleep.ts`, which is the
   * one place that knows what a night clears.
   */
  resetForSleep(): void {
    this.data = SessionState.empty();
  }

  /** Everything, gone. For a test that wants a clean page without reloading. */
  reset(): void {
    this.data = SessionState.empty();
  }
}

/**
 * Hers, for as long as the page is open — the same deal `toolBelt` has, and for
 * the same reason: scenes come and go, and she does not.
 */
export const session = new SessionState();
