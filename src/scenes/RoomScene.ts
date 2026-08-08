import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { playSparkleChime, unlockAudio } from '../audio/beep';
import { hooks } from '../testHooks';

/** Walk speed in pixels per second. Deliberately unhurried. */
const WALK_SPEED = 260;

/** Analog sticks rest slightly off-centre; ignore anything inside this. */
const STICK_DEADZONE = 0.25;

/** How close the character must be to the stone before it will sparkle. */
const INTERACT_RADIUS = 120;

/** Inset of the walkable floor from the canvas edge. */
const WALL = 48;

/**
 * The one and only room, for now. A flat-colour floor, a placeholder character,
 * and a single object that sparkles when you press A. Everything here is a stand
 * in for real content — its job is to smoke-test input, particles and audio.
 */
export class RoomScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private stone!: Phaser.GameObjects.Container;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prompt!: Phaser.GameObjects.Text;
  private padStatus!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private interactKey!: Phaser.Input.Keyboard.Key;

  /** Previous frame's A-button state, so a held button fires once. */
  private padInteractWasDown = false;

  constructor() {
    super('RoomScene');
  }

  preload(): void {
    this.makeSparkTexture();
  }

  create(): void {
    this.drawRoom();
    this.stone = this.makeStone(GAME_WIDTH * 0.72, GAME_HEIGHT * 0.42);
    this.player = this.makePlayer(GAME_WIDTH * 0.3, GAME_HEIGHT * 0.6);

    this.sparkles = this.add.particles(0, 0, 'spark', {
      speed: { min: 90, max: 320 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 380, max: 900 },
      gravityY: 220,
      blendMode: 'ADD',
      tint: [0xfff3b0, 0xffd166, 0xf78ddd, 0x9be7ff],
      emitting: false,
    });
    this.sparkles.setDepth(20);

    this.setupInput();
    this.drawHud();

    hooks.player.x = this.player.x;
    hooks.player.y = this.player.y;
    hooks.stone.x = this.stone.x;
    hooks.stone.y = this.stone.y;
    hooks.interactRadius = INTERACT_RADIUS;
    hooks.pause = () => this.scene.pause();
    hooks.ready = true;
  }

  override update(_time: number, delta: number): void {
    const seconds = delta / 1000;
    const pad = this.input.gamepad?.getPad(0);

    this.movePlayer(seconds, pad);
    this.handleInteract(pad);

    hooks.player.x = this.player.x;
    hooks.player.y = this.player.y;
    hooks.aliveParticles = this.sparkles.getAliveParticleCount();
    hooks.peakParticles = Math.max(hooks.peakParticles, hooks.aliveParticles);
  }

  // --- input -------------------------------------------------------------

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);

    // An AudioContext stays suspended until the page sees a real gesture.
    keyboard.on('keydown', unlockAudio);
    this.input.on('pointerdown', unlockAudio);

    this.input.gamepad?.on('connected', () => {
      unlockAudio();
      this.padStatus?.setText('controller: connected');
    });
    this.input.gamepad?.on('disconnected', () => {
      this.padStatus?.setText('controller: press a button to wake it');
    });
  }

  /** Left stick if it is pushed, arrow keys / WASD otherwise. */
  private readMoveVector(pad?: Phaser.Input.Gamepad.Gamepad): Phaser.Math.Vector2 {
    const move = new Phaser.Math.Vector2(0, 0);

    if (pad) {
      const stick = pad.leftStick;
      if (stick.length() > STICK_DEADZONE) move.set(stick.x, stick.y);
    }

    if (move.lengthSq() === 0 && this.cursors) {
      if (this.cursors.left.isDown || this.wasd.left.isDown) move.x -= 1;
      if (this.cursors.right.isDown || this.wasd.right.isDown) move.x += 1;
      if (this.cursors.up.isDown || this.wasd.up.isDown) move.y -= 1;
      if (this.cursors.down.isDown || this.wasd.down.isDown) move.y += 1;
    }

    // Normalising keeps diagonals from being ~40% faster; the stick keeps its
    // magnitude so a gentle push is a gentle walk.
    if (move.length() > 1) move.normalize();
    return move;
  }

  private movePlayer(seconds: number, pad?: Phaser.Input.Gamepad.Gamepad): void {
    const move = this.readMoveVector(pad);
    if (move.lengthSq() === 0) return;

    this.player.x = Phaser.Math.Clamp(
      this.player.x + move.x * WALK_SPEED * seconds,
      WALL + 28,
      GAME_WIDTH - WALL - 28,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + move.y * WALK_SPEED * seconds,
      WALL + 28,
      GAME_HEIGHT - WALL - 28,
    );
  }

  private handleInteract(pad?: Phaser.Input.Gamepad.Gamepad): void {
    const padDown = pad?.A ?? false;
    const padPressed = padDown && !this.padInteractWasDown;
    this.padInteractWasDown = padDown;

    const keyPressed = this.interactKey
      ? Phaser.Input.Keyboard.JustDown(this.interactKey)
      : false;

    const inRange = this.distanceToStone() <= INTERACT_RADIUS;
    this.prompt.setVisible(inRange);

    if ((padPressed || keyPressed) && inRange) this.burst();
  }

  private distanceToStone(): number {
    return Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.stone.x,
      this.stone.y,
    );
  }

  // --- the juice ---------------------------------------------------------

  private burst(): void {
    this.sparkles.explode(48, this.stone.x, this.stone.y);
    playSparkleChime();
    this.cameras.main.shake(140, 0.004);

    this.tweens.add({
      targets: this.stone,
      scale: { from: 1.35, to: 1 },
      duration: 340,
      ease: 'Back.easeOut',
    });

    hooks.sparkles += 1;
  }

  // --- scenery -----------------------------------------------------------

  /** Particles need a texture key, so bake a tiny soft dot at boot. */
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

  private drawRoom(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2a1c3a)
      .setDepth(-10);

    this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH - WALL * 2,
        GAME_HEIGHT - WALL * 2,
        0x4a3b63,
      )
      .setStrokeStyle(6, 0x6d5a8c)
      .setDepth(-9);
  }

  private makePlayer(x: number, y: number): Phaser.GameObjects.Container {
    const body = this.add.circle(0, 0, 26, 0xffd9a0).setStrokeStyle(4, 0xb9834f);
    const hair = this.add.circle(0, -12, 22, 0x7b4b2a);
    const eyeL = this.add.circle(-8, 2, 3.5, 0x2a1c3a);
    const eyeR = this.add.circle(8, 2, 3.5, 0x2a1c3a);

    const container = this.add.container(x, y, [body, hair, eyeL, eyeR]);
    container.setDepth(10);
    return container;
  }

  private makeStone(x: number, y: number): Phaser.GameObjects.Container {
    const glow = this.add.circle(0, 0, 44, 0xf7c0ff, 0.18);
    const gem = this.add.star(0, 0, 5, 14, 30, 0xf78ddd).setStrokeStyle(4, 0xffe6fb);

    const container = this.add.container(x, y, [glow, gem]);
    container.setDepth(5);

    // A slow breath so it reads as "come poke me" without demanding attention.
    this.tweens.add({
      targets: glow,
      scale: { from: 0.9, to: 1.15 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return container;
  }

  private drawHud(): void {
    this.add
      .text(WALL + 12, WALL + 10, 'Walk: left stick or arrow keys', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#e9dcff',
      })
      .setDepth(30);

    this.padStatus = this.add
      .text(WALL + 12, WALL + 38, 'controller: press a button to wake it', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#a894c9',
      })
      .setDepth(30);

    this.prompt = this.add
      .text(this.stone.x, this.stone.y - 70, 'A  /  Z', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: '#ffe6fb',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);
  }
}
