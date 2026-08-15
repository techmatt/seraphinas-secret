/**
 * What she is collecting, as a row of empty outlines that fill up.
 *
 * The tool row's argument, one shelf along: a row that *grows* a box when she
 * finds something is a row that changed shape, and a row that had three ghosted
 * gems in it all along is a row that filled up. She cannot read "0 of 3" and she
 * does not have to — the picture of the thing she is looking for is sitting in
 * the box before she has found it, which is the whole instruction.
 *
 * It sits to the right of the tool row on the same line, with a gap. Near enough
 * that the two read as one pocket, far enough that they are two answers to two
 * questions: what am I holding, and what am I looking for. The row above the tool
 * row is the coin row's, and answers a third: what have I kept.
 *
 * At the end of it, a yellow dot: the button that says the job again. The same
 * grammar as the blue dot at the end of the tool row, and the same rule as every
 * other button in this game — a colour, never a letter. See ButtonDot.
 *
 * **A box holds one of two things.** A gem she has to go and find, ghosted until
 * she has it — or, during the ritual, the *button* she is going to be asked for,
 * drawn as the coloured dot on the pad. The second kind is the same promise as
 * the first: three boxes, all of them there from the start, filling up one at a
 * time. She cannot read "red" and she does not have to, because the dot on the
 * row and the button under her thumb are the same colour.
 */

import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT } from '../config';
import {
  makeButtonDot,
  makeGlow,
  padColor,
  PAD_COLOR,
  type PadColorName,
} from './ButtonDot';
import {
  BOOK_ICON,
  CARROT_ICON,
  GEM_ICONS,
  ICON_SIZE,
  LOG_ICON,
  type GemId,
  type IconDef,
} from './toolIcons';
import { BUNNY_ICON } from '../world/Bunny';
import type { QuestSlot, SlotKind } from '../quest/QuestEngine';

/** One box, and the gap to the next. A little under the tool row's. */
const BOX = 48;
const GAP = 10;

const ROUND = 12;

/**
 * Where the row starts. Clear of the tool row's four boxes and its blue dot,
 * which together run to about x 340.
 */
const LEFT = 404;
const BOTTOM = GAME_HEIGHT - 24;

const DARK = 0x1b1030;
const LILAC = 0xd9c7ff;
const PALE = 0xfff6ff;

/**
 * An empty slot is a ghost of what goes in it: there, and not there yet. Dim
 * enough that a filled box is unmistakably different, bright enough that the
 * *colour* still comes through — "the green one" is the whole instruction.
 */
const GHOST_ALPHA = 0.34;

/** How much of a box a picture fills, whatever size the picture is drawn at. */
const ICON_FILL = BOX - 14;
const ICON_SCALE = ICON_FILL / ICON_SIZE;

/**
 * What each kind of box holds, and what colour its own light is.
 *
 * Everything but a gem is one picture however many boxes of it there are — four
 * identical logs read as "four of these", where four different things would read
 * as a list. The gem is the exception because the three stones are three colours
 * and the colour *is* the instruction; it is resolved from the slot's id below.
 *
 * `size` is the art's own, so a picture cut off a 32-pixel animal sheet and one
 * cut off a 16-pixel icon sheet end up the same size in the box.
 */
type BoxArt = IconDef | typeof BUNNY_ICON;

const KIND_ICONS: Partial<Record<SlotKind, { icon: BoxArt; size: number; tint: number }>> = {
  tree: { icon: LOG_ICON, size: ICON_SIZE, tint: 0xd9b25f },
  carrot: { icon: CARROT_ICON, size: ICON_SIZE, tint: 0xff9d3c },
  bunny: { icon: BUNNY_ICON, size: BUNNY_ICON.size, tint: 0xfff0dc },
  storybook: { icon: BOOK_ICON, size: ICON_SIZE, tint: 0xffcf8f },
};

/** A frame name or a frame number — the two ways this game addresses a sheet. */
const frameOf = (icon: BoxArt): string | number => ('frame' in icon ? icon.frame : icon.slot);

interface Box {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
  /** The gem's picture, or the button's dot. One or the other, never both. */
  icon: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  id: string;
  filled: boolean;
}

export interface QuestRow {
  container: Phaser.GameObjects.Container;
  /** Redraw from the engine's slots. Rebuilds when the slot list itself changed. */
  show: (slots: QuestSlot[]) => void;
  /** The moment one lands: the box thumps and the gem flashes white. */
  land: (id: string) => void;
  /** Where a slot is on screen, so something can be thrown at it. */
  slotAt: (id: string) => { x: number; y: number } | null;
}

