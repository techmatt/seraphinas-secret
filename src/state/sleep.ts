/**
 * What a night takes away.
 *
 * One function, and it is the whole of the answer to "what does sleeping
 * reset" — deliberately, because the alternative is three files each clearing
 * their own corner and nobody able to say whether the corners add up. Matt
 * (2026-08-12): **everything** resets. She wakes into the morning the generator
 * wrote, with an axe and nothing else — and, since coins, with her coins. That
 * is the one exception and it is the point of them: a coin she earned yesterday
 * that was gone this morning would be a thing the day took off her, and the day
 * in this game does not take things off her. The exclusion lives in
 * `SessionState.resetForSleep`, on the store, where the seam is.
 *
 * It lives here rather than on `SessionState` because it reaches past the store:
 * the belt and the offer counters are not session data, and a store that knew
 * about a tool row would be a store that knew about the HUD. This is the layer
 * above all three, and it imports them rather than the other way round.
 *
 * Nothing here touches the screen. The scene that called it rebuilds itself
 * afterwards and draws whatever this left behind — which is how "the wood grew
 * back" and "the thought bubble is over his head again" cost no code at all:
 * both are just a zone built from an empty store.
 */

import { quests } from '../quest/QuestEngine';
import { toolBelt } from '../world/ToolBelt';
import { dayClock } from './dayClock';
import { session } from './session';

/**
 * Sleep, and wake up to a new day.
 *
 * The three things a day is kept in:
 *
 *  - the **store**, which is the quest, what it lent her, what she was carrying
 *    for it, whether the faeries are out, and every tree she felled;
 *  - the **belt**, whose slots two to four are whatever a quest put there —
 *    including a quest abandoned mid-phase, which is the case nothing else
 *    cleans up;
 *  - the **offer counters**, so a pitch she was one press into starts again from
 *    its first line;
 *  - the **day clock**, which is the light: she wakes into a morning, however
 *    late in the evening she went to bed, and Dad has not called her in yet.
 *
 * And the one thing it does *not* clear: her coins. See `resetForSleep`.
 *
 * A quest cleared out of the store is a quest with nobody halfway through it,
 * which is the same thing as a quest on offer again — so the giver's thought
 * bubble comes back by itself, and finishing the faerie quest is a thing she can
 * do again tomorrow.
 *
 * **Anything wanting the day it just ended has to read it before this runs.**
 * That is the bedtime recap, and it is the only thing so far: see
 * `state/recap.ts` and the ordering in `RoomScene.goToSleep`.
 */
export function nightPasses(): void {
  session.resetForSleep();
  toolBelt.clear();
  quests.forgetOffers();
  dayClock.wake();
}
