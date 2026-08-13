/**
 * Every quest in the game. There are two.
 *
 * **The faerie quest.** Sneak's spell book has a spell that summons faeries and
 * it needs three magic stones. She finds a hammer by the well, cracks a stone
 * open in three different corners of the village, and takes them to him at the
 * Secret Cave — which is where this stops, and where the next prompt starts.
 *
 * **The bunny rescue.** Hazel has found three bunnies penned in the Mystic Woods
 * behind a ring of tiny trees. She walks out to them, chops four of the ring
 * down, finds three carrots in the wood, and leads the bunnies home to the den
 * one at a time.
 *
 * **Two quests means two thought bubbles, and that is on purpose** (claude.ai,
 * 2026-08-13). Before either is taken there is a boy on his doorstep and a girl
 * by the pond, each with a cloud over their head, and she can do one of them.
 * The engine's older comment worried that a second bubble is a choice she has to
 * make; two friends who each want help, on opposite sides of a village she can
 * only be in one half of, is not that kind of choice — and the alternative was
 * gating the second quest behind the first, which would put the bunnies out of
 * reach of any afternoon that did not start with a spell book. One quest at a
 * time is still absolute: the moment either is accepted, both bubbles go.
 *
 * And the moment either is *finished*, the other one's comes back (Matt,
 * 2026-08-13). Both of these are one afternoon's work in either order; the day
 * only ever refuses the one she has already done.
 *
 * The spots below are chosen so that each stone is a *walk* and none of them is
 * a search: one west where the main road runs out into the wood, one south by
 * the path down to the green, one north-east beside the market square. Every one
 * is within sight of a road she already knows, and no two are in the same
 * direction from the well. They are written in tiles, the same units the layout
 * is written in — see `content/world/outside/plan.ts` for the town plan they are
 * read against.
 *
 * They live here rather than in the layout because they are the *quest's*
 * furniture: the world is the same world without them, and the day a second
 * quest wants a stone somewhere else, moving one is an edit to a quest and not
 * to a village. The one thing that has to be true of them — that she can stand
 * where they are — is asserted by `quest.spec` against the same collision grid
 * the game walks on.
 *
 * **And clear of the other quest's furniture**, which is the one thing the
 * collision grid cannot say: the pen is planted at run time, so the generator's
 * gate never sees it and neither does the grid this file is checked against. The
 * west stone stood on the ring's east edge until 2026-08-13 — harmless while
 * finishing one quest ended the day, and an unreachable stone the moment both
 * became one afternoon's work. Anything moved into the wood from here has to be
 * held against PEN below as well as against the map.
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
          // West: in the trees off the west end of the main road, on the south
          // side of it. South rather than north because the north side is where
          // the bunny pen goes up — see PEN — and a stone under one of its trees
          // is a stone she cannot swing at on a day she has already done that
          // job. Three clear tiles all round, which is what makes it the nearest
          // thing she can hit from where she stands.
          { id: 'malachite', zone: 'outside', x: 20.5, y: 35.5 },
          // South: beside the path down to the green.
          { id: 'ruby', zone: 'outside', x: 26.5, y: 38.5 },
          // North-east: on the grass between the market square and the hall.
          { id: 'sapphire', zone: 'outside', x: 41.5, y: 23.5 },
        ],
      },
    },
    {
      /**
       * The walk to the cave. Nothing to collect and nothing to hit: it ends
       * the moment she is standing in the chamber, which is the whole of what a
       * four-year-old was asked to do. The hammer stays in her belt throughout,
       * because a tool taken back before the quest is over is a tool that
       * vanished.
       */
      id: 'meetAtCave',
      instruction: 'sneak_quest_cave',
      goal: { kind: 'travel', zone: 'cave' },
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
        // The cave, and no more than that. The ring she has to stand in is
        // scratched into the cave's own floor whatever this quest is doing —
        // see `circle` in `content/world/cave/index.ts` — so the spot and the
        // size of it are not the quest's to give.
        zone: 'cave',
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
       * Reaching it also writes the quest down as finished today, which is what
       * stops him offering it again — a four-year-old who finishes a quest and
       * is immediately asked to do it again has not finished anything. It says
       * nothing about the *other* job: Hazel's bubble comes back at this
       * instant, wherever she is standing. A night clears the list.
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

// --- the bunny rescue --------------------------------------------------------

/**
 * The pen: a hollow five-by-five ring of tiny trees, and the only 5x5 patch of
 * the Mystic Woods with no road in it.
 *
 * The wood is 85% open ground and that is the problem rather than the help — it
 * is mostly *road* and scattered trunks, and there are exactly three placements
 * for a five-tile square that touches neither. All three are the same clearing;
 * this is the middle one, and it is checked against the live collision grid by
 * `quest.spec` rather than trusted to this comment. Nothing has to be felled to
 * make room for it and nothing is: see the prompt's "no woods planting pass".
 *
 * The ring is sixteen trees and what it encloses is three tiles square, which is
 * enough for three bunnies to hop about in and small enough that she can see all
 * three of them from outside it.
 */
const PEN = { zone: 'outside', x: 13, y: 26, size: 5 } as const;

