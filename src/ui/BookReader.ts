/**
 * The book, open, over the top of everything else.
 *
 * This is the game's reading flagship: a two-page spread with a picture on the
 * left and one sentence on the right, and the sentence reads itself aloud with
 * the word being spoken lit up. That pairing is the whole feature — it is the
 * same `WordRibbon` the speech balloon uses, at storybook size, because a second
 * implementation of the highlight would be a second thing that could stop
 * agreeing with the audio.
 *
 * **It is a takeover, so it owns the screen.** The world's input is suspended by
 * the scene while this is up (see `RoomScene.handleBook`), the HUD rows go, and
 * everything here is welded to the camera. What it deliberately does *not* stop
 * is the day: the clock runs, the evening comes in behind the book, and nothing
 * about being read to is a thing that can be interrupted or lost. There is no
 * timer on a page and no way to get one wrong.
 *
 * **The buttons.** Green is ignored while the page is still reading and turns it
 * once the read has finished — a four-year-old mashing green cannot skip a
 * sentence, and cannot be told off for trying. Yellow reads the page again, from
 * anywhere in it, as many times as she likes. Red closes the book, which is
 * never a failure: the quest stays where it is and reopening comes back to the
 * same page. Blue does nothing at all in here.
 *
 * The page's picture is looked up by path and may simply not be there yet — see
 * `content/books/`. A missing one draws a placeholder card instead, so the whole
 * feature works with no art at all and dropping the real PNGs in changes nothing
 * but the picture.
 *
 * **Geometry is measured from the middle of the spread**, not from the corner of
 * the screen, because the whole book scales up out of nothing as it opens and a
 * layout hung off a corner would slide as well as grow.
 */

import Phaser from 'phaser';
import type { Book, BookPage } from '../../content/books';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { makeButtonDot } from './ButtonDot';
import { BOOK_SHEET, BOOK_SPREAD, registerBookArt } from './toolIcons';
import { untimed, WordRibbon, type RibbonStyle } from './WordRibbon';
import type { VoiceBank, VoicePlayback } from '../voice/VoiceBank';

/** How big the spread is drawn. 224x134 art at four times is 896x536. */
const SPREAD_SCALE = 4;

const SPREAD = { w: BOOK_SPREAD.w * SPREAD_SCALE, h: BOOK_SPREAD.h * SPREAD_SCALE };

/** Where the middle of the book sits on screen. */
const CENTRE = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 - 10 };

/**
 * One page's usable area inside the spread, in the art's own pixels: inset from
 * the outer edge by the cover, and from the spine by the fold.
 */
const PAGE = { inset: 14, spine: 8, top: 12, bottom: 12 };

/** Everything behind the book, dimmed. Not black: this is a cozy game. */
const VEIL = 0x1b1030;
const VEIL_ALPHA = 0.62;

/** The colours of a page: the paper, and the ink on it. */
const PAPER = 0xf4d3a5;
const INK = '#4a2d15';

/**
 * Storybook type. Much bigger than a speech balloon's, because this is the one
 * screen in the game whose whole job is the words — and wrapped narrow enough
 * that a page is three or four short rows rather than one long one.
 */
const RIBBON: RibbonStyle = {
  text: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: '46px',
    fontStyle: 'bold',
    color: INK,
  },
  maxWidth: 330,
  lineHeight: 66,
  wordGap: 18,
  slab: 0xffb3e6,
  spoken: '#3a1c06',
  resting: INK,
};

/** How long each half of the page-turn flourish runs. */
const FLIP_MS = 170;

/** The beat after the last word before the green dot comes up. */
const TURNABLE_TAIL = 0.45;

/**
 * What a page is assumed to take when it has no voice line at all.
 *
 * The manifest may never arrive — the game plays on mute and shows the words
 * anyway — and a page that could never become turnable would be a book she
 * cannot get out of, which is the one thing this game may not build.
 */
const MUTE_SECONDS = 2.2;

