/**
 * The four boxes in the bottom-left corner, and which one is lit.
 *
 * She cannot read, so the row has to answer "what am I holding" as a picture and
 * nothing else: four boxes, the one she is holding lit up and a little larger,
 * the rest dark. Empty boxes are drawn rather than hidden — a row that grows a
 * box when a quest gives her something is a row that changed shape, and a row
 * that had three dark boxes in it all along is a row that filled up. The second
 * is a thing a four-year-old can see happen.
 *
 * The blue button cycles it. With only the axe there is nothing to cycle to, so
 * the axe's box bounces instead: a button that does nothing at all is a button
 * she stops pressing, and pressing this one is the skill being taught.
 */

import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT } from '../config';
import { makeButtonDot, makeGlow, PAD_COLOR } from './ButtonDot';
import { ICON_SHEETS, ICON_SIZE, TOOL_ICONS } from './toolIcons';
import { SLOTS, type ToolBelt } from '../world/ToolBelt';

/** One box, and the gap to the next. Big enough to read across a living room. */
const BOX = 56;
const GAP = 12;

/** Corner rounding on a box. A quarter of it, so the boxes read as soft. */
const ROUND = 14;

/**
 * Where the row sits, as the bottom-left corner of the leftmost box.
 *
 * The row above it is deliberately empty. A three-slot coin row goes there when
 * there are coins — near enough that the two read as one pocket, far enough that
 * neither has to move when the other arrives.
 */
const LEFT = 34;
const BOTTOM = GAME_HEIGHT - 24;

/** How far above the tool row the coin row will sit. Reserved, not drawn. */
export const COIN_ROW_BOTTOM = BOTTOM - BOX - 20;

/** The deep purple everything in this game's UI sits on. */
const DARK = 0x1b1030;
const LILAC = 0xd9c7ff;
const PALE = 0xfff6ff;

/** An icon fills most of its box, with a margin so the frame still reads. */
const ICON_SCALE = (BOX - 16) / ICON_SIZE;

interface Box {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image | null;
}

export interface ToolRow {
  container: Phaser.GameObjects.Container;
  /** Redraw from the belt. Cheap, and only ever called when something changed. */
  refresh: () => void;
  /** "Yes, that is the button, and no, there is nothing else yet." */
  bounce: (slot: number) => void;
}

/** Queue the icon sheets. Call from a scene's preload, like any other art. */
export function preloadToolIcons(scene: Phaser.Scene): void {
  for (const file of ICON_SHEETS) {
    if (scene.textures.exists(file)) continue;
    scene.load.spritesheet(file, file, { frameWidth: ICON_SIZE, frameHeight: ICON_SIZE });
  }
}

export function makeToolRow(scene: Phaser.Scene, belt: ToolBelt): ToolRow {
  const boxes: Box[] = [];

  for (let i = 0; i < SLOTS; i++) {
    const x = LEFT + i * (BOX + GAP) + BOX / 2;
    const y = BOTTOM - BOX / 2;

    // Additive, so a lit box glows into the world behind it rather than veiling
    // it — the same reasoning as the button dots, and the same texture. Blue,
    // and dialled down until it reads as blue: additive light this bright
    // saturates to white over pale ground, and the whole point of the colour is
    // that it is the colour of the button that changes this row.
    const glow = makeGlow(scene, 0, 0, BOX * 0.95, PAD_COLOR.x, 0.5).setVisible(false);
    const frame = scene.add.graphics();
    const container = scene.add.container(x, y, [glow, frame]);
    boxes.push({ container, frame, glow, icon: null });
  }

  // A blue dot at the end of the row: the button that changes it, in the one
  // form this game ever asks for a button — a colour, never a letter. Not
  // pulsing, because the row is not asking to be pressed; it is saying which
  // button belongs to it, the way the green dot over a chest says green.
  const dot = makeButtonDot(scene, LEFT + SLOTS * (BOX + GAP) + 6, BOTTOM - BOX / 2, {
    color: PAD_COLOR.x,
    radius: 13,
  }).setAlpha(0.85);

  const container = scene.add
    .container(0, 0, [...boxes.map((b) => b.container), dot])
    .setDepth(DEPTH.hud)
    // The world moves underneath it; the row does not.
    .setScrollFactor(0);

  const refresh = () => {
    const held = belt.heldSlot;

    for (let i = 0; i < SLOTS; i++) {
      const box = boxes[i]!;
      const tool = belt.slots[i] ?? null;
      const lit = i === held;

      box.frame.clear();
      // A lit box is brighter and thicker rather than a different colour: the
      // colour of a box is the box, and one that changed hue would read as a
      // different kind of thing rather than as the same thing chosen.
      //
      // All but opaque, because the row has to look the same standing on a road
      // as it does standing on grass. At two thirds it read as a dark box in the
      // wood and as four grey smudges on the pale dirt outside her own door, and
      // at seven eighths a stump behind it still showed through the empty box
      // and looked like something she was carrying.
      box.frame.fillStyle(DARK, 0.97);
      box.frame.fillRoundedRect(-BOX / 2, -BOX / 2, BOX, BOX, ROUND);
      box.frame.lineStyle(lit ? 5 : 3, lit ? PALE : LILAC, lit ? 1 : 0.5);
      box.frame.strokeRoundedRect(-BOX / 2, -BOX / 2, BOX, BOX, ROUND);

      box.glow.setVisible(lit);
      box.container.setScale(lit ? 1.08 : 1);

      const want = tool ? TOOL_ICONS[tool] : null;
      if (!want) {
        box.icon?.destroy();
        box.icon = null;
        continue;
      }
      if (!box.icon) {
        if (!scene.textures.exists(want.file)) continue;
        box.icon = scene.add.image(0, 0, want.file, want.slot).setScale(ICON_SCALE);
        // Somebody else's pixel art, blown up seven times. Without this it is
        // soup, the same as every other sheet the world draws from.
        scene.textures.get(want.file).setFilter(Phaser.Textures.FilterMode.NEAREST);
        box.container.add(box.icon);
      }
      box.icon.setFrame(want.slot);
      // A tool she is not holding is still hers, so it dims rather than greys.
      box.icon.setAlpha(lit ? 1 : 0.62);
    }
  };

  const bounce = (slot: number) => {
    const box = boxes[slot];
    if (!box) return;
    const home = box.container.scale;
    scene.tweens.killTweensOf(box.container);
    scene.tweens.add({
      targets: box.container,
      scale: { from: home, to: home * 1.24 },
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => box.container.setScale(home),
    });
    if (!box.icon) return;
    // The glint: the icon flashes white and comes back. It is the difference
    // between "nothing happened" and "yes, that one, and it is the only one".
    const icon = box.icon;
    icon.setTintFill(0xffffff);
    scene.time.delayedCall(90, () => icon.clearTint());
  };

  refresh();
  return { container, refresh, bounce };
}
