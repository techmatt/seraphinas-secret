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

/**
 * The fire in the Secret Cave, in tiles.
 *
 * Written down rather than imported: `content/world/` is authored build-time
 * source and the game only ever reads what the generator wrote, the same
 * arrangement the stones above have with the town plan. It is `FIRE` in
 * `content/world/cave/index.ts`, and the two are checked against each other by
 * `quest.spec` standing in the circle and pressing the buttons.
 */
const FIRE = { x: 10.5, y: 11.5 } as const;

/**
 * How close to the fire counts as being in the circle, in tiles.
 *
 * Two and a half — big enough that a four-year-old aiming a thumbstick lands in
 * it without having to mean to, and small enough that the rest of the chamber is
 * unmistakably outside it. The ring on the floor is drawn at exactly this
 * radius: the picture and the rule are one number, because a circle that is not
 * the place the buttons work would be the game lying about itself.
 */
const CIRCLE = 2.5;

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
       * The walk to the cave. Nothing to collect and nothing to hit — the phase
       * ends when she is standing in the chamber, which is a thing the scene
       * notices rather than a thing a goal can describe. The hammer stays in her
       * belt throughout, because a tool taken back before the quest is over is a
       * tool that vanished.
       */
      id: 'meetAtCave',
      instruction: 'sneak_quest_cave',
      goal: { kind: 'park' },
    },
    {
      /**
       * The ritual. Red, green, blue, in that order, standing in the circle by
       * the fire — and the order is fixed because *this* is the phase that is
       * teaching three words. A wrong press never goes backwards; see
       * `RoomScene.ritualPress`.
       *
       * `instruction` is what he says before she has reached the fire, and what
       * the yellow button replays until then. Once she is in the circle the
       * engine answers with the step she is actually on, which is the only
       * honest answer to "what am I doing again" in the middle of a sequence.
       */
      id: 'ritual',
      instruction: 'sneak_cave_greet',
      goal: {
        kind: 'ritual',
        site: { zone: 'cave', x: FIRE.x, y: FIRE.y, r: CIRCLE },
        steps: [
          { id: 'red', gem: 'ruby', press: 'sneak_press_red', retry: 'sneak_try_red' },
          {
            id: 'green',
            gem: 'malachite',
            press: 'sneak_press_green',
            retry: 'sneak_try_green',
          },
          { id: 'blue', gem: 'sapphire', press: 'sneak_press_blue', retry: 'sneak_try_blue' },
        ],
      },
    },
    {
      /**
       * Over. No instruction, on purpose: that is what takes the yellow dot off
       * the screen and hands Sneak back his own two idle lines, which he has not
       * been able to say since he handed the job out. See `whatTheySay`.
       *
       * The quest stays *active* rather than being cleared, which is what stops
       * him offering it again — a four-year-old who finishes a quest and is
       * immediately asked to do it again has not finished anything. It is the
       * day cycle's to reset, at a sleep that does not exist yet.
       */
      id: 'done',
      goal: { kind: 'park' },
    },
  ],
  /**
   * The two of them went on ahead. While she is walking to the cave and while
   * the ritual is running they are in the chamber, either side of the fire and
   * clear of the circle — so the buttons the ritual takes over are never in a
   * competition with the green dot over somebody's head.
   *
   * Their outside spots are untouched: this is where they *are*, not a copy, and
   * the moment the quest reaches `done` they are back on the doorstep and at the
   * pond without anything having to put them there.
   */
  gather: {
    during: ['meetAtCave', 'ritual'],
    guests: [
      {
        id: 'sneak',
        sheet: 'sneak',
        zone: 'cave',
        x: FIRE.x - 3.6,
        y: FIRE.y - 0.4,
        facing: 'right',
        lines: ['sneak_faeries', 'sneak_secrets'],
      },
      {
        id: 'hazel',
        sheet: 'hazel',
        zone: 'cave',
        x: FIRE.x + 3.6,
        y: FIRE.y - 0.4,
        facing: 'left',
        lines: ['hazel_play', 'hazel_pebble'],
      },
    ],
  },
};

export const QUESTS: Quest[] = [FAERIE_QUEST];
