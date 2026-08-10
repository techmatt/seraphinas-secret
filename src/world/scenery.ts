/**
 * Pokeable things.
 *
 * Every prop in the world used to be drawn out of primitives here — a star made
 * of triangles, a wardrobe made of rectangles. The world is bought pixel art
 * now, so a prop is a rectangle of somebody else's PNG and this file is down to
 * the one thing the art cannot supply: the invitation.
 *
 * A prop that talks gets a slow breathing glow behind it, because a
 * four-year-old finds a pulsing light long before she finds a chest. A facade
 * door does not: it is not promising anything, it just wiggles when you knock.
 */

import Phaser from 'phaser';
import { DEPTH, WORLD_SCALE } from '../config';
import { makeGlow } from '../ui/ButtonDot';
import type { MapProp } from './mapData';
import type { TileWorld } from './TileWorld';

export interface Prop {
  def: MapProp;
  /** The picture. A facade's is a whole building. */
  sprite: Phaser.GameObjects.Image | null;
  /** Where she walks up to and where the green dot sits, in world pixels. */
  x: number;
  y: number;
}

/** Warm for things that talk; the glow is only ever a promise of a voice. */
const GLOW_TINT = 0xffd9a0;

export function makeProp(scene: Phaser.Scene, world: TileWorld, def: MapProp): Prop {
  const x = def.x * WORLD_SCALE;
  const y = def.y * WORLD_SCALE;

  if (def.line) {
    const glow = makeGlow(scene, x, y, 150, GLOW_TINT, 0.5).setDepth(DEPTH.doorLight);
    // A slow breath: enough to pull a four-year-old's eye, not enough to nag.
    scene.tweens.add({
      targets: glow,
      scale: { from: glow.scale * 0.84, to: glow.scale * 1.16 },
      alpha: { from: 0.34, to: 0.66 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return { def, sprite: world.addSprite(def.key, def.sx, def.sy), x, y };
}

/**
 * The reaction to a press. A prop with a voice gets the full burst; a facade
 * gets a shove and a knock, because a locked door that said nothing at all
 * would read as a broken one.
 */
export function nudgeProp(scene: Phaser.Scene, prop: Prop): void {
  const sprite = prop.sprite;
  if (!sprite) return;

  scene.tweens.killTweensOf(sprite);
  const home = { x: sprite.x, y: sprite.y };
  scene.tweens.add({
    targets: sprite,
    x: { from: home.x - 4, to: home.x + 4 },
    duration: 60,
    yoyo: true,
    repeat: 3,
    ease: 'Sine.easeInOut',
    onComplete: () => sprite.setPosition(home.x, home.y),
  });
}
