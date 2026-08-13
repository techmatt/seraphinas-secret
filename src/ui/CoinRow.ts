/**
 * Three boxes above the tool row, and how many of them have a coin in.
 *
 * The tool row's argument again, one shelf up: three boxes, all of them there
 * from the first frame of the game, filling up one at a time. A row that grew a
 * box when she earned something would be a row that changed shape; a row that
 * has had three ghosted coins in it all along is a row that *fills up*, and
 * filling up is a thing a four-year-old can watch happen to herself. She cannot
 * read "1/3" and never has to — the empty boxes are the number.
 *
 * Always visible, including at nought coins on the first morning of the game.
 * That is the whole reason the shape is worth anything: the promise has to be on
 * screen before it is kept, or the first coin arrives in a box she has never
 * seen and lands as clutter rather than as an event.
 *
 * The row above the tool row was left empty for this from the day the tool row
 * was written — see `COIN_ROW_BOTTOM` in ToolRow. Same left edge, so the two
 * line up as one pocket; a little smaller, because what she is *holding*
 * outranks what she is *keeping*.
 *
 * No button dot at the end of it. Every other row in this game ends in the
 * colour of the button that works it, and nothing works this one: coins arrive
 * because something happened, never because she pressed anything.
 */

import Phaser from 'phaser';
import { DEPTH } from '../config';
import { makeGlow } from './ButtonDot';
import { COIN_ICON, ICON_SIZE } from './toolIcons';
import { COIN_SLOTS } from '../state/session';
import { COIN_ROW_BOTTOM, HUD_LEFT } from './ToolRow';

/** One box, and the gap to the next. Under the tool row's 56. */
const BOX = 44;
const GAP = 10;

const ROUND = 11;

const DARK = 0x1b1030;
const LILAC = 0xd9c7ff;
const PALE = 0xfff6ff;

/** The gold of the coin itself, for its glow and its sparks. */
const GOLD = 0xffd257;

/**
 * An empty box is a ghost of the coin that goes in it: there, and not there yet.
 * The same value the quest row ghosts its gems at, and for the same reason — dim
 * enough that a filled box is unmistakably different, bright enough that it is
 * still recognisably a coin.
 */
const GHOST_ALPHA = 0.34;

const ICON_SCALE = (BOX - 14) / ICON_SIZE;

interface Box {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
  coin: Phaser.GameObjects.Image | null;
}

export interface CoinRow {
  container: Phaser.GameObjects.Container;
  /** Redraw from a count. Cheap, and only called when something changed. */
  refresh: (coins: number) => void;
  /** The moment one lands: the box thumps, the coin flashes, gold goes up. */
  land: (index: number) => void;
  /**
   * One she had no room for: the last box thumps and a coin bounces off it and
   * falls away. Nothing is lost and nothing is said — see `RoomScene.grantCoin`.
   */
  bounceOff: () => void;
  /** Where a box is on screen, so a coin can be thrown at it. */
  slotAt: (index: number) => { x: number; y: number } | null;
}

