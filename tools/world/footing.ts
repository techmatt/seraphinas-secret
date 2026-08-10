/**
 * Where a placement actually lands: the sprite, and the tiles under it.
 *
 * One rule, and everything that has to agree about collision goes through here
 * so that it is only written down once — the generator, the scatter's
 * keep-off-the-road test, and the hand-placed check all used to do their own
 * `Math.round(x) + blocks.x`, and three copies of a rule is two chances to drift.
 *
 * **A prop's solid cells sit centred under the part of it that touches the
 * ground, and they are whole tiles.**
 *
 * Getting both halves of that at once needs one concession, because the pack
 * draws a tree with its trunk centred on its own slot: a big oak is four tiles
 * wide, so its trunk straddles the middle *line*, and there is no whole tile
 * anywhere that is centred under it. So `blocks` is allowed to name a half tile,
 * and the sprite is nudged that half tile when it is put down — the picture
 * moves up to eight pack pixels, the cells land exactly on the grid, and the
 * trunk ends up in the middle of the tile it stops her at.
 *
 * The alternative was to keep the sprite exactly on the authored tile and let
 * the hitbox be half a tile out, which is what the world shipped with: every
 * trunk in the wood blocking the cell diagonally down-right of itself, by
 * thirty-two screen pixels each way. That is not a rounding error to a
 * four-year-old steering with a thumbstick, it is a tree that pushes back before
 * she has got to it.
 *
 * A picture that blocks nothing is not snapped at all — a flower may stand
 * wherever the scatter put it, because nothing about it is ever collided with.
 */

import { TILE, type ImageDef } from './catalog.js';
import type { TileRect } from './types.js';

export interface Footing {
  /** The sprite's top-left, in pack pixels. Snapped, if it blocks anything. */
  x: number;
  y: number;
  /** The tiles it makes solid. Absent where the picture blocks nothing. */
  cells?: TileRect;
}

export function footing(def: ImageDef, tileX: number, tileY: number): Footing {
  const blocks = def.blocks;
  if (!blocks) return { x: Math.round(tileX * TILE), y: Math.round(tileY * TILE) };

  // The footprint's own top-left corner is what gets rounded to the grid; the
  // sprite is then hung off it. Half tiles round up, which for a tree centred on
  // its slot means every tree in the world leans the same way — a rule that
  // picks a different side per sprite would be the definition of unpredictable.
  const cells = {
    x: Math.round(tileX + blocks.x),
    y: Math.round(tileY + blocks.y),
    w: blocks.w,
    h: blocks.h,
  };

  return {
    x: Math.round((cells.x - blocks.x) * TILE),
    y: Math.round((cells.y - blocks.y) * TILE),
    cells,
  };
}
