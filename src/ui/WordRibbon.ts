/**
 * A line of words, one Phaser Text apiece, with the word being spoken lit up.
 *
 * This is the load-bearing mechanic of the whole game, on its own so that there
 * is exactly one of it. She cannot read, so every word she sees is spoken and
 * the word being spoken is the word that glows — and until the book reader
 * existed, the only place that happened was inside a speech balloon, so the
 * layout and the glow lived in `SpeechBubble`. They are two places now: a
 * balloon over somebody's head, and a sentence on the right-hand page of an open
 * book. The *presentation* differs — size, wrap width, ink colour — and the
 * mechanic must not, or the book would be a second implementation of the one
 * thing this game is for.
 *
 * So: everything about turning `TimedWord[]` into words on screen and a clock
 * into which one is lit is here. What it looks like is a `RibbonStyle`, and
 * where it sits is the caller's.
 *
 * One Text per word rather than one per line, because a single word has to grow
 * and change colour on its own. A chunky slab behind the live word rather than a
 * tint alone, because a pre-reader finds the block far faster than the colour.
 */

import Phaser from 'phaser';
import type { TimedWord } from '../voice/VoiceBank';

/** How a ribbon is drawn. Everything that differs between the two callers. */
export interface RibbonStyle {
  text: Phaser.Types.GameObjects.Text.TextStyle;
  /** Wrap once a word would take the line past this, in design pixels. */
  maxWidth: number;
  /** Distance from one wrapped row to the next. */
  lineHeight: number;
  /** Space between words on a row. */
  wordGap: number;
  /** The slab behind the live word. */
  slab: number;
  /** The live word's colour. */
  spoken: string;
  /** Everybody else's. */
  resting: string;
}

interface Laid {
  text: Phaser.GameObjects.Text;
  word: string;
}

export class WordRibbon extends Phaser.GameObjects.Container {
  private readonly slab: Phaser.GameObjects.Rectangle;
  private laid: Laid[] = [];
  private timed: TimedWord[] = [];
  private lit = -1;

  /** The block the words came out to, so the caller can frame it. */
  private block = { width: 0, height: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly style: RibbonStyle,
  ) {
    super(scene, 0, 0);
    // Behind the words and in front of nothing else: it is added first, and the
    // words are added to this same container as they are laid out.
    this.slab = scene.add.rectangle(0, 0, 10, 10, style.slab).setVisible(false);
    this.add(this.slab);
  }

  /** The words on screen, in order. */
  get words(): string[] {
    return this.laid.map((l) => l.word);
  }

  /** Index into `words` of the glowing one, or -1 between words. */
  get highlighted(): number {
    return this.lit;
  }

  get blockWidth(): number {
    return this.block.width;
  }

  get blockHeight(): number {
    return this.block.height;
  }

  /**
   * Lay a line out, centred on this container's own origin.
   *
   * Two passes on purpose. The first walks the words from a (0, 0) top-left,
   * wrapping by hand; the second shifts the lot so the middle of the block is
   * the origin, which is what a caller positions against — a balloon centres on
   * a speaker's head and a page centres on itself, and neither wants to know how
   * many rows the sentence came out to.
   */
  layout(words: TimedWord[]): void {
    this.clear();
    this.timed = words;

    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;

    for (const { word } of words) {
      const text = this.scene.add.text(0, 0, word, this.style.text).setOrigin(0.5, 0.5);

      if (x > 0 && x + text.width > this.style.maxWidth) {
        x = 0;
        y += this.style.lineHeight;
      }
      text.setPosition(x + text.width / 2, y + text.height / 2);
      x += text.width + this.style.wordGap;

      width = Math.max(width, x - this.style.wordGap);
      height = Math.max(height, y + text.height);

      this.add(text);
      this.laid.push({ text, word });
    }

    for (const { text } of this.laid) {
      text.x -= width / 2;
      text.y -= height / 2;
    }
    this.block = { width, height };
  }

  /**
   * Light whichever word owns this instant, or none.
   *
   * A no-op when the answer has not changed, because it runs every frame and the
   * pop it starts is a tween — restarting one every frame would be a word that
   * never finishes growing.
   */
  highlight(seconds: number): void {
    const index = this.timed.findIndex((w) => seconds >= w.start && seconds < w.end);
    if (index === this.lit) return;

    const previous = this.laid[this.lit];
    if (previous) {
      this.scene.tweens.killTweensOf(previous.text);
      previous.text.setColor(this.style.resting).setScale(1);
    }

    this.lit = index;

    const current = this.laid[index];
    if (!current) {
      this.slab.setVisible(false);
      return;
    }

    this.slab
      .setVisible(true)
      .setPosition(current.text.x, current.text.y)
      .setSize(current.text.width + 16, current.text.height + 6);

    current.text.setColor(this.style.spoken);
    this.scene.tweens.add({
      targets: current.text,
      scale: { from: 1.22, to: 1.08 },
      duration: 180,
      ease: 'Back.easeOut',
    });
  }

  /** Take the words away, and any tween still running on one of them. */
  clear(): void {
    for (const { text } of this.laid) {
      this.scene.tweens.killTweensOf(text);
      text.destroy();
    }
    this.laid = [];
    this.timed = [];
    this.lit = -1;
    this.slab.setVisible(false);
    this.block = { width: 0, height: 0 };
  }
}

/**
 * Words for a line the voice manifest never had.
 *
 * The game plays on mute when the manifest does not arrive, and a page with no
 * words on it would be the one thing this game may never do — text and voice are
 * a pair, and losing the voice must cost the highlight rather than the sentence.
 * Every token is given zero length, so nothing ever lights up and nothing ever
 * jumps.
 */
export function untimed(text: string): TimedWord[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => ({ word, start: 0, end: 0 }));
}
