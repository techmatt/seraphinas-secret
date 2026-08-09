/**
 * The only way this game ever asks for a button press.
 *
 * Seraphina is four and cannot read, so a prompt is never a letter — it is a
 * dot in the colour of the button on the pad in front of her. Matching the
 * physical colour is the whole mechanism: she looks at the screen, sees green,
 * and presses the green one. A label saying "A" would teach her nothing she can
 * use, so there are none anywhere in the game.
 */

import Phaser from 'phaser';

/** Xbox 360 face buttons, as a child sees them. */
export const PAD_COLOR = {
  a: 0x44d95a,
  b: 0xe8483f,
  x: 0x3d7fe0,
  y: 0xf2c43d,
} as const;

export interface ButtonDotOptions {
  /** Face colour; one of PAD_COLOR. */
  color?: number;
  /** Radius of the button face, in design pixels. */
  radius?: number;
  /** Breathe in and out forever, to pull the eye. */
  pulse?: boolean;
}

/**
 * A glowing face button. Returns a container so callers can tween, hide or move
 * the whole thing as one object.
 */
export function makeButtonDot(
  scene: Phaser.Scene,
  x: number,
  y: number,
  { color = PAD_COLOR.a, radius = 20, pulse = false }: ButtonDotOptions = {},
): Phaser.GameObjects.Container {
  const halo = scene.add.circle(0, 0, radius * 1.9, color, 0.22);
  const rim = scene.add.circle(0, 0, radius * 1.28, color, 0.4);
  const face = scene.add.circle(0, 0, radius, color).setStrokeStyle(radius * 0.16, 0xffffff, 0.85);

  // A highlight up and left reads as "this is a physical thing you can push".
  const shine = scene.add.circle(-radius * 0.3, -radius * 0.34, radius * 0.3, 0xffffff, 0.55);

  const dot = scene.add.container(x, y, [halo, rim, face, shine]);

  if (pulse) {
    scene.tweens.add({
      targets: [rim, halo],
      scale: { from: 0.86, to: 1.22 },
      alpha: { from: 1, to: 0.45 },
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: face,
      scale: { from: 1, to: 1.1 },
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return dot;
}
