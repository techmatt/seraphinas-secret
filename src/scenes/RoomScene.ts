import Phaser from 'phaser';
import { playSparkleChime } from '../audio/beep';
import { unlockAudio } from '../audio/context';
import { makeButtonDot } from '../ui/ButtonDot';
import { makeStickHint, type StickHint } from '../ui/StickHint';
import { SpeechBubble } from '../ui/SpeechBubble';
import { VoiceBank } from '../voice/VoiceBank';
import { Doorway } from '../world/Doorway';
import { DEPTH, makeProp, paintRoom } from '../world/scenery';
import {
  BOUNDS,
  STARTING_ROOM,
  getRoom,
  spawnOf,
  type Facing,
  type FlourishId,
  type PropDef,
  type RoomDef,
  type RoomId,
} from '../world/rooms';
import { playArrivalFlourish, playExitFlourish } from '../world/transition';
import { hooks, syncAudioHook } from '../testHooks';

/** Walk speed in pixels per second. Deliberately unhurried. */
const WALK_SPEED = 260;

/** Analog sticks rest slightly off-centre; ignore anything inside this. */
const STICK_DEADZONE = 0.25;

/** How close the character must be to a prop before it will sparkle. */
const INTERACT_RADIUS = 120;

/** How long the first room takes to arrive out of the title screen's flash. */
const FADE_IN = 260;

/** The colour the title screen flashes on its way out. */
const TITLE_FLASH = [255, 246, 255] as const;

/**
 * Whether she has been shown how to walk yet, for this page load. It lives
 * outside the scene because the scene is rebuilt on every doorway, and being
 * taught to walk once per room would be nagging.
 */
let walkHintDone = false;

/** What the title screen — or the room she just left — hands over. */
export interface RoomSceneData {
  /** The bank the title screen already loaded, so nothing fetches twice. */
  voice?: VoiceBank;
  /** Which room to build. Defaults to the starting room. */
  room?: RoomId;
  /** Which of that room's spawn points to stand on. */
  spawn?: string;
  /**
   * The flourish the doorway she just walked through was playing, so the room
   * she lands in finishes the gesture the room she left started. Absent means
   * she arrived off the title screen, which has a flash of its own.
   */
  flourish?: FlourishId;
}

interface Prop {
  def: PropDef;
  obj: Phaser.GameObjects.Container;
}

/**
 * Every room in the game, one at a time.
 *
 * The scene knows how to walk, poke and leave; it knows nothing about which
 * rooms exist or what is in them. That lives in world/rooms.ts, and a new room
 * is an entry in that table — never a subclass, never a second scene. Walking
 * through a doorway restarts this scene with the room on the far side, which is
 * how the whole graph runs on one set of code.
 */
export class RoomScene extends Phaser.Scene {
  private roomDef!: RoomDef;
  private arrivedVia?: string;
  private arrivalFlourish?: FlourishId;

  private player!: Phaser.GameObjects.Container;
  private eyes: Phaser.GameObjects.Arc[] = [];

  private props: Prop[] = [];
  private doorways: Doorway[] = [];

  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prompt!: Phaser.GameObjects.Container;
  private stickHint?: StickHint;
  private bubble!: SpeechBubble;
  private voice!: VoiceBank;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private interactKey?: Phaser.Input.Keyboard.Key;

  /** Previous frame's A-button state, so a held button fires once. */
  private padInteractWasDown = false;

  /** One-way latch: the room is left once. */
  private leaving = false;

  /**
   * Doorways ignore her until she has stood clear of every one of them. She
   * arrives next to the door she came through, and a door that fired on arrival
   * would bounce her straight back — which is as close to a fail state as this
   * game is allowed to get.
   */
  private doorwaysArmed = false;

  constructor() {
    super('RoomScene');
  }

  /**
   * The title screen loads the voice bank while the player is still looking at
   * the green dot, and hands it over. Making one here instead keeps the room
   * runnable on its own, which is worth more than the duplicated fetch costs.
   */
  init(data: RoomSceneData): void {
    this.voice = data.voice ?? new VoiceBank();
    this.roomDef = getRoom(data.room ?? STARTING_ROOM);
    this.arrivedVia = data.spawn;
    this.arrivalFlourish = data.flourish;

    // Restarting the scene reuses the instance, so anything remembered across
    // create() has to be put back by hand.
    this.props = [];
    this.doorways = [];
    this.leaving = false;
    this.doorwaysArmed = false;
    this.padInteractWasDown = false;
    this.stickHint = undefined;
  }

