/**
 * The gentle light on whatever the quest is currently about.
 *
 * No arrow, no minimap, no line on the ground (Matt). What marks the objective is
 * that it is the only thing in the village quietly glowing — which is the same
 * promise a talking prop's glow makes and reads the same way from across a road:
 * *this one*. It says nothing about which direction to walk, and that is the
 * point. Finding it is the game.
 *
 * The breathing is deliberately slower than the prop glow's. A prop is asking to
 * be poked; this is only saying it is still the job.
 */

import Phaser from 'phaser';
import { DEPTH } from '../config';
import { makeGlow } from './ButtonDot';

/** How big a pool of light a one-tile thing gets. */
const RADIUS = 118;

/** A long, slow breath. */
const BREATH_MS = 1900;

export interface Shimmer {
  /** Where it is, so a burst can be thrown from the same place. */
  x: number;
  y: number;
  destroy: () => void;
}

/**
 * How loud one of these is. The default is the objective's, which is the only
 * volume there was until a quest wanted to mark sixteen trees at once — see
 * `PEN_GLOW` in RoomScene. A quieter shimmer is still the same sentence, said
 * about a group instead of about a thing.
 */
export interface ShimmerLevel {
  radius: number;
  alpha: number;
}

const OBJECTIVE: ShimmerLevel = { radius: RADIUS, alpha: 0.5 };

export function makeShimmer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  level: ShimmerLevel = OBJECTIVE,
): Shimmer {
  const glow = makeGlow(scene, x, y, level.radius, tint, level.alpha)
    // On the floor, under everything standing on it — so the thing it is about
    // is drawn over its own light rather than washed out by it.
    .setDepth(DEPTH.doorLight);

  scene.tweens.add({
    targets: glow,
    scale: { from: glow.scale * 0.8, to: glow.scale * 1.18 },
    // The breath is a fraction of whatever it was set to, so a quiet shimmer
    // breathes rather than brightening back up to the loud one's range.
    alpha: { from: level.alpha * 0.6, to: level.alpha * 1.4 },
    duration: BREATH_MS,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return {
    x,
    y,
    destroy: () => {
      scene.tweens.killTweensOf(glow);
      glow.destroy();
    },
  };
}
