/**
 * Who else is out here.
 *
 * Two children, and the small arranged things that say what each of them is
 * doing. Nobody in this file blocks a tile: she walks straight through her own
 * sister, on purpose — see `NpcLayout` — so a person is a place to stand, a way
 * to face, and a list of lines.
 *
 * Their spots were chosen the same way every cluster in the village was: a
 * person belongs somewhere that explains them. Sneak is on his own doorstep
 * because he lives there, and Hazel is at the near shore of the pond because
 * that is where a small child picks things up off the ground.
 */

import type { NpcLayout } from '../../../tools/world/types.js';
import type { Placement } from '../../../tools/world/shapes.js';
import { BUILDINGS } from './plan.js';

/**
 * Sneak's spot: the gap between Joey's front and Scar's, a row above the top
 * road, facing the street. Close enough to a facade to read as "he lives here"
 * and far enough off both doors that the green dot over him is never in a
 * competition — a person standing on a doorstep would be a person you cannot
 * press without knocking.
 */
const SNEAK_AT = { x: BUILDINGS.joey.door.x + 4.3, y: 12.3 } as const;

/**
 * Hazel's: the west shore of the pond, on the grass between the path and the
 * water. Half a tile clear of the lamp that stands over the green's bench —
 * near enough that she is *at* something, far enough that she is not behind it.
 */
const HAZEL_AT = { x: 37.9, y: 41.5 } as const;

export const PEOPLE: NpcLayout[] = [
  {
    id: 'sneak',
    sheet: 'sneak',
    x: SNEAK_AT.x,
    y: SNEAK_AT.y,
    // Facing the road, which is the way she will arrive from. He turns to look
    // at her when she talks to him; this is only how he stands when she is not.
    facing: 'down',
    lines: ['sneak_faeries', 'sneak_secrets'],
  },
  {
    id: 'hazel',
    sheet: 'hazel',
    x: HAZEL_AT.x,
    y: HAZEL_AT.y,
    facing: 'down',
    lines: ['hazel_play', 'hazel_pebble'],
  },
];

/**
 * What the two of them are doing, as scenery.
 *
 * The pack has no frame of anybody holding anything but a tool, and no seated
 * pose at all, so "reading" and "found a pebble" are told by what is lying on
 * the ground next to each of them. Which is the subtle version anyway: a boy
 * standing over an open book is reading, and it does not need a caption.
 */
export const PEOPLE_DRESSING: Placement[] = [
  // His spell book, open on the ground at his feet. Both of these sort in front
  // of the child they belong to, being lower down the screen than their feet.
  { image: 'book', x: SNEAK_AT.x + 0.35, y: SNEAK_AT.y - 0.15 },
  // Her shiny pebble, which is the whole of her second line.
  { image: 'rockSmall', x: HAZEL_AT.x + 0.45, y: HAZEL_AT.y - 0.1 },
];
