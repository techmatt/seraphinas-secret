/**
 * Every quest in the game. There is one.
 *
 * **The faerie quest.** Sneak's spell book has a spell that summons faeries and
 * it needs three magic stones. She finds a hammer by the well, cracks a stone
 * open in three different corners of the village, and takes them to him at the
 * Secret Cave — which is where this stops, and where the next prompt starts.
 *
 * The spots below are chosen so that each stone is a *walk* and none of them is
 * a search: one west into the wood off the main road, one south by the path down
 * to the green, one north-east beside the market square. Every one is within
 * sight of a road she already knows, and no two are in the same direction from
 * the well. They are written in tiles, the same units the layout is written in —
 * see `content/world/outside/plan.ts` for the town plan they are read against.
 *
 * They live here rather than in the layout because they are the *quest's*
 * furniture: the world is the same world without them, and the day a second
 * quest wants a stone somewhere else, moving one is an edit to a quest and not
 * to a village. The one thing that has to be true of them — that she can stand
 * where they are — is asserted by `quest.spec` against the same collision grid
 * the game walks on.
 */

import type { Quest } from './Quest';

export const FAERIE_QUEST: Quest = {
  id: 'faerie',
  giver: 'sneak',
  offer: ['sneak_quest_offer', 'sneak_quest_stones'],
  phases: [
    {
      id: 'hammer',
      instruction: 'sneak_quest_hammer',
      goal: {
        kind: 'fetch',
        // On the west lane a couple of tiles from the well — near enough to be
        // "by the well" and far enough that the well never takes the green dot
        // off it. Six tiles from her own front door, which is the first walk the
        // quest ever asks for and is meant to be an easy one.
        item: { id: 'hammer', zone: 'outside', x: 26.5, y: 30.5 },
      },
    },
    {
      id: 'gems',
      instruction: 'sneak_quest_crack',
      goal: {
        kind: 'collect',
        rocks: [
          // West: off the main road where it runs into the wood.
          { id: 'malachite', zone: 'outside', x: 17.5, y: 29.5 },
          // South: beside the path down to the green.
          { id: 'ruby', zone: 'outside', x: 26.5, y: 38.5 },
          // North-east: on the grass between the market square and the hall.
          { id: 'sapphire', zone: 'outside', x: 41.5, y: 23.5 },
        ],
      },
    },
    {
      /**
       * Parked. The cave interior, the ritual and the faeries are the next
       * prompt; all this phase does is change what Sneak says and keep the
       * hammer in her belt while she waits, because a tool taken back before the
       * quest is over is a tool that vanished.
       */
      id: 'meetAtCave',
      instruction: 'sneak_quest_cave',
      goal: { kind: 'park' },
    },
  ],
};

export const QUESTS: Quest[] = [FAERIE_QUEST];