/** One friendly colour per page, so four placeholders are four pictures. */
const PLACEHOLDER_TINTS = [0xf6a5c0, 0x8fd3f4, 0xa8e86b, 0xffd166];

/** A page's box, in coordinates measured from the middle of the spread. */
interface PageBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class BookReader {
  private readonly root: Phaser.GameObjects.Container;
  private readonly veil: Phaser.GameObjects.Rectangle;
  /** The book itself, so opening can grow it about its own middle. */
  private readonly body: Phaser.GameObjects.Container;
  private readonly ribbon: WordRibbon;
  private readonly dot: Phaser.GameObjects.Container;
  private readonly sparkles: Phaser.GameObjects.Particles.ParticleEmitter;

  /** The left page's picture, or the card standing in for one. Rebuilt per page. */
  private picture: Phaser.GameObjects.GameObject | null = null;

  private spec: Book | null = null;
  private at = 0;

  private playback: VoicePlayback | null = null;
  /** Seconds since the read started, kept by hand so a mute page still finishes. */
  private clock = 0;
  private length = 0;
  private line: string | null = null;
  private isReading = false;
  private canTurn = false;

  /** How many pages have been turned, ever. Something a test can wait on. */
  private turned = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bank: VoiceBank,
  ) {
    registerBookArt(scene);

    this.veil = scene.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      VEIL,
      VEIL_ALPHA,
    );

    // The pack's own open book where the art loaded, and a drawn one where it
    // did not — the reader is the one screen that has to work with no pack at
    // all, because it is the screen the whole game is for.
    const spread = scene.textures.exists(BOOK_SHEET)
      ? scene.add.image(0, 0, BOOK_SHEET, BOOK_SPREAD.frame).setScale(SPREAD_SCALE)
      : this.drawFallbackSpread();

    this.ribbon = new WordRibbon(scene, RIBBON);
    const right = pageBox(1);
    this.ribbon.setPosition(right.x + right.w / 2, right.y + right.h / 2);

    // The promise this game always makes: a green dot, never a letter. It comes
    // up only once the page has finished reading itself, which is the only
    // moment green does anything at all in here.
    this.dot = makeButtonDot(scene, right.x + right.w - 44, right.y + right.h - 34, {
      radius: 20,
      pulse: true,
    }).setVisible(false);

    this.sparkles = scene.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 300, max: 720 },
      blendMode: 'ADD',
      tint: [0xfff3b0, 0xffd166, 0xffffff],
      emitting: false,
    });

    this.body = scene.add.container(CENTRE.x, CENTRE.y, [
      spread,
      this.ribbon,
      this.dot,
      this.sparkles,
    ]);

    this.root = scene.add
      .container(0, 0, [this.veil, this.body])
      .setScrollFactor(0)
      .setDepth(DEPTH.book)
      .setVisible(false);
  }

  // --- what the scene and the hooks read ------------------------------------

  get isOpen(): boolean {
    return this.spec !== null;
  }

  /** Which book is open, or null. */
  get bookId(): string | null {
    return this.spec?.id ?? null;
  }

  /** Which page, counting from zero. */
  get page(): number {
    return this.at;
  }

  get pages(): number {
    return this.spec?.pages.length ?? 0;
  }

  /** Whether this is the last page, so green closes rather than turns. */
  get onLastPage(): boolean {
    return this.spec !== null && this.at === this.spec.pages.length - 1;
  }

  /** The sentence is still being read. Green does nothing while this is true. */
  get reading(): boolean {
    return this.isReading;
  }

  /** The read has finished. Green turns the page, and the dot says so. */
  get turnable(): boolean {
    return this.canTurn;
  }

  get turns(): number {
    return this.turned;
  }

  /**
   * The three the voice hooks want, named as the speech balloon names them.
   *
   * `lineId` is what is being spoken *now* rather than what the page says, and
   * goes null the moment the read finishes — same as the balloon's. It is what
   * "is anybody talking" is asked of, and a page that stayed on the answer would
   * make a finished page indistinguishable from one still reading itself. What
   * the page says is `current.line`, which never goes anywhere.
   */
  get lineId(): string | null {
    return this.isReading ? this.line : null;
  }

  get spokenWords(): string[] {
    return this.ribbon.words;
  }

  get highlightedIndex(): number {
    return this.ribbon.highlighted;
  }

  /** The page she is on, or null when the book is shut. */
  get current(): BookPage | null {
    return this.spec?.pages[this.at] ?? null;
  }

  // --- opening and closing --------------------------------------------------

  /**
   * Open it at `page` and start reading. Anything already open is replaced.
   *
   * `page` is clamped rather than trusted: the quest works out where she was
   * from its own progress list, and a book that opened past its last page would
   * be a book with nothing in it.
   */
  open(spec: Book, page: number): void {
    this.spec = spec;
    this.root.setVisible(true);
    this.veil.setAlpha(0);
    this.scene.tweens.killTweensOf(this.veil);
    this.scene.tweens.add({ targets: this.veil, alpha: VEIL_ALPHA, duration: 220 });

    this.body.setScale(0.82);
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.add({
      targets: this.body,
      scale: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });

    this.showPage(Phaser.Math.Clamp(page, 0, spec.pages.length - 1));
    this.read();
  }

  /** Shut it. Nothing is lost and nothing is said about it — see `RoomScene`. */
  close(): void {
    this.stopReading();
    this.spec = null;
    this.line = null;
    this.canTurn = false;
    this.dot.setVisible(false);
    this.ribbon.clear();
    this.clearPicture();
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.veil);
    this.root.setVisible(false);
  }

  // --- a page ---------------------------------------------------------------

  /** Put a page on screen. Silent: `read` is what starts it speaking. */
  showPage(index: number): void {
    const spec = this.spec;
    if (!spec) return;
    this.at = index;
    this.canTurn = false;
    this.dot.setVisible(false);

    const page = spec.pages[index]!;
    this.drawPicture(index, page);

    // The words come off the manifest where there is one, so the timings and the
    // tokens are the same object — and off the authored text where there is not,
    // so a mute game still has a story in it.
    const voiced = this.bank.get(page.line);
    this.ribbon.layout(voiced ? voiced.words : untimed(page.text));
    this.length = voiced?.duration ?? MUTE_SECONDS;
  }

  /**
   * Read the page out loud, from the top. The yellow button's, and the last
   * thing `open` and every page turn do.
   */
  read(): void {
    const page = this.current;
    if (!page) return;

    this.stopReading();
    this.line = page.line;
    this.clock = 0;
    this.isReading = true;
    this.canTurn = false;
    this.dot.setVisible(false);
    this.ribbon.highlight(0);
    this.playback = this.bank.play(page.line);
  }

  /**
   * The flourish, and how long it runs.
   *
   * The right-hand page swings over onto the left: a paper-coloured leaf hinged
   * at the spine, scaled to nothing and back out the other side, which is what a
   * page actually does. The caller swaps the page over at `flipHalf`, where
   * there is nothing of the old one left on screen to swap it under.
   */
  flip(): number {
    const right = pageBox(1);
    const leaf = this.scene.add
      .rectangle(0, right.y + right.h / 2, right.w, right.h, PAPER, 1)
      .setOrigin(0, 0.5);
    // Over the spread it is peeling off, and under the words and the dot.
    this.body.addAt(leaf, this.body.getIndex(this.ribbon));

    this.scene.tweens.add({
      targets: leaf,
      scaleX: { from: 1, to: 0 },
      duration: FLIP_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        leaf.setOrigin(1, 0.5);
        this.scene.tweens.add({
          targets: leaf,
          scaleX: { from: 0, to: 1 },
          duration: FLIP_MS,
          ease: 'Sine.easeOut',
          onComplete: () => leaf.destroy(),
        });
      },
    });

    this.sparkles.explode(18, 0, 0);
    this.turned += 1;
    return FLIP_MS * 2;
  }

  /** Halfway through the flip, which is when the page underneath changes. */
  get flipHalf(): number {
    return FLIP_MS;
  }

  // --- the clock ------------------------------------------------------------

  /**
   * Once a frame, from the scene. Runs the highlight and decides when the page
   * has finished reading itself.
   *
   * The clock is kept by hand *and* read off the audio, and the audio wins when
   * there is any: playback is the truth about which word is being said, and the
   * hand-wound one is what stops a page with no clip ever becoming a page she
   * cannot turn.
   */
  tick(delta: number): void {
    if (!this.spec || !this.isReading) return;
    this.clock += delta / 1000;

    const at = this.playback ? this.playback.time : this.clock;
    this.ribbon.highlight(at);

    if (at <= this.length + TURNABLE_TAIL) return;
    this.isReading = false;
    this.canTurn = true;
    this.dot.setVisible(true);
  }

  destroy(): void {
    this.stopReading();
    this.root.destroy();
  }

  // --- drawing --------------------------------------------------------------

  private stopReading(): void {
    this.playback?.stop();
    this.playback = null;
    this.isReading = false;
  }

  /** A book drawn by hand, for the day the pack is not on this machine. */
  private drawFallbackSpread(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(0x7a4a22, 1);
    g.fillRoundedRect(-SPREAD.w / 2, -SPREAD.h / 2, SPREAD.w, SPREAD.h, 24);
    for (const side of [0, 1] as const) {
      const box = pageBox(side);
      g.fillStyle(PAPER, 1);
      g.fillRoundedRect(box.x - 12, box.y - 12, box.w + 24, box.h + 24, 12);
    }
    return g;
  }

  private clearPicture(): void {
    this.picture?.destroy();
    this.picture = null;
  }

  /**
   * The left-hand page.
   *
   * The real picture if it arrived, and a placeholder card if it did not — a
   * pastel shape on paper, with one dot along the bottom per page so which page
   * she is on is *countable*. Deliberately not a numeral: she cannot read one,
   * and a number on screen would be text with no voice line, which CLAUDE.md
   * says is a bug. Dots are a picture of how many.
   */
  private drawPicture(index: number, page: BookPage): void {
    this.clearPicture();
    const box = pageBox(0);
    const middle = { x: box.x + box.w / 2, y: box.y + box.h / 2 };

    if (this.scene.textures.exists(page.image)) {
      const art = this.scene.add.image(middle.x, middle.y, page.image);
      art.setScale(Math.min(box.w / art.width, box.h / art.height));
      this.body.addAt(art, 1);
      this.picture = art;
      return;
    }

    const tint = PLACEHOLDER_TINTS[index % PLACEHOLDER_TINTS.length]!;
    const card = this.scene.add.graphics();
    card.fillStyle(0xfff3e0, 1);
    card.fillRoundedRect(box.x, box.y, box.w, box.h, 18);
    card.fillStyle(tint, 1);
    card.fillCircle(middle.x, middle.y - 24, Math.min(box.w, box.h) * 0.3);
    // ...and the page number, as things to count rather than a figure to read.
    for (let i = 0; i <= index; i++) {
      card.fillCircle(middle.x - index * 17 + i * 34, box.y + box.h - 44, 11);
    }
    this.body.addAt(card, 1);
    this.picture = card;
  }
}

/**
 * One page's rectangle, measured from the middle of the spread.
 *
 * `side` is 0 for the left page and 1 for the right, and both come off the art's
 * own dimensions rather than a guess: the spread has a cover round it and a fold
 * down the middle, and words laid over either would be words on the binding.
 */
function pageBox(side: 0 | 1): PageBox {
  const half = BOOK_SPREAD.w / 2;
  const w = (half - PAGE.inset - PAGE.spine) * SPREAD_SCALE;
  const x =
    side === 0 ? -SPREAD.w / 2 + PAGE.inset * SPREAD_SCALE : PAGE.spine * SPREAD_SCALE;
  return {
    x,
    y: -SPREAD.h / 2 + PAGE.top * SPREAD_SCALE,
    w,
    h: (BOOK_SPREAD.h - PAGE.top - PAGE.bottom) * SPREAD_SCALE,
  };
}
