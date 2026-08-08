/**
 * A line of dialog that speaks itself and lights up each word as it is said.
 *
 * This is the load-bearing mechanic of the whole game: Seraphina cannot read,
 * so every word she sees is spoken, and the word being spoken is the word that
 * glows. Everything about the presentation is tuned for that — one word per
 * Phaser Text object so a single word can grow and change colour, a chunky
 * highlight slab behind it so the eye cannot miss which one is live, and no
 * fades so slow that the connection between sound and word gets lost.
 */

import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import type { VoiceBank, VoiceLine, VoicePlayback } from '../voice/VoiceBank';

const MAX_WIDTH = 620;
const PAD_X = 34;
const PAD_Y = 26;
const LINE_HEIGHT = 46;
const WORD_GAP = 20;

/** Keep the balloon this far inside the canvas, and this far above the speaker. */
const SCREEN_MARGIN = 40;
const SPEAKER_GAP = 92;

/** How long the bubble lingers after the last word before it drifts away. */
const HOLD_SECONDS = 0.7;

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '34px',
  fontStyle: 'bold',
  color: '#3a2450',
};

const SPOKEN = '#ffffff';
const RESTING = '#3a2450';

interface Laid {
  text: Phaser.GameObjects.Text;
  word: string;
}

export class SpeechBubble extends Phaser.GameObjects.Container {
  private readonly balloon: Phaser.GameObjects.Graphics;
  private readonly slab: Phaser.GameObjects.Rectangle;
  private words: Laid[] = [];

  private line: VoiceLine | null = null;
  private playback: VoicePlayback | null = null;

  /** Set by scrub(): a frozen clock, for tests and for stepping through a line. */
  private scrubbed: number | null = null;

  private highlighted = -1;

