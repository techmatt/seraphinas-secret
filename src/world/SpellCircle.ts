/**
 * The ring on the floor of the Secret Cave, and the three marks around it.
 *
 * Drawn rather than placed: the pack has no spell circle, and the thing this
 * has to do is not decoration. It is the *edge of a rule* — inside it the face
 * buttons mean the colours he is asking for, outside it they mean what they
 * always mean — and a rule with an invisible boundary is a rule a four-year-old
 * cannot learn. So the ring is exactly the radius the quest data says, and it
 * lights up the moment she is standing in it, which is the moment the buttons
 * change hands.
 *
 * The three marks around the rim are the three presses. Each one is dark until
 * its button has been pressed and then burns in that button's own colour, so the
 * floor is telling the same story as the row along the bottom of the screen —
 * twice, in two places, because she is four and one of them will be off-screen
 * when she looks.
 */

import Phaser from 'phaser';
import { DEPTH, TILE_SIZE } from '../config';
import { makeGlow } from '../ui/ButtonDot';

/** The ring's own colour before anything has happened to it. */
const IDLE = 0x8f6fd0;

/** And once she is standing in it. */
const LIVE = 0xd9b8ff;

/** How many marks sit round the rim. One per press. */
const MARKS = 3;

/** How big a mark is, in screen pixels. */
const MARK_RADIUS = 13;

export class SpellCircle {
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly marks: Phaser.GameObjects.Arc[] = [];
  private readonly rim: Phaser.GameObjects.Container;

  private live = false;

  /**
   * The spell has gone off. Nothing dims it after that: a circle that went back
   * to its resting colour the moment she stepped out of it would be the room
   * saying the thing that just happened had not.
   */
  private spent = false;

  /**
   * @param x  Middle of the circle, in world pixels.
   * @param y  Same.
   * @param r  Its radius, in world pixels — the quest's own number, scaled.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly r: number,
  ) {
    this.glow = makeGlow(scene, x, y, r * 1.15, IDLE, 0.28).setDepth(DEPTH.doorLight);

    this.ring = scene.add.graphics().setDepth(DEPTH.doorLight + 1);
    this.paint(IDLE, 0.5);

    // The marks ride their own container so the whole rim can turn slowly
    // without the ring under it wobbling — a ring is a ring whichever way up it
    // is, and marks that creep round it are what make it read as working.
    this.rim = scene.add.container(x, y).setDepth(DEPTH.doorLight + 2);
    for (let i = 0; i < MARKS; i++) {
      // Starting at the top and going clockwise, which is the order they are
      // asked for. Nothing depends on that — the row is the record — but a rim
      // that fills up the way you would read it costs nothing.
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / MARKS;
      const mark = scene.add
        .circle(Math.cos(angle) * r, Math.sin(angle) * r, MARK_RADIUS, IDLE, 0.42)
        .setStrokeStyle(3, IDLE, 0.7);
      this.rim.add(mark);
      this.marks.push(mark);
    }

    scene.tweens.add({
      targets: this.rim,
      angle: 360,
      duration: 42_000,
      repeat: -1,
      ease: 'Linear',
    });
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.2, to: 0.42 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Whether a point is inside the circle. The same test the drawing is drawn
   * from, so what she can see and what the buttons do cannot drift apart.
   */
  contains(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(this.x, this.y, x, y) <= this.r;
  }

  /** She is standing in it, or she is not. Idempotent — called every frame. */
  setLive(live: boolean): void {
    if (this.spent || live === this.live) return;
    this.live = live;
    this.paint(live ? LIVE : IDLE, live ? 1 : 0.5);
    this.glow.setTint(live ? LIVE : IDLE);
    this.scene.tweens.add({
      targets: this.glow,
      scale: this.glow.scale * (live ? 1.1 : 1 / 1.1),
      duration: 260,
      ease: 'Quad.easeOut',
    });
  }

  /** One press landed: light the next dark mark in that button's colour. */
  light(index: number, color: number): void {
    const mark = this.marks[index];
    if (!mark) return;
    mark.setFillStyle(color, 0.9);
    mark.setStrokeStyle(4, 0xffffff, 0.9);
    this.scene.tweens.add({
      targets: mark,
      scale: { from: 2.1, to: 1 },
      duration: 420,
      ease: 'Back.easeOut',
    });
  }

  /**
   * The summoning: the whole ring goes white and swells out of itself. Left
   * bright afterwards — the spell worked, and a circle that went back to its
   * resting colour would say it had not.
   */
  blaze(): void {
    this.spent = true;
    this.paint(0xffffff, 1);
    this.glow.setTint(0xffffff);
    this.scene.tweens.add({
      targets: this.glow,
      scale: { from: this.glow.scale, to: this.glow.scale * 2.4 },
      alpha: { from: 1, to: 0.5 },
      duration: 900,
      ease: 'Quad.easeOut',
    });
    for (const mark of this.marks) {
      this.scene.tweens.add({
        targets: mark,
        scale: { from: 1, to: 1.9 },
        duration: 520,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    }
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.rim);
    this.scene.tweens.killTweensOf(this.glow);
    this.rim.destroy();
    this.ring.destroy();
    this.glow.destroy();
  }

  /**
   * Two rings and a scatter of ticks between them. Not runes — anything
   * letter-shaped in this game is a thing she would try to read.
   */
  private paint(color: number, alpha: number): void {
    const g = this.ring;
    g.clear();
    g.lineStyle(5, color, alpha);
    g.strokeCircle(this.x, this.y, this.r);
    g.lineStyle(3, color, alpha * 0.7);
    g.strokeCircle(this.x, this.y, this.r - TILE_SIZE * 0.55);

    g.lineStyle(3, color, alpha * 0.55);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12 + Math.PI / 24;
      const inner = this.r - TILE_SIZE * 0.5;
      g.lineBetween(
        this.x + Math.cos(a) * inner,
        this.y + Math.sin(a) * inner,
        this.x + Math.cos(a) * this.r,
        this.y + Math.sin(a) * this.r,
      );
    }
  }
}
