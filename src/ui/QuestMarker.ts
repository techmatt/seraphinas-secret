/**
 * The thought bubble over somebody who has something to ask her.
 *
 * The "visible across the room" grammar: she is four, she is steering a
 * thumbstick, and the way she finds out that the boy next door wants something
 * is that he is the only person in the village with a cloud over his head. It
 * bobs, so it reads as alive from a distance, and it holds a star rather than a
 * mark or a letter, because a punctuation mark is a thing she would have to have
 * been taught.
 *
 * It goes away the moment the quest is taken. A bubble over somebody who has
 * already asked is a bubble that means nothing, and the first time one of those
 * appears is the last time any of them is worth walking over to.
 */

import Phaser from 'phaser';
import { DEPTH } from '../config';
import { makeGlow } from './ButtonDot';

/** The cloud. Wide enough to read at a distance, small enough to be a thought. */
const W = 46;
const H = 34;

/** How far it bobs, and how long a bob takes. */
const BOB = 7;
const BOB_MS = 1100;

const CLOUD = 0xfff6ff;
const EDGE = 0xb98ad6;
const STAR = 0xffd166;

export interface QuestMarker {
  container: Phaser.GameObjects.Container;
  setVisible: (on: boolean) => void;
  destroy: () => void;
}

/**
 * `x, y` is the point it floats above — a person's feet. It lifts itself clear
 * of their head, which the caller measures and passes as `lift`, for the same
 * reason the green dot does: a fixed lift lands on the chest of anybody the pack
 * draws at full height.
 */
export function makeQuestMarker(
  scene: Phaser.Scene,
  x: number,
  y: number,
  lift: number,
): QuestMarker {
  const top = y - lift;

  // A warm pool behind it, so it carries across a village at dusk rather than
  // being a white smudge against a pale wall.
  const halo = makeGlow(scene, 0, 0, W * 1.5, STAR, 0.45);

  const cloud = scene.add.graphics();
  cloud.fillStyle(CLOUD, 0.97);
  cloud.lineStyle(4, EDGE, 1);
  cloud.fillRoundedRect(-W / 2, -H / 2, W, H, H / 2);
  cloud.strokeRoundedRect(-W / 2, -H / 2, W, H, H / 2);
  // The two trailing dots that make a rounded rectangle into a *thought*.
  for (const [dx, dy, r] of [
    [-W / 2 + 12, H / 2 + 8, 6],
    [-W / 2 + 4, H / 2 + 19, 4],
  ] as const) {
    cloud.fillStyle(CLOUD, 0.97);
    cloud.lineStyle(3, EDGE, 1);
    cloud.fillCircle(dx, dy, r);
    cloud.strokeCircle(dx, dy, r);
  }

  // A four-pointed star inside it. Drawn rather than a glyph, because every
  // glyph in this game is something she would have to be able to read.
  const star = scene.add.graphics();
  star.fillStyle(STAR, 1);
  star.fillPoints(
    [
      new Phaser.Geom.Point(0, -11),
      new Phaser.Geom.Point(3.4, -3.4),
      new Phaser.Geom.Point(11, 0),
      new Phaser.Geom.Point(3.4, 3.4),
      new Phaser.Geom.Point(0, 11),
      new Phaser.Geom.Point(-3.4, 3.4),
      new Phaser.Geom.Point(-11, 0),
      new Phaser.Geom.Point(-3.4, -3.4),
    ],
    true,
  );

  const container = scene.add
    .container(x, top, [halo, cloud, star])
    // Above every y-sorted thing in the world, under the balloon: a hedge must
    // never eat the one thing in the village that is asking to be walked to.
    .setDepth(DEPTH.prompt);

  scene.tweens.add({
    targets: container,
    y: { from: top, to: top - BOB },
    duration: BOB_MS,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return {
    container,
    setVisible: (on: boolean) => container.setVisible(on),
    destroy: () => {
      scene.tweens.killTweensOf(container);
      container.destroy();
    },
  };
}
