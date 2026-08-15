/**
 * A line of dialog that speaks itself and lights up each word as it is said.
 *
 * The highlight itself is `WordRibbon` — one word per Phaser Text object, a
 * chunky slab behind the live one — and lives apart from this file because the
 * book reader draws the same mechanic on a page rather than in a balloon. What
 * is left here is the balloon: who is talking, where the words sit relative to
 * them, and what may talk over what.
 */

import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { WordRibbon, type RibbonStyle } from './WordRibbon';
import type { VoiceBank, VoiceLine, VoicePlayback } from '../voice/VoiceBank';

const PAD_X = 34;
const PAD_Y = 26;

/** Keep the balloon this far inside the canvas, and this far above the speaker. */
const SCREEN_MARGIN = 40;
const SPEAKER_GAP = 92;

/** How long the bubble lingers after the last word before it drifts away. */
const HOLD_SECONDS = 0.7;

const RIBBON: RibbonStyle = {
  text: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '34px',
    fontStyle: 'bold',
    color: '#3a2450',
  },
  maxWidth: 620,
  lineHeight: 46,
  wordGap: 20,
  slab: 0xff8fd8,
  spoken: '#ffffff',
  resting: '#3a2450',
  // Only the sound debug view ever puts a mark on a word. Nothing in the game
  // does, and nothing in the game may: see `markWords` below.
  marked: '#b3261e',
};

/**
 * Whoever is talking: where they are, and who they are.
 *
 * The balloon has always sat over the speaker; until there was somebody else in
 * the world the speaker was always Seraphina, so "over the speaker" and "over
 * her" were the same picture and nothing could tell them apart. They are not the
 * same picture any more — her sister says her own lines from where her sister is
 * standing — and `id` is how a test can say which of the two it is looking at
 * rather than guessing from coordinates.
 */
export interface Speaker {
  id: string;
  x: number;
  y: number;
}

/**
 * How much the line in the balloon matters.
 *
 * There are only two, and the whole of the distinction is what may talk over
 * what. `said` is somebody saying something to her — a person, a prop, the job
 * she has been given. `bark` is her naming what is in her hand. A bark cutting a
 * bark off is the wanted behaviour, because mashing the blue button should sound
 * like mashing the blue button; a bark cutting off the boy explaining the quest
 * is a sentence she needed and did not get, so it is dropped instead.
 */
type Priority = 'said' | 'bark';

export class SpeechBubble extends Phaser.GameObjects.Container {
  private readonly balloon: Phaser.GameObjects.Graphics;
  private readonly ribbon: WordRibbon;

  private line: VoiceLine | null = null;
  private playback: VoicePlayback | null = null;

  /** Set by scrub(): a frozen clock, for tests and for stepping through a line. */
  private scrubbed: number | null = null;

  /** What kind of line is up. Only meaningful while `line` is not null. */
  private priority: Priority = 'said';

  /** Who the tail points at, in world space. */
  private speaker: Speaker = { id: 'seraphina', x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bank: VoiceBank,
  ) {
    super(scene, x, y);
    this.speaker = { id: 'seraphina', x, y };

    this.balloon = scene.add.graphics();
    this.ribbon = new WordRibbon(scene, RIBBON);

    this.add([this.balloon, this.ribbon]);
    // Above every y-sorted thing in the world: a tree must never eat a word.
    this.setDepth(DEPTH.speech).setVisible(false);
    scene.add.existing(this);
  }

  // --- state a caller (or a test) can read ---------------------------------

  get lineId(): string | null {
    return this.line?.id ?? null;
  }

  get spokenWords(): string[] {
    return this.ribbon.words;
  }

  /** Index into `spokenWords`, or -1 between words. */
  get highlightedIndex(): number {
    return this.ribbon.highlighted;
  }

  get time(): number {
    return this.scrubbed ?? this.playback?.time ?? 0;
  }

  get isSpeaking(): boolean {
    return this.line !== null;
  }

  /** Who the balloon currently belongs to. */
  get speakerId(): string {
    return this.speaker.id;
  }

  // --- driving it ----------------------------------------------------------

