/**
 * The front door, and the game's only entry point.
 *
 * It exists because the browser makes two promises it will not keep until the
 * player touches something: a gamepad is invisible to `navigator.getGamepads()`
 * until a button on it is pressed, and an AudioContext stays suspended until a
 * real gesture. Both are solved by the same press, so the game asks for exactly
 * one — and makes it worth pressing.
 *
 * The instruction is the green dot, not the sentence under it. Seraphina is
 * four; she matches the dot on screen to the green button under her thumb.
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { playSparkleChime } from '../audio/beep';
import { unlockAudio } from '../audio/context';
import { makeButtonDot, makeGlow } from '../ui/ButtonDot';
import { SpeechBubble } from '../ui/SpeechBubble';
import { VoiceBank } from '../voice/VoiceBank';
import { loadMap, type MapData } from '../world/mapData';
import { STARTING_ZONE } from '../world/zones';
import { FAST_BOOT, hooks, syncAudioHook } from '../testHooks';

/** The line Seraphina says the moment the game wakes up. */
const GREETING = 'seraphina_hello';

/**
 * Keys that count as the press. Deliberately a list rather than "any key": F11
 * is how this game goes fullscreen, and starting the game because someone
 * reached for fullscreen would be a rotten first impression.
 */
const START_KEYS = [
  'Enter',
  'Space',
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'W',
  'A',
  'S',
  'D',
  // Both keyboard greens: Z, which every test presses, and K, which is where
  // green sits in the play diamond. See RoomScene.setupInput.
  'Z',
  'K',
] as const;

/** How long to wait for voice before starting the game anyway. */
const VOICE_PATIENCE = 2000;

/** Gap between the greeting ending and the room arriving. */
const BEAT_AFTER_GREETING = 380;

/** The colour everything fades through on the way into the room. */
const FLASH = { r: 255, g: 246, b: 255 };

export class TitleScene extends Phaser.Scene {
  private dot!: Phaser.GameObjects.Container;
  private callToAction!: Phaser.GameObjects.Text;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bubble!: SpeechBubble;

  private readonly voice = new VoiceBank();

  /**
   * The first zone's map, fetched while she is still looking at the green dot.
   * The room scene cannot queue its textures until it knows which ones the map
   * asks for, so somebody has to have the map before the scene starts — and the
   * title screen is a couple of free seconds nobody is waiting on.
   */
  private map?: Promise<MapData>;

  /** One-way latches: the door opens once, and the game leaves once. */
  private pressed = false;
  private leaving = false;

  constructor() {
    super('TitleScene');
  }