/** The middle of it, which is where the sparkle sits and what she walks to. */
const PEN_MIDDLE = { x: PEN.x + PEN.size / 2, y: PEN.y + PEN.size / 2 } as const;

/**
 * The den: the far end of the walk, and deliberately nowhere near the pen.
 *
 * Off every road, eleven tiles up the wood from the ring, with nothing between
 * the two but trees — so the trip is a walk through a wood rather than a walk
 * along a path, and she makes it three times. The other scouted site, (5, 9),
 * is twenty-one tiles out: three round trips of that is four minutes of holding
 * a stick forward, which is a chore and not an outing.
 */
const DEN = { id: 'den', zone: 'outside', x: 6.5, y: 16.5 } as const;

/**
 * Hazel's spot at the den — half a tile off it, so a bunny settling on the den
 * is never drawn inside her, and facing the way the wood opens.
 */
const HAZEL_AT_DEN = { x: DEN.x + 1.1, y: DEN.y - 0.2 } as const;

export const BUNNY_QUEST: Quest = {
  id: 'bunny',
  giver: 'hazel',
  offer: ['hazel_quest_offer', 'hazel_quest_pen'],
  pen: {
    ...PEN,
    /**
     * Three of them, spread across the three tiles the ring encloses rather
     * than stacked in the middle: three animals on one spot read as one animal
     * with a bad sprite, and the whole of what this phase asks her to see is
     * that there are three.
     */
    bunnies: [
      { id: 'bunny_1', x: PEN.x + 1.4, y: PEN.y + 1.5 },
      { id: 'bunny_2', x: PEN.x + 3.4, y: PEN.y + 2.1 },
      { id: 'bunny_3', x: PEN.x + 2.3, y: PEN.y + 3.3 },
    ],
  },
  phases: [
    {
      /**
       * The walk out to the wood. Nothing to do at the end of it: arriving is
       * the whole of the job, the way walking into the cave was — and the ring
       * is already sparkling from across the clearing, so the wayfinding is a
       * light in the trees rather than a direction anybody gave her.
       *
       * The radius is three and a half tiles from the middle of a five-tile
       * ring, which is the first place outside it she can actually stand.
       */
      id: 'toThePen',
      instruction: 'hazel_quest_pen',
      goal: { kind: 'travel', zone: 'outside', at: { ...PEN_MIDDLE, r: 3.6 } },
    },
    {
      /**
       * Four of the sixteen, in any order. A fall fills a box; the stumps can
       * stay, because a bunny hops over a stump and clearing one is therefore
       * something she may do rather than something she must.
       */
      id: 'freeThem',
      instruction: 'hazel_quest_chop',
      goal: { kind: 'fell', falls: ['fall_1', 'fall_2', 'fall_3', 'fall_4'] },
    },
    {
      /**
       * Three carrots, scattered across the wood — one north of the ring, one
       * out towards the village, one south across the trail. Each is a walk in a
       * different direction and none of them is a hunt: they are on open grass,
       * they sparkle, and there is nothing else near enough to take the green
       * button off one.
       */
      id: 'carrots',
      instruction: 'hazel_quest_carrots',
      goal: {
        kind: 'gather',
        items: [
          { id: 'carrot_1', zone: 'outside', x: 11.5, y: 21.5 },
          { id: 'carrot_2', zone: 'outside', x: 18.5, y: 23.5 },
          { id: 'carrot_3', zone: 'outside', x: 13.5, y: 36.5 },
        ],
      },
    },
    {
      /**
       * One bunny at a time, all the way to the den, three times. The rule that
       * makes it three times rather than one is in `QuestEngine.tag`, and it is
       * a funny line rather than a locked button — see CLAUDE.md.
       */
      id: 'lure',
      instruction: 'hazel_quest_lure',
      goal: {
        kind: 'lure',
        bunnies: ['bunny_1', 'bunny_2', 'bunny_3'],
        den: DEN,
      },
    },
    {
      /**
       * Over. No instruction, which is what takes the yellow dot off the screen
       * and gives Hazel back her own two lines — the same arrangement the faerie
       * quest's last phase has, and for the same reason: a four-year-old who
       * finishes something and is immediately asked to do it again has not
       * finished anything.
       */
      id: 'done',
      goal: { kind: 'park' },
    },
  ],
  /**
   * She goes on ahead and waits at the den, for every phase but the last.
   *
   * The Sneak-to-cave precedent exactly, including where it stops: `done` is not
   * in the list, so the moment the third bunny is home the quest has let go of
   * her — and she is still standing at the den for the whole celebration,
   * because nothing rebuilds a zone in the middle of one. She is back at the
   * pond the next time the wood is built, which is the next time she walks
   * through a door.
   */
  gather: {
    during: ['toThePen', 'freeThem', 'carrots', 'lure'],
    guests: [
      {
        id: 'hazel',
        sheet: 'hazel',
        zone: 'outside',
        x: HAZEL_AT_DEN.x,
        y: HAZEL_AT_DEN.y,
        facing: 'down',
        lines: ['hazel_play', 'hazel_pebble'],
      },
    ],
  },
};

export const QUESTS: Quest[] = [FAERIE_QUEST, BUNNY_QUEST];
