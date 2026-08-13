/**
 * What she says about her day, lying in bed with the stars up.
 *
 * The point of it is that going to sleep should be the *reward* for having done
 * something, rather than the thing that takes it away. A night already wipes the
 * quest, the belt and the wood she cleared — see `sleep.ts` — so without this,
 * the last event of a good afternoon is the afternoon being deleted. The recap
 * is the game noticing first.
 *
 * **The voice is pre-cut, so there are no numbers in it.** Every word in this
 * game is baked at content time with per-word timings — there is no synthesiser
 * at runtime and there is never going to be one — so "you chopped four trees" is
 * not a sentence this game can say. What it can do is pick from sentences that
 * are true of a whole class of day, which is what the predicates below are: each
 * one is a question with a yes/no answer, and the line beside it is a thing that
 * is true whenever the answer is yes.
 *
 * That is also why the facts are *read off the store* rather than counted as she
 * plays. The store is already the complete record of what a day was — it is what
 * a night's sleep exists to clear — so a second set of tallies kept alongside it
 * would be a second thing that could disagree with what actually happened.
 */

import { quests } from '../quest/QuestEngine';
import { session } from './session';

/**
 * A day, as much of it as can be answered with a yes or a no.
 *
 * Deliberately coarse. There is one number in here and it is only in here
 * because a report is easier to read with it — no line is chosen by *how many*
 * of anything, because no line could say the number out loud.
 */
export interface DayFacts {
  /** Three lights came out of the fire and are following her. */
  faeries: boolean;
  /** Three bunnies are out of the ring and home at the den. */
  bunnies: boolean;
  /** She took a job and the day ended before the job did. */
  onAnErrand: boolean;
  /**
   * She got at least one magic stone open.
   *
   * Read as "stones in her pocket, or the whole set once the spell has worked" —
   * a stone that has already gone into the fire is not in the store any more,
   * and the only way all three get there is the summoning. So this is exactly
   * right at every moment of the quest except the two presses in the middle of
   * the ritual, where it under-counts and is still true. Nothing says a number,
   * so under-counting costs nothing.
   */
  stones: boolean;
  /** Trees she left changed: felled to a stump, or knocked out entirely. */
  trees: number;
}

/**
 * The day so far, off the store.
 *
 * Called *before* `nightPasses()` — that ordering is the whole contract of this
 * file, and it is the caller's to keep, because the caller is the one thing that
 * knows the night is about to happen. See `RoomScene.goToSleep`.
 */
export function snapshotDay(): DayFacts {
  const data = session.snapshot();

  let trees = 0;
  for (const zone of Object.values(data.world)) {
    for (const tree of Object.values(zone.trees)) {
      // A tree she hit twice and left standing is not a felled tree. The store
      // remembers the blows either way, which is what makes them separable.
      if (tree.state !== 'standing') trees += 1;
    }
  }

  return {
    faeries: data.run.faeries,
    // A finished quest is the only thing that says the bunnies are home, and
    // which quest matters — an afternoon that summoned faeries did not rescue
    // anything. Read off the day's list of finished jobs rather than off the
    // active one, because a day can now have two of them and the second one
    // overwrites `quest`: an afternoon that rescued the bunnies and then went
    // on to summon the faeries did both, and says both. Still not a counter —
    // the store remains the complete record of the day.
    bunnies: data.run.completed.includes('bunny'),
    onAnErrand: data.run.quest !== null && !quests.finished,
    stones: data.run.faeries || data.run.items.length > 0,
    trees,
  };
}

/**
 * The line she always finishes on. A day with nothing in it is only this one.
 */
export const GOODNIGHT = 'seraphina_goodnight';

/**
 * At most this many things happened today.
 *
 * Two, not four. She is four years old and lying in the dark: the recap has to
 * be over before it becomes the thing standing between her and the morning, and
 * a list of everything she did is a list. Two and a goodnight is a bedtime
 * story's worth.
 */
export const MAX_EVENTS = 2;

/**
 * Everything worth mentioning, best first.
 *
 * The order is the editorial decision in this file, and it is fixed rather than
 * scored: faeries beat everything because summoning them is the biggest thing
 * that has ever happened; an errand she is in the middle of beats the stones it
 * is made of, because it is the shape of the whole day rather than one moment
 * in it; and a tree comes last because chopping one is a thing she can do a
 * dozen times in an afternoon.
 *
 * A finished quest is deliberately *not* in here as a line of its own. Finishing
 * the faerie quest and summoning the faeries are the same instant — see
 * `summon` — so a line for each would spend both of a day's two slots saying one
 * thing twice. The bunny line is the same instant for the other quest, which is
 * why it sits beside the faerie line rather than under a heading of its own:
 * they are the two ways an afternoon can have finished something.
 *
 * Both of them can be true on one day, and that day is what the two slots are
 * for: an afternoon that summoned the faeries *and* got the bunnies home says
 * exactly those two things and nothing else. Everything below them is cut, and
 * the errand line is not even a candidate — an errand is a job she is still in
 * the middle of, and a day with two finished quests in it has none.
 */
const EVENTS: { line: string; when: (day: DayFacts) => boolean }[] = [
  { line: 'seraphina_recap_faeries', when: (day) => day.faeries },
  { line: 'seraphina_recap_bunnies', when: (day) => day.bunnies },
  { line: 'seraphina_recap_errand', when: (day) => day.onAnErrand },
  { line: 'seraphina_recap_stones', when: (day) => day.stones },
  { line: 'seraphina_recap_trees', when: (day) => day.trees > 0 },
];

/**
 * What she says tonight: up to two things that happened, then goodnight.
 *
 * Never empty, which is what makes the caller simple — there is no quiet-day
 * branch anywhere, because a quiet day is just this list with one thing in it.
 */
export function recapFor(day: DayFacts): string[] {
  const events = EVENTS.filter((event) => event.when(day))
    .slice(0, MAX_EVENTS)
    .map((event) => event.line);
  return [...events, GOODNIGHT];
}
