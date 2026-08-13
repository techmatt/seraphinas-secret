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
 * **The shape is the point.** It is split into three, by what they are about
 * rather than by how long they last:
 *
 *  - **`run`** — the quest, what she is carrying for it, and what it has lent
 *    her.
 *  - **`world`** — what she has changed about a place: the trees she has felled,
 *    keyed by zone.
 *  - **`persistent`** — what she *keeps*. Coins, so far.
 *
 * The first two are cleared by a night's sleep (Matt, 2026-08-12: the world
 * regenerates overnight, so the wood she cleared is standing again in the
 * morning). The third is the thing this file said was coming: `resetForSleep`
 * names the *event* rather than the extent precisely so that something which has
 * to outlive a night has an obvious side to land on, and coins are the first
 * thing to land there.
 *
 * "Persistent" means across a night, not across a reload. Nothing here touches
 * disk and this is still not the file that adds one — close the page and the
 * coins go with it, the same deal a chopped tree has always had.
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
  /**
   * What she keeps. Survives a night; a page reload is still a fresh morning.
   *
   * Its own half rather than a field on `run`, because the whole reason it
   * exists is that it is on the other side of the seam — see `resetForSleep`.
   */
  persistent: {
    /** Never more than `COIN_SLOTS`. See `addCoin`. */
    coins: number;
  };
}

/**
 * How many coins she can have.
 *
 * A number rather than a purse that grows, because the row on screen is three
 * boxes she can count and a fourth box appearing is a row that changed shape —
 * the tool belt's argument exactly. It lives here rather than in the HUD for the
 * same reason `SLOTS` lives on the belt: the cap is the *purse's*, and a row
 * that had to be asked how full it was allowed to get would be a row deciding
 * the rules. See `ui/CoinRow.ts`.
 */
export const COIN_SLOTS = 3;

export class SessionState {
  private data: SessionData = SessionState.empty();

  private static empty(): SessionData {
    return {
      run: { quest: null, items: [], granted: [], faeries: false },
      world: {},
      persistent: { coins: 0 },
    };
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
      persistent: { ...this.data.persistent },
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

  // --- what she keeps -------------------------------------------------------

  get coins(): number {
    return this.data.persistent.coins;
  }

  /**
   * One more coin, if there is room for it. Returns whether it landed.
   *
   * The full purse is not a failure and the caller must not treat it as one:
   * "no" here means "she already has all three", which is the best possible
   * answer to being given a coin. What the scene does with a `false` is bounce
   * the coin off the last box and make a happy noise — see `RoomScene.grantCoin`
   * and CLAUDE.md, "No fail states".
   */
  addCoin(): boolean {
    if (this.data.persistent.coins >= COIN_SLOTS) return false;
    this.data.persistent.coins += 1;
    return true;
  }

  // --- the seam -------------------------------------------------------------

  /**
   * A night's sleep: the quest, what it gave her, what she was carrying for it,
   * and every mark she left on the world — all gone. She wakes to the morning
   * the generator wrote, with her coins still in her pocket.
   *
   * The coins are the whole reason this is not the same code as `reset`. The two
   * were once the same extent and different *events*, written apart against the
   * day something had to survive a night without surviving a page reload; this
   * is that day. Everything but `persistent` is swept. The store is what the
   * sweep is written against; the belt and the offer counters live elsewhere and
   * are swept beside it — see `src/state/sleep.ts`, which is the one place that
   * knows what a night clears.
   */
  resetForSleep(): void {
    const kept = { ...this.data.persistent };
    this.data = SessionState.empty();
    this.data.persistent = kept;
  }

  /**
   * Everything, gone — coins included. For a test that wants a clean page
   * without reloading, and the one sweep that is wider than a night's.
   */
  reset(): void {
    this.data = SessionState.empty();
  }
}

/**
 * Hers, for as long as the page is open — the same deal `toolBelt` has, and for
 * the same reason: scenes come and go, and she does not.
 */
export const session = new SessionState();
