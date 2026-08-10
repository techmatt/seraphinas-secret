/**
 * The world, as Matt described it, written down.
 *
 * This is the authored source for every map — the same standing as
 * `content/voice/lines.json`. Nothing under here is a tile index: it is
 * regions, roads, "the shed goes there", and the generator turns that into
 * `public/world/*.json`. Which is the whole point of the arrangement: moving
 * Joey's house two tiles left is a two-character edit in `outside/plan.ts` and
 * a re-run of `npm run world:build`, never a hand-placed tile anywhere.
 *
 * This file used to be the whole world. It is now only the composition: one
 * folder per zone, one module per region or room inside it, and this list.
 * Everything is in **tiles**; fractions are allowed and mean what they say.
 *
 *   outside/  plan, roads, prefabs, perimeter, woods-edge, village,
 *             farm-garden, pond
 *   house/    shell, kitchen, living-room, bedroom, playroom
 */

import type { ZoneLayout } from '../../tools/world/types.js';

import { HOUSE } from './house/index.js';
import { OUTSIDE } from './outside/index.js';

export const ZONES: ZoneLayout[] = [OUTSIDE, HOUSE];