  preload(): void {
    this.makeSparkTexture();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1b1030');
    this.drawBackdrop();
    this.drawTitle();

    this.dot = makeButtonDot(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.63, {
      radius: 46,
      pulse: true,
    });
    this.dot.setDepth(20);

    this.callToAction = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.63 + 132, 'Press the green button!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#d9c7ff',
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.sparkles = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 420 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 420, max: 1100 },
      gravityY: 260,
      blendMode: 'ADD',
      tint: [0x9dff9d, 0x44d95a, 0xfff3b0, 0xf7c0ff],
      emitting: false,
    });
    this.sparkles.setDepth(30);

    this.bubble = new SpeechBubble(this, this.dot.x, this.dot.y, this.voice);

    this.setupInput();

    // Start fetching voice now so the greeting is ready the instant she presses.
    void this.voice.load().then(() => {
      hooks.voice.loaded = this.voice.loaded;
      hooks.voice.ids = this.voice.ids;
    });
    this.map = loadMap(STARTING_ZONE);

    hooks.scene = 'title';
    hooks.ready = false;
    // Returns nothing on purpose — see the same hook in RoomScene.
    hooks.pause = () => {
      this.scene.pause();
    };
    syncAudioHook();
  }

  override update(): void {
    this.pollPad();
    this.bubble.tick();

    syncAudioHook();
    hooks.voice.lineId = this.bubble.lineId;
    hooks.voice.words = this.bubble.spokenWords;
    hooks.voice.highlighted = this.bubble.highlightedIndex;
  }

  // --- waiting for the press ----------------------------------------------

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      for (const key of START_KEYS) {
        keyboard.addKey(key).on('down', () => this.press());
      }
    }

    // A pad that was already plugged in only becomes visible once a button on
    // it is pressed — and that press is usually this one. Check it straight
    // away rather than making her press A twice.
    this.input.gamepad?.on('connected', () => this.pollPad());
  }

  /**
   * No edge detection here, unlike the room: the title screen has nothing to
   * mistrigger, so A being *down* at all is the press. That is what catches the
   * button that woke the pad up in the first place.
   */
  private pollPad(): void {
    if (this.pressed) return;
    const pad = this.input.gamepad?.getPad(0);
    if (!pad) return;
    if (pad.A || pad.buttons[0]?.pressed) this.press();
  }

  // --- the reward ----------------------------------------------------------

  private press(): void {
    if (this.pressed) return;
    this.pressed = true;

    // The one thing this whole scene exists to do.
    unlockAudio();
    syncAudioHook();

    this.celebrate();

    // Speak as soon as there is something to speak with — but never let a slow
    // fetch be the reason a four-year-old is stuck looking at a title screen.
    const patience = new Promise<void>((resolve) => {
      this.time.delayedCall(VOICE_PATIENCE, resolve);
    });
    void Promise.race([this.voice.load(), patience]).then(() => this.greetAndLeave());
  }

  private celebrate(): void {
    this.sparkles.explode(70, this.dot.x, this.dot.y);
    playSparkleChime();
    this.cameras.main.flash(180, FLASH.r, FLASH.g, FLASH.b);
    this.cameras.main.shake(160, 0.005);

    this.tweens.killTweensOf(this.dot.list);
    this.tweens.add({
      targets: this.dot,
      scale: { from: 1, to: 1.45 },
      alpha: { from: 1, to: 0 },
      duration: 420,
      ease: 'Back.easeIn',
    });
    this.tweens.add({
      targets: this.callToAction,
      alpha: 0,
      y: this.callToAction.y + 16,
      duration: 260,
    });
  }

  private greetAndLeave(): void {
    if (this.leaving || !this.scene.isActive()) return;
    this.leaving = true;

    // Under ?fastBoot the press still happens — it is what unlocks audio and
    // wakes the pad — but the greeting is skipped, which is the two and a half
    // seconds every room test was paying to hear the same sentence again.
    if (FAST_BOOT) {
      this.toRoom();
      return;
    }

    this.bubble.say(GREETING, { id: 'seraphina', x: this.dot.x, y: this.dot.y + 20 });

    // Leave when she stops talking. With no manifest there is nothing to wait
    // for, so the door opens on the flourish alone.
    const line = this.voice.get(GREETING);
    const wait = line ? line.duration * 1000 + BEAT_AFTER_GREETING : 620;
    this.time.delayedCall(wait, () => this.toRoom());
  }

  private toRoom(): void {
    this.cameras.main.fadeOut(300, FLASH.r, FLASH.g, FLASH.b);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // The map has had the whole title screen to arrive. If it somehow has
      // not, the room scene fetches it itself and restarts — a slower way in,
      // never a dead end.
      void (this.map ?? Promise.resolve(undefined)).then((map) => {
        this.scene.start('RoomScene', { voice: this.voice, map });
      });
    });
  }

  // --- scenery -------------------------------------------------------------

  /** Same tiny soft dot the room uses; whichever scene boots first bakes it. */
  private makeSparkTexture(): void {
    if (this.textures.exists('spark')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 5);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(8, 8, 8);
    g.generateTexture('spark', 16, 16);
    g.destroy();
  }

  /** Slow drifting motes, so the screen is alive before anything is pressed. */
  private drawBackdrop(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1b1030)
      .setDepth(-10);

    // A pool of warm light for the button to sit in.
    makeGlow(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.63, 590, 0x8a5fd0, 0.85).setDepth(-9);

    this.add
      .particles(0, 0, 'spark', {
        x: { min: 0, max: GAME_WIDTH },
        y: GAME_HEIGHT + 20,
        speedY: { min: -70, max: -26 },
        speedX: { min: -18, max: 18 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: { min: 3400, max: 6000 },
        frequency: 180,
        blendMode: 'ADD',
        tint: [0xf7c0ff, 0xffe6fb, 0x9be7ff],
      })
      .setDepth(-8);
  }

  private drawTitle(): void {
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.26, "Seraphina's Secret", {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '86px',
        fontStyle: 'bold',
        color: '#fff3b0',
      })
      .setOrigin(0.5)
      .setDepth(20);
    title.setStroke('#7b3fa0', 12);
    title.setShadow(0, 8, '#2a1040', 14, true, true);

    // A slow rock, so the words look like they are humming to themselves.
    this.tweens.add({
      targets: title,
      angle: { from: -1.4, to: 1.4 },
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