  /** Where the tail should point, in world space. */
  private speaker = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bank: VoiceBank,
  ) {
    super(scene, x, y);
    this.speaker = { x, y };

    this.balloon = scene.add.graphics();
    this.slab = scene.add.rectangle(0, 0, 10, 10, 0xff8fd8).setVisible(false);

    this.add([this.balloon, this.slab]);
    this.setDepth(40).setVisible(false);
    scene.add.existing(this);
  }

  // --- state a caller (or a test) can read ---------------------------------

  get lineId(): string | null {
    return this.line?.id ?? null;
  }

  get spokenWords(): string[] {
    return this.words.map((w) => w.word);
  }

  /** Index into `spokenWords`, or -1 between words. */
  get highlightedIndex(): number {
    return this.highlighted;
  }

  get time(): number {
    return this.scrubbed ?? this.playback?.time ?? 0;
  }

  get isSpeaking(): boolean {
    return this.line !== null;
  }

  // --- driving it ----------------------------------------------------------

  /**
   * Say a manifest line. Calling it again restarts, so mashing A is fine.
   * `speaker` is who the tail points at; it defaults to wherever it pointed last.
   */
  say(id: string, speaker?: { x: number; y: number }): void {
    const line = this.bank.get(id);
    if (!line) {
      console.warn(`voice: no line "${id}" in the manifest`);
      return;
    }

    this.stop();
    this.line = line;
    this.scrubbed = null;
    if (speaker) this.speaker = { x: speaker.x, y: speaker.y };
    this.layout(line);

    this.setVisible(true).setAlpha(1).setScale(0.86);
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    this.playback = this.bank.play(id);
    this.applyHighlight(0);
  }

  /**
   * Freeze the line's clock at `seconds` and show the matching word, with no
   * audio running. Playwright needs the highlight to hold still long enough to
   * be asserted on and screenshotted; real-time playback cannot promise that.
   */
  scrub(seconds: number): void {
    if (!this.line) return;
    this.playback?.stop();
    this.playback = null;
    this.scrubbed = seconds;
    this.applyHighlight(seconds);
  }

  stop(): void {
    this.playback?.stop();
    this.playback = null;
    this.line = null;
    this.scrubbed = null;
    this.highlighted = -1;
    this.setVisible(false);
    this.scene.tweens.killTweensOf(this);
    for (const { text } of this.words) this.scene.tweens.killTweensOf(text);
  }

  /** Call once a frame from the scene. */
  tick(): void {
    if (!this.line || this.scrubbed !== null) return;

    const t = this.time;
    this.applyHighlight(t);

    if (t > this.line.duration + HOLD_SECONDS) {
      const line = this.line;
      this.line = null; // stop ticking while the exit tween runs
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        y: this.y - 18,
        duration: 260,
        onComplete: () => {
          this.y += 18;
          if (this.line === null || this.line === line) this.stop();
        },
      });
    }
  }

  // --- the glow ------------------------------------------------------------

  private applyHighlight(seconds: number): void {
    if (!this.line) return;

    const index = this.line.words.findIndex((w) => seconds >= w.start && seconds < w.end);
    if (index === this.highlighted) return;

    const previous = this.words[this.highlighted];
    if (previous) {
      this.scene.tweens.killTweensOf(previous.text);
      previous.text.setColor(RESTING).setScale(1);
    }

    this.highlighted = index;

    const current = this.words[index];
    if (!current) {
      this.slab.setVisible(false);
      return;
    }

    // A slab behind the word rather than a colour change alone: a pre-reader
    // finds the block far faster than the tint.
    this.slab
      .setVisible(true)
      .setPosition(current.text.x, current.text.y)
      .setSize(current.text.width + 16, current.text.height + 6);

    current.text.setColor(SPOKEN);
    this.scene.tweens.add({
      targets: current.text,
      scale: { from: 1.22, to: 1.08 },
      duration: 180,
      ease: 'Back.easeOut',
    });
  }

  // --- layout --------------------------------------------------------------

  /** One Text per word, wrapped by hand, so each word can be styled alone. */
  private layout(line: VoiceLine): void {
    for (const { text } of this.words) text.destroy();
    this.words = [];

    // First pass: lay the words out from a (0, 0) top-left. Each word is
    // centre-origin so the highlight pop grows both ways instead of shoving
    // itself into the next word.
    let x = 0;
    let y = 0;
    let blockWidth = 0;
    let blockHeight = 0;

    for (const { word } of line.words) {
      const text = this.scene.add.text(0, 0, word, TEXT_STYLE).setOrigin(0.5, 0.5);

      if (x > 0 && x + text.width > MAX_WIDTH) {
        x = 0;
        y += LINE_HEIGHT;
      }
      text.setPosition(x + text.width / 2, y + text.height / 2);
      x += text.width + WORD_GAP;

      blockWidth = Math.max(blockWidth, x - WORD_GAP);
      blockHeight = Math.max(blockHeight, y + text.height);

      this.add(text);
      this.words.push({ text, word });
    }

    // Second pass: shift everything so the container's origin is the centre,
    // which is what the scene positions against.
    const offsetX = -blockWidth / 2;
    const offsetY = -blockHeight / 2;
    for (const { text } of this.words) {
      text.x += offsetX;
      text.y += offsetY;
    }

    const w = blockWidth + PAD_X * 2;
    const h = blockHeight + PAD_Y * 2;
    const left = offsetX - PAD_X;
    const top = offsetY - PAD_Y;

    // Sit above the speaker, but never off the edge of the room.
    this.setPosition(
      Phaser.Math.Clamp(
        this.speaker.x,
        w / 2 + SCREEN_MARGIN,
        GAME_WIDTH - w / 2 - SCREEN_MARGIN,
      ),
      this.speaker.y - SPEAKER_GAP - h / 2,
    );

    this.balloon.clear();
    this.balloon.fillStyle(0xfff6ff, 0.97);
    this.balloon.lineStyle(5, 0xb98ad6, 1);
    this.balloon.fillRoundedRect(left, top, w, h, 26);
    this.balloon.strokeRoundedRect(left, top, w, h, 26);

    // A stubby tail, leaning towards whoever is talking.
    const tailX = Phaser.Math.Clamp(this.speaker.x - this.x, left + 40, left + w - 84);
    this.balloon.fillStyle(0xfff6ff, 0.97);
    this.balloon.fillTriangle(tailX, top + h - 4, tailX + 44, top + h - 4, tailX + 14, top + h + 28);
  }
}