export function makeCoinRow(scene: Phaser.Scene): CoinRow {
  const boxes: Box[] = [];

  const centreOf = (i: number) => ({
    x: HUD_LEFT + i * (BOX + GAP) + BOX / 2,
    y: COIN_ROW_BOTTOM - BOX / 2,
  });

  for (let i = 0; i < COIN_SLOTS; i++) {
    const { x, y } = centreOf(i);
    // Additive gold, so a full box glows into the world behind it rather than
    // veiling it — the same texture and the same reasoning as the tool row's
    // blue, in the colour of the thing in the box.
    const glow = makeGlow(scene, 0, 0, BOX * 0.95, GOLD, 0.5).setVisible(false);
    const frame = scene.add.graphics();
    const container = scene.add.container(x, y, [glow, frame]);
    boxes.push({ container, frame, glow, coin: null });
  }

  const container = scene.add
    .container(0, 0, boxes.map((b) => b.container))
    .setDepth(DEPTH.hud)
    // The world moves underneath it; the row does not.
    .setScrollFactor(0);

  /**
   * The coin image for a box, made on first use.
   *
   * Deferred because the sheet is loaded art and a zone can be built before it
   * has arrived — the tool row has the same guard for the same reason. A row
   * with no pictures in it is still three boxes, which is still most of the
   * answer.
   */
  const coinFor = (box: Box): Phaser.GameObjects.Image | null => {
    if (box.coin) return box.coin;
    if (!scene.textures.exists(COIN_ICON.file)) return null;
    scene.textures.get(COIN_ICON.file).setFilter(Phaser.Textures.FilterMode.NEAREST);
    box.coin = scene.add.image(0, 0, COIN_ICON.file, COIN_ICON.slot).setScale(ICON_SCALE);
    box.container.add(box.coin);
    return box.coin;
  };

  const refresh = (coins: number) => {
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      const full = i < coins;

      box.frame.clear();
      // All but opaque, for the tool row's reason: the row has to look the same
      // standing on a road as it does standing on grass.
      box.frame.fillStyle(DARK, 0.97);
      box.frame.fillRoundedRect(-BOX / 2, -BOX / 2, BOX, BOX, ROUND);
      box.frame.lineStyle(full ? 4 : 3, full ? PALE : LILAC, full ? 1 : 0.5);
      box.frame.strokeRoundedRect(-BOX / 2, -BOX / 2, BOX, BOX, ROUND);

      box.glow.setVisible(full);
      coinFor(box)?.setAlpha(full ? 1 : GHOST_ALPHA);
    }
  };

  const land = (index: number) => {
    const box = boxes[index];
    if (!box) return;

    scene.tweens.killTweensOf(box.container);
    scene.tweens.add({
      targets: box.container,
      scale: { from: 1, to: 1.34 },
      duration: 140,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => box.container.setScale(1),
    });

    const coin = box.coin;
    if (coin) {
      coin.setTintFill(0xffffff);
      scene.time.delayedCall(110, () => coin.clearTint());
    }

    // Gold off the box, fixed to the screen like the box it comes off.
    const { x, y } = centreOf(index);
    const burst = scene.add
      .particles(x, y, 'spark', {
        speed: { min: 60, max: 210 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 260, max: 620 },
        blendMode: 'ADD',
        tint: [GOLD, 0xfff3b0, 0xffffff],
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 2);
    burst.explode(26);
    scene.time.delayedCall(900, () => burst.destroy());
  };

  const bounceOff = () => {
    const last = boxes[boxes.length - 1];
    if (!last) return;

    scene.tweens.killTweensOf(last.container);
    scene.tweens.add({
      targets: last.container,
      scale: { from: 1, to: 1.18 },
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => last.container.setScale(1),
    });

    if (!scene.textures.exists(COIN_ICON.file)) return;

    // A whole coin, up off the top of the last box and away to the right. It is
    // the only thing on screen that says what happened, so it has to be a coin
    // and not a spark — and it has to leave, because a coin that settled
    // anywhere would be a fourth coin she cannot pick up.
    const { x, y } = centreOf(boxes.length - 1);
    const spare = scene.add
      .image(x, y, COIN_ICON.file, COIN_ICON.slot)
      .setScale(ICON_SCALE)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 2);

    scene.tweens.add({
      targets: spare,
      x: x + 54,
      y: { from: y, to: y - 46 },
      angle: 300,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: spare,
          y: y + 70,
          alpha: 0,
          duration: 340,
          ease: 'Quad.easeIn',
          onComplete: () => spare.destroy(),
        });
      },
    });
  };

  const slotAt = (index: number) => (boxes[index] ? centreOf(index) : null);

  refresh(0);
  return { container, refresh, land, bounceOff, slotAt };
}