  preload(): void {
    this.makeSparkTexture();
  }

  create(): void {
    const spawn = spawnOf(this.roomDef, this.arrivedVia);

    paintRoom(this, this.roomDef);

    for (const def of this.roomDef.doorways) this.doorways.push(new Doorway(this, def));
    for (const def of this.roomDef.props) this.props.push({ def, obj: makeProp(this, def) });

    this.player = this.makePlayer(spawn.x, spawn.y);
    this.face(spawn.facing);

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
    this.sparkles.setDepth(DEPTH.sparkles);

    this.setupInput();
    this.drawHud();
    this.arrive();

    // The bubble belongs to whoever is talking, which for now is always
    // Seraphina, so it anchors to the player.
    this.bubble = new SpeechBubble(this, this.player.x, this.player.y, this.voice);
    this.setupVoiceHooks();
    // Fire and forget: the room is playable while the voice is still loading,
    // and stays playable if it never arrives.
    void this.voice.load().then(() => {
      hooks.voice.loaded = this.voice.loaded;
      hooks.voice.ids = this.voice.ids;
    });

    this.syncWorldHooks();
    hooks.interactRadius = INTERACT_RADIUS;
    hooks.pause = () => this.scene.pause();
    hooks.scene = 'room';
    hooks.transitioning = false;
    hooks.ready = true;
  }

  override update(_time: number, delta: number): void {
    const seconds = delta / 1000;
    const pad = this.input.gamepad?.getPad(0);

    if (!this.leaving) {
      this.movePlayer(seconds, pad);
      this.checkDoorways();
      this.handleInteract(pad);
    }
    this.bubble.tick();

    syncAudioHook();
    hooks.player.x = this.player.x;
    hooks.player.y = this.player.y;
    hooks.aliveParticles = this.sparkles.getAliveParticleCount();
    hooks.peakParticles = Math.max(hooks.peakParticles, hooks.aliveParticles);
    hooks.voice.lineId = this.bubble.lineId;
    hooks.voice.words = this.bubble.spokenWords;
    hooks.voice.highlighted = this.bubble.highlightedIndex;
  }

  /**
   * The bubble is driven directly rather than through gameplay, because a word
   * can be spoken for under 150 ms — far less than a test's round trip.
   */
  private setupVoiceHooks(): void {
    hooks.voice.say = (id) => {
      unlockAudio();
      this.bubble.say(id, this.player);
      this.syncVoiceHooks();
    };
    hooks.voice.scrub = (seconds) => {
      this.bubble.scrub(seconds);
      this.syncVoiceHooks();
    };
    hooks.voice.timings = (id) => this.voice.get(id)?.words ?? [];
  }

  /** update() does this every frame, but a paused scene has no frames. */
  private syncVoiceHooks(): void {
    hooks.voice.lineId = this.bubble.lineId;
    hooks.voice.words = this.bubble.spokenWords;
    hooks.voice.highlighted = this.bubble.highlightedIndex;
  }

  /** What is in this room, for a test that wants to walk somewhere. */
  private syncWorldHooks(): void {
    hooks.room = this.roomDef.id;
    hooks.player.x = this.player.x;
    hooks.player.y = this.player.y;
    hooks.interactables = this.props.map(({ def, obj }) => ({
      id: def.id,
      x: obj.x,
      y: obj.y,
    }));
    hooks.doorways = this.doorways.map((d) => ({
      id: d.def.id,
      x: d.x,
      y: d.y,
      to: d.def.to,
    }));
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

    // The title screen already unlocked audio; this is only insurance for a
    // context the browser suspended again while the tab was in the background.
    keyboard.on('keydown', unlockAudio);
    this.input.on('pointerdown', unlockAudio);
    this.input.gamepad?.on('connected', unlockAudio);
  }

  /** Left stick if it is pushed, arrow keys / WASD otherwise. */
  private readMoveVector(pad?: Phaser.Input.Gamepad.Gamepad): Phaser.Math.Vector2 {
    const move = new Phaser.Math.Vector2(0, 0);

    if (pad) {
      const stick = pad.leftStick;
      if (stick.length() > STICK_DEADZONE) move.set(stick.x, stick.y);
    }

    if (move.lengthSq() === 0 && this.cursors && this.wasd) {
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
      BOUNDS.left,
      BOUNDS.right,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + move.y * WALK_SPEED * seconds,
      BOUNDS.top,
      BOUNDS.bottom,
    );

    if (Math.abs(move.x) > 0.2) this.face(move.x > 0 ? 1 : -1);

    // She has worked out the stick. The picture has done its job.
    if (!walkHintDone) {
      walkHintDone = true;
      this.stickHint?.dismiss();
    }
  }