export function makeQuestRow(scene: Phaser.Scene): QuestRow {
  let boxes: Box[] = [];

  const container = scene.add
    .container(0, 0, [])
    .setDepth(DEPTH.hud)
    .setScrollFactor(0)
    .setVisible(false);

  // The yellow button, at the end of the row: press it and he says the job
  // again. Not pulsing — the row is not asking to be pressed, it is saying which
  // button belongs to it.
  const dot = makeButtonDot(scene, 0, BOTTOM - BOX / 2, {
    color: PAD_COLOR.y,
    radius: 12,
  }).setAlpha(0.85);
  container.add(dot);

  const build = (slots: QuestSlot[]) => {
    for (const box of boxes) box.container.destroy();
    boxes = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const x = LEFT + i * (BOX + GAP) + BOX / 2;
      const y = BOTTOM - BOX / 2;

      // What the box is *about*, and what colour its own light is. A gem gives
      // both; a button gives its pad colour and draws itself; everything else
      // comes off the table above.
      const kind = KIND_ICONS[slot.kind];
      const tint =
        slot.kind === 'button'
          ? padColor(slot.id as PadColorName)
          : (kind?.tint ?? GEM_ICONS[slot.id as GemId].tint);

      const glow = makeGlow(scene, 0, 0, BOX * 0.95, tint, 0.55).setVisible(false);
      const frame = scene.add.graphics();

      let icon: Box['icon'];
      if (slot.kind === 'button') {
        // Not pulsing: the row is saying which buttons this is about, not asking
        // to be pressed. The one asking is the boy, out loud, one at a time.
        icon = makeButtonDot(scene, 0, 0, { color: tint, radius: 13 });
      } else if (kind) {
        icon = scene.add
          .image(0, 0, kind.icon.file, frameOf(kind.icon))
          .setScale(ICON_FILL / kind.size);
        if (scene.textures.exists(kind.icon.file)) {
          scene.textures.get(kind.icon.file).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      } else {
        const gem = GEM_ICONS[slot.id as GemId];
        icon = scene.add.image(0, 0, gem.file, gem.slot).setScale(ICON_SCALE);
        if (scene.textures.exists(gem.file)) {
          scene.textures.get(gem.file).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      }

      const box = scene.add.container(x, y, [glow, frame, icon]);
      container.add(box);
      boxes.push({ container: box, frame, glow, icon, id: slot.id, filled: false });
    }

    dot.setX(LEFT + slots.length * (BOX + GAP) + 4);
  };

  const paint = () => {
    for (const box of boxes) {
      box.frame.clear();
      box.frame.fillStyle(DARK, 0.97);
      box.frame.fillRoundedRect(-BOX / 2, -BOX / 2, BOX, BOX, ROUND);
      box.frame.lineStyle(box.filled ? 4 : 3, box.filled ? PALE : LILAC, box.filled ? 1 : 0.5);
      box.frame.strokeRoundedRect(-BOX / 2, -BOX / 2, BOX, BOX, ROUND);
      box.glow.setVisible(box.filled);
      box.icon.setAlpha(box.filled ? 1 : GHOST_ALPHA);
    }
  };

  const show = (slots: QuestSlot[]) => {
    container.setVisible(slots.length > 0);
    if (!slots.length) return;

    const sameRow =
      boxes.length === slots.length && boxes.every((b, i) => b.id === slots[i]!.id);
    if (!sameRow) build(slots);
    for (let i = 0; i < boxes.length; i++) boxes[i]!.filled = slots[i]!.filled;
    paint();
  };

  const slotAt = (id: string) => {
    const box = boxes.find((b) => b.id === id);
    return box ? { x: box.container.x, y: box.container.y } : null;
  };

  const land = (id: string) => {
    const box = boxes.find((b) => b.id === id);
    if (!box) return;
    scene.tweens.killTweensOf(box.container);
    scene.tweens.add({
      targets: box.container,
      scale: { from: 1, to: 1.3 },
      duration: 130,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => box.container.setScale(1),
    });
    // A gem flashes white as it lands. A button dot is already its own light and
    // a container has nothing to tint, so it gets the thump and nothing else.
    const icon = box.icon;
    if (!(icon instanceof Phaser.GameObjects.Image)) return;
    icon.setTintFill(0xffffff);
    scene.time.delayedCall(110, () => icon.clearTint());
  };

  return { container, show, land, slotAt };
}
