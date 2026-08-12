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
import {
  itemOf,
  ritualOf,
  rocksOf,
  type Quest,
  type QuestGuest,
  type QuestPhase,
  type RitualSite,
  type RitualStep,
} from './Quest';
import { QUESTS } from './quests';

/**
 * One box on the quest row: what goes in it, and whether it is in yet.
 *
 * Two kinds, because two phases fill this row for different reasons. A `gem` box
 * is a thing to go and find, drawn as a ghost of the thing itself. A `button`
 * box is a press she is waiting to be asked for, drawn as the coloured dot on
 * the pad in her hands — never a letter, ever. See QuestRow, and CLAUDE.md.
 */
export interface QuestSlot {
  id: string;
  filled: boolean;
  kind: 'gem' | 'button';
}

/**
 * The progress key logged when she first stands in the ritual's circle.
 *
 * It lives in the phase's own `done` list beside the colours she has pressed,
 * because that is exactly what it is — per-phase progress that has to survive
 * her wandering back out of the cave. It is deliberately not a colour, so
 * nothing that counts steps can trip over it.
 */
const AT_FIRE = 'atFire';

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

  /**
   * The line the yellow button replays, or null when there is nothing on.
   *
   * A ritual is the one phase whose job changes without the phase changing: he
   * asks for three buttons in turn, and "what am I doing again" in the middle of
   * that is the button he last asked for, not the sentence that started the
   * phase. Until she is standing at the fire the phase's own line still stands,
   * because until then the job really is to go and stand there.
   */
  get instruction(): string | null {
    const step = this.step;
    if (step && this.atFire) return step.press;
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

  /**
   * The boxes the quest row draws right now, in the quest's own order.
   *
   * Both phases that have a row fill it the same way — one box per thing, every
   * box drawn from the start, ghosted until it is done — so the row never
   * changes shape under her. What differs is only what is *in* a box, and that
   * is the slot's `kind`.
   */
  get slots(): QuestSlot[] {
    const ritual = ritualOf(this.phase);
    if (ritual) {
      return ritual.steps.map((step) => ({
        id: step.id,
        filled: this.store.did(step.id),
        kind: 'button' as const,
      }));
    }
    return rocksOf(this.phase).map((rock) => ({
      id: rock.id,
      filled: this.store.did(rock.id),
      kind: 'gem' as const,
    }));
  }

  // --- the ritual -----------------------------------------------------------

  /** Where the current phase's ritual happens, or null for any other phase. */
  get site(): RitualSite | null {
    return ritualOf(this.phase)?.site ?? null;
  }

  /** Has she reached the fire? Until she has, the buttons mean what they always do. */
  get atFire(): boolean {
    return this.store.did(AT_FIRE);
  }

  /**
   * She is standing in the circle for the first time. Returns whether that was
   * news — the scene says the first instruction on the strength of it, and would
   * say it again every time she stepped back in otherwise.
   */
  reachFire(): boolean {
    if (this.store.did(AT_FIRE)) return false;
    this.store.finish(AT_FIRE);
    return true;
  }

  /**
   * The button he is asking for right now, or null once all three are in.
   *
   * The first step she has not done, rather than a counter: the order is fixed,
   * so the done list is always a prefix, and reading it off the store is what
   * lets her walk out of the cave mid-ritual and come back to the same place.
   */
  get step(): RitualStep | null {
    const ritual = ritualOf(this.phase);
    if (!ritual) return null;
    return ritual.steps.find((s) => !this.store.did(s.id)) ?? null;
  }

  /**
   * She pressed a button in the circle. Returns what it was worth.
   *
   * A wrong press is a `miss` and nothing else happens: no regression, no
   * penalty, no step lost. There is no third answer — every face button is one
   * of these two — because "nothing happened" is not something this game says.
   */
  press(color: string): { hit: boolean; step: RitualStep; complete: boolean } | null {
    const step = this.step;
    if (!step) return null;
    if (color !== step.id) return { hit: false, step, complete: false };

    this.store.finish(step.id);
    // The stone is spent. It goes out of her pocket as it goes into the fire.
    this.store.drop(step.gem);
    return { hit: true, step, complete: this.step === null };
  }

  // --- who is standing where ------------------------------------------------

  /** The people the quest has moved into this zone right now. Usually none. */
  guests(zone: string): QuestGuest[] {
    return this.gathering()?.guests.filter((g) => g.zone === zone) ?? [];
  }

  /**
   * Whether this person is somewhere else at the moment, and so must not be
   * drawn where the map put them. Asked of every npc a zone builds.
   */
  away(npcId: string): boolean {
    return this.gathering()?.guests.some((g) => g.id === npcId) ?? false;
  }

  private gathering(): Quest['gather'] | null {
    const gather = this.active?.gather;
    const phase = this.store.quest?.phase;
    if (!gather || !phase || !gather.during.includes(phase)) return null;
    return gather;
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
    if (goal.kind === 'ritual') return goal.steps.map((s) => s.id);
    return null;
  }

  /**
   * She has walked into a zone. Advances a phase that was waiting for exactly
   * that, and says whether it did — the scene puts the quest-giver's line in
   * somebody's mouth on the strength of it.
   *
   * Asked on every zone build, including the ones she walks into for no reason
   * at all, which is why it has to be cheap and has to be a no-op nearly always.
   */
  arrive(zone: string): boolean {
    const goal = this.phase?.goal;
    if (goal?.kind !== 'travel' || goal.zone !== zone) return false;
    this.advance();
    return true;
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
