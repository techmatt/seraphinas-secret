/**
 * "Push the stick" — drawn, because it cannot be written.
 *
 * The room used to say "Walk: left stick or arrow keys", which is four words she
 * cannot read and one she cannot see (there is no stick on screen). This is the
 * same instruction as a picture: a thumbstick with its knob rolling around the
 * gate, which is exactly the motion her thumb has to make. It leaves as soon as
 * she has done it once, because an instruction that stays is clutter.
 */

import Phaser from 'phaser';

const BASE_RADIUS = 34;
const KNOB_RADIUS = 21;
const THROW = 11;

export interface StickHint {
  container: Phaser.GameObjects.Container;
  /** Fade it away for good. Safe to call more than once. */
  dismiss: () => void;
}

export function makeStickHint(scene: Phaser.Scene, x: number, y: number): StickHint {
  const base = scene.add.circle(0, 0, BASE_RADIUS, 0x1b1030, 0.7).setStrokeStyle(4, 0xd9c7ff, 0.7);
  const gate = scene.add.circle(0, 0, BASE_RADIUS - 8).setStrokeStyle(2, 0xd9c7ff, 0.35);
  const knob = scene.add.circle(0, 0, KNOB_RADIUS, 0xd9c7ff, 0.92).setStrokeStyle(3, 0xfff6ff, 0.9);
  const shine = scene.add.circle(-6, -7, 6, 0xffffff, 0.6);

  const container = scene.add.container(x, y, [base, gate, knob, shine]).setAlpha(0.85);

  // The knob walks the gate, so the picture shows the verb and not just the pad.
  const roll = scene.tweens.addCounter({
    from: 0,
    to: 360,
    duration: 2600,
    repeat: -1,
    onUpdate: (tween) => {
      const a = Phaser.Math.DegToRad(tween.getValue() ?? 0);
      knob.setPosition(Math.cos(a) * THROW, Math.sin(a) * THROW);
      shine.setPosition(knob.x - 6, knob.y - 7);
    },
  });

  let gone = false;
  return {
    container,
    dismiss: () => {
      if (gone) return;
      gone = true;
      roll.stop();
      scene.tweens.add({
        targets: container,
        alpha: 0,
        scale: 0.72,
        duration: 420,
        ease: 'Quad.easeIn',
        onComplete: () => container.destroy(),
      });
    },
  };
}
