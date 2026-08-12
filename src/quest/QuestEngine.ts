/**
 * One quest at a time, and where she is in it.
 *
 * No quest log, no parallel quests (Matt). Which is not a limitation to be
 * apologised for: the player is four, and a list of things she is halfway
 * through is a thing she would have to be able to read. There is one job on, it
 * is the one the boy next door asked for, and the yellow button says what it is.
 *
 * This is the whole of the rules layer. It owns no sprites, no sounds and no
 * Phaser — the scene draws what this says is true, and the session store is
 * where it all actually lives, so walking through a doorway rebuilds the picture
 * and never the progress.
 */

import { session, type SessionState } from '../state/session';
import type { GemId } from '../ui/toolIcons';
import { itemOf, rocksOf, type Quest, type QuestPhase } from './Quest';
import { QUESTS } from './quests';

/** One box on the quest row: what goes in it, and whether it is in yet. */
export interface QuestSlot {
  id: GemId;
  filled: boolean;
}

export class QuestEngine {
  constructor(
    private readonly table: readonly Quest[],
    private readonly store: SessionState,
  ) {}

  // --- where she is ---------------------------------------------------------

  get active(): Quest | null {
    const id = this.store.quest?.id;
    return id ? (this.table.find((q) => q.id === id) ?? null) : null;
  }

  get phase(): QuestPhase | null {
    const state = this.store.quest;
    if (!state) return null;
    return this.active?.phases.find((p) => p.id === state.phase) ?? null;
  }

  /** The line the yellow button replays, or null when there is nothing on. */
  get instruction(): string | null {
    return this.phase?.instruction ?? null;
  }

  /** Whose voice that is. The quest-giver's: she is remembering what he said. */
  get giver(): string | null {
    return this.active?.giver ?? null;
  }

  // --- being offered one ----------------------------------------------------

  /**
   * The quest this person is carrying a thought bubble about, or null.
   *
   * Null the moment one is accepted, and null for everybody else always: one
   * active quest means one bubble in the world, and a second bubble would be a
   * choice she has to make.
   */
  offerFrom(npcId: string): Quest | null {
    if (this.store.quest) return null;
    return this.table.find((q) => q.giver === npcId) ?? null;
  }

  /**
   * How far through the offer she is with this person, as an index into their
   * `offer` lines. Kept here rather than on the Npc, because the npc's own line
   * cycle is a different thing — his idle chatter — and the two would fight.
   */
  private offerAt = new Map<string, number>();

  /**
   * Say the next line of the offer, and start the quest on the last one.
   *
   * Returns the line to speak and whether that press was the one that took the
   * job. Two presses, both of them him talking, and the second one is the whole
   * ceremony — a four-year-old is not going to be asked yes or no.
   */
  nextOfferLine(quest: Quest): { line: string; accepted: boolean } {
    const at = this.offerAt.get(quest.id) ?? 0;
    const line = quest.offer[Math.min(at, quest.offer.length - 1)]!;
    const last = at >= quest.offer.length - 1;
    this.offerAt.set(quest.id, at + 1);
    if (last) {
      // Forgotten as it is taken, so a quest the day cycle resets is offered
      // from its first line again rather than from wherever she left off.
      this.offerAt.delete(quest.id);
      this.store.begin(quest.id, quest.phases[0]!.id);
    }
    return { line, accepted: last };
  }

  // --- doing it -------------------------------------------------------------

  /** The boxes the quest row draws right now, in the quest's own order. */
  get slots(): QuestSlot[] {
    return rocksOf(this.phase).map((rock) => ({
      id: rock.id,
      filled: this.store.did(rock.id),
    }));
  }

  /** Whether the thing this phase wants picked up is still lying there. */
  get itemWaiting(): boolean {
    const item = itemOf(this.phase);
    return item !== null && !this.store.did(item.id);
  }

  /** Whether this rock is still whole. */
  rockWhole(id: string): boolean {
    return !this.store.did(id);
  }

  /**
   * Log one of this phase's objectives as done, and say whether that was the
   * last of them.
   *
   * A stone also goes in her pocket: the quest row is per-phase and empties when
   * the phase does, and the gems themselves have to outlive it — they are what
   * she is carrying to the cave.
   */
  finish(what: string, keep = true): { count: number; complete: boolean } {
    if (keep) this.store.take(what);
    const count = this.store.finish(what);
    const wanted = this.wanted();
    return { count, complete: wanted !== null && wanted.every((id) => this.store.did(id)) };
  }

  /**
   * Everything the current phase is waiting for, or null for a phase that is
   * never going to be finished.
   *
   * Null rather than an empty list, deliberately: `every` over nothing is true,
   * so a parked phase written as "wants nothing" would report itself complete
   * the moment anything at all was handed to it.
   */
  private wanted(): string[] | null {
    const goal = this.phase?.goal;
    if (!goal) return null;
    if (goal.kind === 'fetch') return [goal.item.id];
    if (goal.kind === 'collect') return goal.rocks.map((r) => r.id);
    return null;
  }

  /** Move on. Returns the phase she is now in, or null at the end of the list. */
  advance(): QuestPhase | null {
    const quest = this.active;
    const here = this.phase;
    if (!quest || !here) return null;

    const next = quest.phases[quest.phases.indexOf(here) + 1];
    if (!next) return null;
    this.store.enterPhase(next.id);
    return next;
  }

  /** What she is carrying for the quest, in the order she found it. */
  get held(): readonly string[] {
    return this.store.items;
  }
}

/**
 * The one that is running, for as long as the page is open. Scenes come and go;
 * it and the store it reads do not.
 */
export const quests = new QuestEngine(QUESTS, session);