  private handleInteract(pad?: Phaser.Input.Gamepad.Gamepad): void {
    const padDown = pad?.A ?? false;
    const padPressed = padDown && !this.padInteractWasDown;
    this.padInteractWasDown = padDown;

    const keyPressed = this.interactKey
      ? Phaser.Input.Keyboard.JustDown(this.interactKey)
      : false;

    const near = this.nearestProp();
    this.prompt.setVisible(near !== null);
    if (near) this.prompt.setPosition(near.obj.x, near.obj.y - 74);

    if ((padPressed || keyPressed) && near) this.burst(near);
  }

  /** The closest prop within arm's reach, or null. */
  private nearestProp(): Prop | null {
    let best: Prop | null = null;
    let bestDistance = INTERACT_RADIUS;

    for (const prop of this.props) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        prop.obj.x,
        prop.obj.y,
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = prop;
      }
    }

    return best;
  }

  // --- doorways ------------------------------------------------------------

  private checkDoorways(): void {
    const inside = this.doorways.find((d) => d.contains(this.player.x, this.player.y));

    if (!this.doorwaysArmed) {
      if (!inside) this.doorwaysArmed = true;
      return;
    }

    if (inside) this.leaveThrough(inside);
  }

  private leaveThrough(door: Doorway): void {
    this.leaving = true;
    hooks.transitioning = true;

    this.bubble.stop();
    this.prompt.setVisible(false);
    this.stickHint?.dismiss();

    playExitFlourish(
      this,
      { x: door.x, y: door.y, kind: door.def.flourish, sparkles: this.sparkles },
      () => {
        this.scene.start('RoomScene', {
          voice: this.voice,
          room: door.def.to,
          spawn: door.def.toSpawn,
          flourish: door.def.flourish,
        } satisfies RoomSceneData);
      },
    );
  }

  /**
   * Coming in. Through a doorway it is the far half of that doorway's flourish;
   * out of the title screen it is the title's own flash, unchanged.
   */
  private arrive(): void {
    if (!this.arrivalFlourish) {
      this.cameras.main.fadeIn(FADE_IN, ...TITLE_FLASH);
      return;
    }

    playArrivalFlourish(this, {
      x: this.player.x,
      y: this.player.y,
      kind: this.arrivalFlourish,
      sparkles: this.sparkles,
    });
  }

  // --- the juice ---------------------------------------------------------

  private burst(prop: Prop): void {
    this.sparkles.explode(48, prop.obj.x, prop.obj.y);
    playSparkleChime();
    this.bubble.say(prop.def.line, this.player);
    this.cameras.main.shake(140, 0.004);

    this.tweens.add({
      targets: prop.obj,
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

  private makePlayer(x: number, y: number): Phaser.GameObjects.Container {
    const body = this.add.circle(0, 0, 26, 0xffd9a0).setStrokeStyle(4, 0xb9834f);
    const hair = this.add.circle(0, -12, 22, 0x7b4b2a);
    const eyeL = this.add.circle(-8, 2, 3.5, 0x2a1c3a);
    const eyeR = this.add.circle(8, 2, 3.5, 0x2a1c3a);

    this.eyes = [eyeL, eyeR];

    const container = this.add.container(x, y, [body, hair, eyeL, eyeR]);
    container.setDepth(DEPTH.player);
    return container;
  }

  /** Shifting the eyes is the whole of "facing", and it is enough to read. */
  private face(facing: Facing): void {
    const shift = facing * 5;
    this.eyes[0]?.setX(-8 + shift);
    this.eyes[1]?.setX(8 + shift);
  }

  private drawHud(): void {
    // The room used to caption itself "Walk: left stick or arrow keys". She
    // cannot read it, so it is a picture now — and it leaves once she walks.
    if (!walkHintDone) {
      this.stickHint = makeStickHint(this, 108, 640);
      this.stickHint.container.setDepth(DEPTH.hud);
    }

    // A green dot, never the letter "A" — see ButtonDot. The dot over a prop
    // and the dot on the title screen are the same promise: press green.
    this.prompt = makeButtonDot(this, 0, 0, { radius: 18, pulse: true })
      .setDepth(DEPTH.hud)
      .setVisible(false);
  }
}