  /**
   * Say a manifest line. Calling it again restarts, so mashing A is fine.
   * `speaker` is who the tail points at; it defaults to wherever it pointed last.
   */
  say(id: string, speaker?: Speaker): void {
    this.speak(id, 'said', speaker);
  }

  /**
   * Mutter a line, if there is nothing worth hearing already in the air.
   *
   * The whole difference from `say` is what it will not do. Another bark is cut
   * off — that is the wanted behaviour, and the reason there is no queue: three
   * presses of blue should sound like three presses of blue, not like three
   * sentences owed to her. Anything somebody actually said to her wins outright
   * and the bark is thrown away rather than held, because a bark held for two
   * seconds is a bark about a tool she has since switched away from.
   *
   * Returns whether it was said, so a caller can tell a dropped bark from a
   * spoken one.
   */
  bark(id: string, speaker: Speaker): boolean {
    if (this.line !== null && this.priority === 'said') return false;
    this.speak(id, 'bark', speaker);
    return true;
  }

  private speak(id: string, priority: Priority, speaker?: Speaker): void {
    const line = this.bank.get(id);
    if (!line) {
      console.warn(`voice: no line "${id}" in the manifest`);
      return;
    }

    this.stop();
    this.line = line;
    this.priority = priority;
    this.scrubbed = null;
    if (speaker) this.speaker = { id: speaker.id, x: speaker.x, y: speaker.y };
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

  /**
   * Underline some of the words in the balloon that is up.
   *
   * The sound debug view's, and nobody else's: it plays a clip through this
   * exact balloon so Matt is auditing the highlight the game will really draw,
   * and the words the aligner doubted are the ones he is listening for. Called
   * after `say`, because laying a line out is what clears the marks.
   *
   * In the game itself this is never called and the balloon is what it has
   * always been — every word the same, because every word is equally hers.
   */
  markWords(indices: Iterable<number>): void {
    this.ribbon.markWords(indices);
  }

  stop(): void {
    this.playback?.stop();
    this.playback = null;
    this.line = null;
    this.scrubbed = null;
    this.setVisible(false);
    this.scene.tweens.killTweensOf(this);
    this.ribbon.clear();
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
    this.ribbon.highlight(seconds);
  }

  // --- layout --------------------------------------------------------------

  /** Lay the words out, then draw a balloon round whatever shape they came out. */
  private layout(line: VoiceLine): void {
    this.ribbon.layout(line.words);

    const w = this.ribbon.blockWidth + PAD_X * 2;
    const h = this.ribbon.blockHeight + PAD_Y * 2;
    const left = -this.ribbon.blockWidth / 2 - PAD_X;
    const top = -this.ribbon.blockHeight / 2 - PAD_Y;

    // Sit above the speaker, but never off the edge of what is on screen. The
    // world scrolls now, so "the edge" is the camera's view of it and not the
    // canvas — a balloon clamped to the canvas would drift off in a big zone.
    //
    // Both axes, and the vertical one is newer and load-bearing: Dad calls her
    // in from a front door that may be right across the village, and a balloon
    // that honoured his position exactly would be a line spoken with no words on
    // screen — which is the one thing this game may never do. Clamped, it slides
    // to the edge of the view nearest the house, still leaning its tail that
    // way. See CLAUDE.md, "Every piece of on-screen text speaks aloud".
    const view = this.scene.cameras.main.worldView;
    const [viewLeft, viewRight] = view.width > 0 ? [view.left, view.right] : [0, GAME_WIDTH];
    const [viewTop, viewBottom] = view.height > 0 ? [view.top, view.bottom] : [0, GAME_HEIGHT];

    this.setPosition(
      Phaser.Math.Clamp(
        this.speaker.x,
        viewLeft + w / 2 + SCREEN_MARGIN,
        viewRight - w / 2 - SCREEN_MARGIN,
      ),
      Phaser.Math.Clamp(
        this.speaker.y - SPEAKER_GAP - h / 2,
        viewTop + h / 2 + SCREEN_MARGIN,
        viewBottom - h / 2 - SCREEN_MARGIN,
      ),
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
