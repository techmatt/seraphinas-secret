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
  lureOf,
  ritualOf,
  rocksOf,
  type Quest,
  type QuestGuest,
  type QuestPen,
  type QuestPhase,
  type QuestSpot,
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
  kind: SlotKind;
}

/**
 * What a box on the row holds. A *kind*, never a picture: which pixels each of
 * these is drawn from is the HUD's business, and a rules layer that knew what a
 * carrot looks like would be a rules layer with an art pack in it. See QuestRow.
 *
 * `gem` is the one that also reads the slot's *id*, because the three stones are
 * three different colours and "the green one" is the whole instruction. Every
 * other kind is one picture however many boxes of it there are, which is what
 * makes four identical boxes read as "four of these" rather than as a list.
 */
export type SlotKind = 'gem' | 'button' | 'tree' | 'carrot' | 'bunny';

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

  /**
   * Is the quest she is on over?
   *
   * A parked phase is the definition, and it is the general one rather than a
   * name: `park` is the goal that cannot be finished, so a quest sitting in one
   * has run out of phases to move to — see `PhaseGoal`. Written here rather than
   * worked out by whoever asks, because the alternative is the bedtime recap
   * knowing that the faerie quest's last phase happens to be called "done".
   */
  get finished(): boolean {
    return this.active !== null && this.phase?.goal.kind === 'park';
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

  /**
   * Forget how far through an offer she is, everywhere.
   *
   * The night sweep's, and the only part of it that is not in the session store:
   * this counter is the engine's because it is about a conversation rather than
   * about a quest, and a conversation does not survive going to bed in the
   * middle of it. Taking the job already forgets its own counter — see
   * `nextOfferLine` — so this is exactly the half-finished case: one press in,
   * asleep, and in the morning he starts his pitch from the top rather than from
   * the sentence she never heard the beginning of.
   */
  forgetOffers(): void {
    this.offerAt.clear();
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
    const boxes = (ids: string[], kind: QuestSlot['kind']): QuestSlot[] =>
      ids.map((id) => ({ id, filled: this.store.did(id), kind }));

    const goal = this.phase?.goal;
    if (goal?.kind === 'ritual') return boxes(goal.steps.map((s) => s.id), 'button');
    if (goal?.kind === 'fell') return boxes(goal.falls, 'tree');
    if (goal?.kind === 'gather') return boxes(goal.items.map((i) => i.id), 'carrot');
    if (goal?.kind === 'lure') return boxes(goal.bunnies, 'bunny');
    return boxes(rocksOf(this.phase).map((r) => r.id), 'gem');
  }

  // --- the ritual -----------------------------------------------------------

  /**
   * The zone the current phase's ritual happens in, or null for any other
   * phase. Which *part* of that zone is the zone's own business: it is the ring
   * on its floor, and the scene measures her against the ring it drew.
   */
  get ritualZone(): string | null {
    return ritualOf(this.phase)?.zone ?? null;
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

  /**
   * Whether one of this phase's objectives is still outstanding — the stone
   * still whole, the carrot still lying in the grass, the bunny still out.
   *
   * One question with three names in front of it, because a zone building
   * itself asks exactly this of everything the phase put on the ground and the
   * answer never depended on which kind of thing it was.
   */
  waiting(id: string): boolean {
    return !this.store.did(id);
  }

  /** Whether this rock is still whole. */
  rockWhole(id: string): boolean {
    return this.waiting(id);
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
    if (goal.kind === 'fell') return goal.falls;
    if (goal.kind === 'gather') return goal.items.map((i) => i.id);
    if (goal.kind === 'lure') return goal.bunnies;
    return null;
  }

  // --- the pen, the bunnies and the carrots ---------------------------------

  /**
   * The ring of trees this quest planted, or null.
   *
   * Out from the press that takes the job right through to the night that
   * clears it, `done` included — see `pen` on a Quest. It answers for the quest
   * rather than for the phase, which is the whole of that rule in one line.
   */
  get pen(): QuestPen | null {
    return this.active?.pen ?? null;
  }

  /**
   * One of the pen's trees has gone over. Fills the next empty box.
   *
   * *Which* box is not a question worth asking — any four of the sixteen will
   * do, and none of them is a different four — so this takes the first unfilled
   * one rather than being told. Returns null for a fall during any other phase,
   * which is a tree coming down in a wood and nothing else.
   */
  fell(): { id: string; count: number; complete: boolean } | null {
    const goal = this.phase?.goal;
    if (goal?.kind !== 'fell') return null;
    const next = goal.falls.find((id) => !this.store.did(id));
    if (!next) return null;
    return { id: next, ...this.finish(next, false) };
  }

  /**
   * Whether the bunnies are out of the ring.
   *
   * Read off the goal kind rather than off a list of phase names: they are
   * penned while there is still a walk to make or a tree to fell, and loose the
   * moment neither is what she has been asked for. Naming the phases would be
   * the same fact written twice, and the copy in here is the one nobody would
   * update.
   */
  get bunniesLoose(): boolean {
    const kind = this.phase?.goal.kind;
    if (!this.pen || !kind) return false;
    return kind !== 'travel' && kind !== 'fell';
  }

  /**
   * Where the bunnies are being taken, or null for a quest with nowhere.
   *
   * Read off the quest rather than off the phase, because a zone building itself
   * has to know where a bunny that is *already home* is standing — and by then
   * the lure phase is behind her. There is only ever one lure in a quest; a
   * second would be a second den, and the word means the place they live.
   */
  get den(): QuestSpot | null {
    for (const phase of this.active?.phases ?? []) {
      if (phase.goal.kind === 'lure') return phase.goal.den;
    }
    return null;
  }

  /** Every carrot in her pocket, in the order she picked them up. */
  get carrots(): readonly string[] {
    return this.store.items.filter((item) => item.startsWith('carrot'));
  }

  /** The bunny at her heels, or null. Never more than one — see `tag`. */
  get following(): string | null {
    return this.store.following;
  }

  /** Whether this bunny is home, which is the only thing that fills its box. */
  atHome(id: string): boolean {
    // Once the quest has parked, every one of them is: getting all three home is
    // the only thing that ends it. Which is also the only way to answer this at
    // all after the last phase, because entering one clears the last one's
    // progress — see `SessionState.enterPhase`.
    if (this.finished) return true;
    return lureOf(this.phase) !== null && this.store.did(id);
  }

  /**
   * She pressed green at a bunny. Says what that was worth, and never nothing.
   *
   * Three answers and two of them are refusals, which is the whole design of
   * this phase: one bunny at a time is *enforced*, and enforced in this game
   * means a funny line and the world carrying on exactly as it was. No carrot
   * taken, no bunny lost, nothing to undo. See CLAUDE.md, "No fail states".
   *
   * Deliberately not gated on the phase. She can put a bunny on a carrot the
   * moment she has one, which is a phase early — and all that costs is a bunny
   * walking behind her while she finds the other two carrots, because
   * `deposit` is the half that knows what phase it is. What it buys is that the
   * "no carrot" answer is reachable at all: by the time the lure phase begins
   * she has exactly one carrot per bunny.
   */
  tag(id: string): 'busy' | 'noCarrot' | 'following' {
    if (this.store.following) return 'busy';
    const carrot = this.carrots[0];
    if (!carrot) return 'noCarrot';
    // The carrot is spent as it is handed over — it goes out of her pocket and
    // off the row it was never on, the same way a stone leaves as it goes in
    // the fire.
    this.store.drop(carrot);
    this.store.follow(id);
    return 'following';
  }

  /**
   * The one at her heels is home. Fills its box and says how many that makes.
   *
   * Returns null when nobody is following, which is every frame of the walk
   * back to the den with nothing in tow — the scene asks on arrival and does not
   * know or care whether this trip was one.
   */
  deposit(): { id: string; count: number; complete: boolean } | null {
    const id = this.store.following;
    if (!id || lureOf(this.phase) === null) return null;
    this.store.unfollow();
    return { id, ...this.finish(id, false) };
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
    // A phase that names a *spot* is not finished by walking into the zone the
    // spot is in — she is already standing in it, and the walk is the point.
    // The scene watches her cross into it instead; see `reachedSpot`.
    if (goal.at) return false;
    this.advance();
    return true;
  }

  /**
   * She is standing on the spot a `travel` phase named. Advances it once, and
   * says whether that was news — asked every frame, and a no nearly always.
   */
  reachedSpot(): boolean {
    if (this.phase?.goal.kind !== 'travel') return false;
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
