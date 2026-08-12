import Phaser from 'phaser';
import {
  playChopThunk,
  playSparkleChime,
  playStumpPop,
  playThudChime,
  playTreeCrash,
} from '../audio/beep';
import { unlockAudio } from '../audio/context';
import { DEPTH, GAME_HEIGHT, TILE_SIZE, WORLD_SCALE } from '../config';
import { makeButtonDot } from '../ui/ButtonDot';
import { makeStickHint, type StickHint } from '../ui/StickHint';
import { makeToolRow, preloadToolIcons, type ToolRow } from '../ui/ToolRow';
import { SpeechBubble } from '../ui/SpeechBubble';
import { VoiceBank } from '../voice/VoiceBank';
import {
  Character,
  characterArtLoaded,
  preloadCharacter,
  registerCharacterAnims,
} from '../world/Character';
import { SERAPHINA } from '../world/characterSheets';
import { DebugHitboxes } from '../world/DebugHitboxes';
import { Doorway } from '../world/Doorway';
import { loadMap, spawnOf, type FlourishId, type MapData } from '../world/mapData';
import { makeProp, nudgeProp, type Prop } from '../world/scenery';
import { TileWorld } from '../world/TileWorld';
import { toolBelt, type ToolId } from '../world/ToolBelt';
import { makeLeafEmitter, Tree } from '../world/Tree';
import { STARTING_ZONE, type ZoneId } from '../world/zones';
import { playArrivalFlourish, playExitFlourish } from '../world/transition';
import { hooks, syncAudioHook } from '../testHooks';

/**
 * Walk speed in pixels per second — a bit under five tiles a second. Faster
 * than the single-screen rooms wanted, because the exterior is sixty tiles
 * across and a walk to the wood should be an outing, not a commute.
 */
const WALK_SPEED = 300;

/** Analog sticks rest slightly off-centre; ignore anything inside this. */
const STICK_DEADZONE = 0.25;

/** How close she must be to a prop before it will sparkle. Two tiles-ish. */
const INTERACT_RADIUS = 140;

/** How long the first zone takes to arrive out of the title screen's flash. */
const FADE_IN = 260;

/** The colour the title screen flashes on its way out. */
const TITLE_FLASH = [255, 246, 255] as const;

/** How hard the camera chases her. Low enough to lag, high enough to keep up. */
const CAMERA_LERP = 0.12;

/** Longest distance a single collision step may cover. A quarter of a tile. */
const MAX_STEP = TILE_SIZE / 4;

/**
 * Whether she has been shown how to walk yet, for this page load. It lives
 * outside the scene because the scene is rebuilt on every doorway, and being
 * taught to walk once per zone would be nagging.
 */
let walkHintDone = false;

/**
 * Something the green button does something to.
 *
 * A prop and a press-to-enter door are the same thing from where she is
 * standing: get near it, a green dot appears, press green, something happens.
 * They are different objects in the map data and the same object here, which is
 * what lets a front door pick up every affordance a chest already had — the
 * proximity radius, the dot, the nearest-wins rule — without any of it being
 * written twice.
 */
interface Interactable {
  id: string;
  /** Where she walks up to, in world pixels. */
  x: number;
  y: number;
  /**
   * Whether the green dot appears over it.
   *
   * The dot is a *selection*: it says "this is the one thing here the button is
   * about", which is a question a chest, a well or a front door genuinely
   * raises. A tree does not. There are two hundred of them, she walks through
   * them constantly, and swinging an axe at whichever one she is nearest is
   * what the button does out there whether or not anything was pointed at — so
   * a dot drifting from trunk to trunk as she walks would be an answer to a
   * question nobody asked, on every step of every wood.
   *
   * She still swings at the nearest one, which is why a tree is an Interactable
   * at all and not a special case somewhere else.
   */
  dot: boolean;
  press: () => void;
}

/** What the title screen — or the zone she just left — hands over. */
export interface RoomSceneData {
  /** The bank the title screen already loaded, so nothing fetches twice. */
  voice?: VoiceBank;
  /** Which zone to build. Defaults to the starting one. */
  room?: ZoneId;
  /**
   * The zone's map, already fetched. The scene cannot queue its textures until
   * it knows which ones the map wants, so whoever starts the scene fetches it
   * first. Absent is survivable — the scene fetches and restarts itself.
   */
  map?: MapData;
  /** Which of that zone's spawn points to stand on. */
  spawn?: string;
  /**
   * The flourish the doorway she just walked through was playing, so the zone
   * she lands in finishes the gesture the zone she left started. Absent means
   * she arrived off the title screen, which has a flash of its own.
   */
  flourish?: FlourishId;
}

/**
 * Every zone in the game, one at a time.
 *
 * The scene knows how to walk, poke and leave; it knows nothing about which
 * zones exist or what is in them. That lives in generated map data, and a new
 * place is a layout in `content/world/` — never a subclass, never a second
 * scene. Walking through a doorway restarts this scene with the zone on the far
 * side, which is how the whole world runs on one set of code.
 */
export class RoomScene extends Phaser.Scene {
  private zoneId!: ZoneId;
  private mapData?: MapData;
  private arrivedVia?: string;
  private arrivalFlourish?: FlourishId;

  private world!: TileWorld;
  private player!: Character;

  private props: Prop[] = [];
  private doorways: Doorway[] = [];
  private trees: Tree[] = [];
  private interactables: Interactable[] = [];

  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private leaves!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prompt!: Phaser.GameObjects.Container;
  private stickHint?: StickHint;
  private toolRow!: ToolRow;
  private bubble!: SpeechBubble;
  private voice!: VoiceBank;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private interactKey?: Phaser.Input.Keyboard.Key;
  /** The blue button, on the keyboard. Cycles the held tool. See ButtonDot. */
  private toolKey?: Phaser.Input.Keyboard.Key;

  /** Hold this and the collision grid shows. See DebugHitboxes. */
  private hitboxKey?: Phaser.Input.Keyboard.Key;
  private hitboxes!: DebugHitboxes;
  /** Forced on by a test, so a headless screenshot can hold no key at all. */
  private hitboxesPinned = false;

  /** Previous frame's A- and X-button state, so a held button fires once. */
  private padInteractWasDown = false;
  private padToolWasDown = false;

  /** One-way latch: the zone is left once. */
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
   * the green dot, and hands it over. Making one here instead keeps the zone
   * runnable on its own, which is worth more than the duplicated fetch costs.
   */
  init(data: RoomSceneData): void {
    this.voice = data.voice ?? new VoiceBank();
    this.zoneId = data.room ?? STARTING_ZONE;
    this.mapData = data.map;
    this.arrivedVia = data.spawn;
    this.arrivalFlourish = data.flourish;

    // Restarting the scene reuses the instance, so anything remembered across
    // create() has to be put back by hand.
    this.props = [];
    this.doorways = [];
    this.trees = [];
    this.interactables = [];
    this.leaving = false;
    this.doorwaysArmed = false;
    this.padInteractWasDown = false;
    this.padToolWasDown = false;
    this.stickHint = undefined;
    this.hitboxesPinned = false;
  }

  preload(): void {
    this.makeSparkTexture();
    preloadCharacter(this, SERAPHINA);
    preloadToolIcons(this);
    if (this.mapData) TileWorld.preload(this, this.mapData);
  }

  create(): void {
    // Started without a map — by a bookmark, or a test loading the scene
    // straight. Fetch it and come round again; preload runs on a restart.
    if (!this.mapData) {
      void loadMap(this.zoneId).then((map) => {
        this.scene.restart({
          voice: this.voice,
          room: this.zoneId,
          map,
          spawn: this.arrivedVia,
          flourish: this.arrivalFlourish,
        } satisfies RoomSceneData);
      });
      return;
    }

    const map = this.mapData;
    this.cameras.main.setBackgroundColor(map.backdrop);
    this.world = new TileWorld(this, map);

    // The bursts are built before anything that can throw one, because a tree
    // needs somewhere to put its leaves the first time she hits it.
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
    this.leaves = makeLeafEmitter(this);

    for (const def of map.doorways) this.doorways.push(new Doorway(this, def));
    for (const def of map.props) this.props.push(makeProp(this, this.world, def));
    for (const def of map.trees ?? []) {
      this.trees.push(
        new Tree(this, this.world, def, { leaves: this.leaves, sparkles: this.sparkles }),
      );
    }

    // Everything the green button reaches, in one list: the props, the doors
    // you press rather than walk through, and every tree in the zone.
    //
    // Trees are in here rather than beside it because "the nearest thing wins"
    // has to be one question with one answer — a wood where the dot is over the
    // toadstool and the press hits the spruce behind it would be the game
    // lying about what the button does. Only the dot is theirs to skip; see
    // Interactable.
    this.interactables = [
      ...this.props.map((prop) => ({
        id: prop.def.id,
        x: prop.x,
        y: prop.y,
        dot: true,
        press: () => this.poke(prop),
      })),
      ...this.doorways
        .filter((door) => door.def.enter === 'press')
        .map((door) => ({
          id: door.def.id,
          x: door.x,
          y: door.y,
          dot: true,
          press: () => this.leaveThrough(door),
        })),
      ...this.trees.map((tree) => ({
        id: tree.def.id,
        x: tree.x,
        y: tree.y,
        dot: false,
        press: () => this.swingAt(tree),
      })),
    ];

    const spawn = spawnOf(map, this.arrivedVia);
    const stand = this.world.nearestStanding(spawn.x * WORLD_SCALE, spawn.y * WORLD_SCALE);
    registerCharacterAnims(this, SERAPHINA);
    this.player = new Character(this, stand.x, stand.y, SERAPHINA);
    this.player.face(spawn.facing);
    // She sorts against the world by where she is standing, same as everything
    // else. update() keeps it there; this is so the first frame is right too.
    this.player.setDepth(this.player.y);

    this.setupCamera();

    // Trees come and go, so the overlay asks for theirs rather than being told
    // once. It only asks while it is on screen, which is while B is held.
    this.hitboxes = new DebugHitboxes(this, this.world, () =>
      this.trees.map((tree) => tree.footprint),
    );

    this.setupInput();
    this.drawHud();
    this.arrive();

    // The bubble belongs to whoever is talking, which for now is always
    // Seraphina, so it anchors to the player.
    this.bubble = new SpeechBubble(this, this.player.x, this.player.y, this.voice);
    this.setupVoiceHooks();
    // Fire and forget: the zone is playable while the voice is still loading,
    // and stays playable if it never arrives.
    void this.voice.load().then(() => {
      hooks.voice.loaded = this.voice.loaded;
      hooks.voice.ids = this.voice.ids;
    });

    this.syncWorldHooks();
    hooks.interactRadius = INTERACT_RADIUS;
    // Braces, not a bare expression: `scene.pause()` hands back the whole
    // ScenePlugin, and a test that calls this through `page.evaluate` would then
    // be asking Playwright to serialise the entire engine back to node — which
    // it will do, for thirteen seconds. The declared type has always been void.
    hooks.pause = () => {
      this.scene.pause();
    };
    hooks.teleport = (x, y) => {
      const spot = this.world.nearestStanding(x, y);
      this.player.setPosition(spot.x, spot.y);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      // Landing inside a doorway would fire it; make her step clear first, the
      // same as any arrival does.
      this.doorwaysArmed = false;
      this.syncPlayerHooks();
      this.syncCameraHooks();
    };
    hooks.overview = (fit) => {
      const camera = this.cameras.main;
      if (!fit) {
        camera.setZoom(1);
        this.setupCamera();
        return;
      }
      // Bounds are what stop the view showing the outside of the map, and a
      // view bigger than the map is exactly what this is for — so they go.
      camera.stopFollow();
      camera.removeBounds();
      camera.setZoom(
        Math.min(camera.width / this.world.widthPx, camera.height / this.world.heightPx),
      );
      camera.centerOn(this.world.widthPx / 2, this.world.heightPx / 2);
      this.syncCameraHooks();
    };
    hooks.debugHitboxes = (on) => {
      this.hitboxesPinned = on;
      this.updateHitboxes();
    };
    // The quest system's two verbs, ahead of the quest system. Exposed so the
    // cycling test can put a second tool on the row without a quest to grant it
    // — the belt has to work with two things in it before anything can put a
    // second thing in it, and this is the only way to prove that today.
    hooks.giveTool = (tool) => {
      const slot = toolBelt.give(tool as ToolId);
      this.toolRow.refresh();
      this.syncToolHooks();
      return slot;
    };
    hooks.takeTool = (tool) => {
      const taken = toolBelt.take(tool as ToolId);
      this.toolRow.refresh();
      this.syncToolHooks();
      return taken;
    };
    hooks.scene = 'room';
    hooks.transitioning = false;
    hooks.ready = true;
  }

  override update(_time: number, delta: number): void {
    if (!this.world) return;

    // A tab that was in the background can hand over a delta measured in
    // seconds; anything past a quarter of one is a stall, not a walk.
    const seconds = Math.min(delta, 250) / 1000;
    const pad = this.input.gamepad?.getPad(0);

    if (!this.leaving) {
      // Mid-swing she is not steering. Half a second of not being in control is
      // the price of the swing landing where she aimed it, and it is the only
      // moment in the game where the stick does nothing.
      if (!this.player.chopping) {
        this.movePlayer(seconds, pad);
        this.checkDoorways();
      }
      this.handleTools(pad);
      this.handleInteract(pad);
    }
    this.player.setDepth(this.player.y);
    this.world.revealBehind(this.player.x, this.player.y);
    this.updateHitboxes();
    this.bubble.tick();
    // Read off the dot itself rather than written where it is decided: a
    // doorway hides it without going through handleInteract at all.
    hooks.promptDot = this.prompt.visible;

    syncAudioHook();
    this.syncPlayerHooks();
    this.syncCameraHooks();
    hooks.fps = Math.round(this.game.loop.actualFps);
    // Both emitters. "Particles on screen" is one question, and a leaf shed by
    // a tree she just hit is as much of an answer as a sparkle is.
    hooks.aliveParticles =
      this.sparkles.getAliveParticleCount() + this.leaves.getAliveParticleCount();
    hooks.peakParticles = Math.max(hooks.peakParticles, hooks.aliveParticles);
    hooks.voice.lineId = this.bubble.lineId;
    hooks.voice.words = this.bubble.spokenWords;
    hooks.voice.highlighted = this.bubble.highlightedIndex;
  }

  // --- camera --------------------------------------------------------------

  /**
   * Follow her with a little lag, and never show the outside of the map. The
   * lerp is what stops the world snapping about under a thumbstick that a
   * four-year-old is holding in a slightly different direction every frame; the
   * bounds are what stop the wood turning into a black bar.
   */
  private setupCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.world.widthPx, this.world.heightPx);
    camera.setRoundPixels(true);
    camera.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
    // Without this the first frame of a zone is drawn from wherever the camera
    // happened to be, which on a doorway is the middle of the room she left.
    camera.centerOn(this.player.x, this.player.y);
  }

  // --- test hooks ----------------------------------------------------------

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

  /**
   * Where she is, which way she is turned and what she is playing. Her position
   * is the point her feet are standing on, which is the same space the map data
   * is written in. The sprite only has three directions drawn, so
   * `facing: 'left'` always comes with the right-hand animation and `flipped` —
   * asserting on that pair is how a test proves the mirror is doing the work.
   */
  private syncPlayerHooks(): void {
    hooks.player.x = this.player.x;
    hooks.player.y = this.player.y;
    hooks.player.facing = this.player.facing;
    hooks.player.anim = this.player.animKey;
    hooks.player.flipped = this.player.flipped;
    hooks.player.frames = this.player.frames;
    hooks.player.artLoaded =
      characterArtLoaded(this, SERAPHINA) && TileWorld.artLoaded(this, this.world.map);
  }

  private syncCameraHooks(): void {
    const camera = this.cameras.main;
    hooks.camera.x = camera.scrollX;
    hooks.camera.y = camera.scrollY;
    hooks.camera.width = camera.width;
    hooks.camera.height = camera.height;
  }

  /**
   * Every tree and what is left of it. Written on a change rather than every
   * frame: there are a couple of hundred of them in the exterior and their
   * state only ever moves when she swings at one.
   */
  private syncTreeHooks(): void {
    hooks.trees = this.trees.map((tree) => ({
      id: tree.def.id,
      x: tree.x,
      y: tree.y,
      choppable: tree.choppable,
      state: tree.state,
    }));
  }

  private syncToolHooks(): void {
    hooks.tools = {
      slots: [...toolBelt.slots],
      held: toolBelt.heldSlot,
      holding: toolBelt.held,
    };
  }

  /** What is in this zone, for a test that wants to walk somewhere. */
  private syncWorldHooks(): void {
    hooks.room = this.zoneId;
    hooks.world = {
      width: this.world.widthPx,
      height: this.world.heightPx,
      tile: TILE_SIZE,
      cols: this.world.map.cols,
      rows: this.world.map.rows,
      // The live grid, not the string the map file arrived as. She can take a
      // tile back now, and a route planner working off the boot-time snapshot
      // would refuse to walk through the gap she just made.
      blocked: this.world.blockedString,
    };
    this.syncPlayerHooks();
    this.syncCameraHooks();
    this.syncTreeHooks();
    this.syncToolHooks();

    hooks.interactables = this.interactables.map(({ id, x, y }) => ({ id, x, y }));
    hooks.doorways = this.doorways.map((d) => ({
      id: d.def.id,
      x: d.x,
      y: d.y,
      to: d.def.to,
      enter: d.def.enter,
    }));
    hooks.landmarks = this.world.map.landmarks.map((mark) => ({
      id: mark.id,
      x: mark.x * WORLD_SCALE,
      y: mark.y * WORLD_SCALE,
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
    // The keyboard stand-in for the pad's blue button. Named for the button and
    // not for what it does, the same way Z stands in for green — the keyboard
    // exists so tests can drive the game, and a test that presses "the blue
    // button" is a test that reads like the pad in her hands.
    this.toolKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.hitboxKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);

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

    // Letting go idles her where she stands, still facing the way she went.
    this.player.setMoving(move.lengthSq() > 0);
    if (move.lengthSq() === 0) return;

    // Walked in short steps rather than one jump per frame. A frame is 16 ms on
    // a real machine and can be 250 in the headless browser the tests drive, and
    // a quarter-second jump either tunnels her through a wall or — once the wall
    // stops it — walks her at a fraction of her own speed on a slow machine.
    // Both of those are the same bug, and substepping is the fix for both.
    const distance = WALK_SPEED * seconds;
    const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
    const step = distance / steps;

    for (let i = 0; i < steps; i++) {
      // One axis at a time, so a wall she is pressing into diagonally slides her
      // along it instead of stopping her dead. Being unable to get past a fence
      // is the nearest thing to failing this game has.
      const wantX = this.world.clampX(this.player.x + move.x * step);
      if (this.world.canStand(wantX, this.player.y)) this.player.x = wantX;

      const wantY = this.world.clampY(this.player.y + move.y * step);
      if (this.world.canStand(this.player.x, wantY)) this.player.y = wantY;
    }

    // The bigger half of the push wins, so a diagonal picks one row of the
    // sheet and stays there rather than flickering between two.
    this.player.face(
      Math.abs(move.x) >= Math.abs(move.y)
        ? move.x > 0
          ? 'right'
          : 'left'
        : move.y > 0
          ? 'down'
          : 'up',
    );

    // She has worked out the stick. The picture has done its job.
    if (!walkHintDone) {
      walkHintDone = true;
      this.stickHint?.dismiss();
    }
  }

  /**
   * The hitbox overlay, for as long as B is held. Kept out of `handleInteract`
   * because it is not an interaction: it stays live while she is walking through
   * a doorway, which is exactly when a collision question is worth asking.
   */
  private updateHitboxes(): void {
    this.hitboxes.setVisible(this.hitboxesPinned || (this.hitboxKey?.isDown ?? false));
    this.hitboxes.draw(this.player.x, this.player.y);
    hooks.hitboxes = this.hitboxes.visible;
  }

  private handleInteract(pad?: Phaser.Input.Gamepad.Gamepad): void {
    const padDown = pad?.A ?? false;
    const padPressed = padDown && !this.padInteractWasDown;
    this.padInteractWasDown = padDown;

    const keyPressed = this.interactKey
      ? Phaser.Input.Keyboard.JustDown(this.interactKey)
      : false;

    const near = this.nearestInteractable();
    // Mid-swing the dot goes, so the thing she is hitting does not also look
    // like a thing she has not pressed yet. A tree never shows one at all —
    // see Interactable — and because the nearest wins, a tree being nearest
    // takes the dot off the shed behind it too. That is the honest answer: the
    // button is about the tree.
    this.prompt.setVisible(near !== null && near.dot && !this.player.chopping);
    if (near) this.prompt.setPosition(near.x, near.y - 58);

    if ((padPressed || keyPressed) && near) near.press();
  }

  /**
   * The blue button: the next tool along.
   *
   * With only the axe there is nothing to cycle to, and the row bounces instead
   * of doing nothing at all — see ToolRow. The path is real either way, because
   * the button has to have been worth pressing before the hammer arrives or she
   * will never have found out it is there.
   */
  private handleTools(pad?: Phaser.Input.Gamepad.Gamepad): void {
    const padDown = pad?.X ?? false;
    const padPressed = padDown && !this.padToolWasDown;
    this.padToolWasDown = padDown;

    const keyPressed = this.toolKey ? Phaser.Input.Keyboard.JustDown(this.toolKey) : false;
    if (!padPressed && !keyPressed) return;

    if (toolBelt.cycle()) playSparkleChime();
    else this.toolRow.bounce(toolBelt.heldSlot);
    this.toolRow.refresh();
    this.syncToolHooks();
  }

  /** The closest thing within arm's reach, or null. */
  private nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bestDistance = INTERACT_RADIUS;

    for (const thing of this.interactables) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        thing.x,
        thing.y,
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = thing;
      }
    }

    return best;
  }

  // --- doorways ------------------------------------------------------------

  /**
   * Walk-through doorways only. A press door she is standing in front of is
   * left alone here — `handleInteract` gives it a green dot instead, and a door
   * that opened just because she wandered past it is what this convention
   * exists to stop.
   */
  private checkDoorways(): void {
    const walkThrough = this.doorways.filter((d) => d.def.enter !== 'press');
    const inside = walkThrough.find((d) => d.contains(this.player.x, this.player.y));

    if (!this.doorwaysArmed) {
      if (!inside) this.doorwaysArmed = true;
      return;
    }

    if (inside) this.leaveThrough(inside);
  }

  private leaveThrough(door: Doorway): void {
    if (this.leaving) return;
    this.leaving = true;
    hooks.transitioning = true;

    this.bubble.stop();
    this.prompt.setVisible(false);
    this.stickHint?.dismiss();

    // Fetch the far side while the flourish plays. It is cached after the first
    // trip, so this only ever costs the very first walk through a door.
    const arriving = loadMap(door.def.to);

    playExitFlourish(
      this,
      { x: door.x, y: door.y, kind: door.def.flourish, sparkles: this.sparkles },
      () => {
        void arriving.then((map) => {
          this.scene.start('RoomScene', {
            voice: this.voice,
            room: door.def.to as ZoneId,
            map,
            spawn: door.def.toSpawn,
            flourish: door.def.flourish,
          } satisfies RoomSceneData);
        });
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

  private poke(prop: Prop): void {
    nudgeProp(this, prop);

    // A facade door is the one thing in the game allowed to answer with no
    // words. It gets a knock and a shove; everything else gets the full burst.
    if (!prop.def.line) {
      playThudChime();
      this.sparkles.explode(10, prop.x, prop.y);
      hooks.sparkles += 1;
      return;
    }

    this.sparkles.explode(48, prop.x, prop.y);
    playSparkleChime();
    this.bubble.say(prop.def.line, this.player);
    this.cameras.main.shake(140, 0.004);
    hooks.sparkles += 1;
  }

  /**
   * Swing the axe at a tree.
   *
   * She turns to face it and the blow lands partway through the swing, not at
   * the end of it — see `Character.chop`. Everything that happens to the tree is
   * the tree's business; this picks the noise and shakes the camera by how big
   * a thing just happened.
   *
   * Without the axe in hand nothing happens at all, which today cannot occur:
   * the axe is welded into slot one. The check is here because the day a quest
   * hands her a hammer is the day "the green button chops" stops being true, and
   * finding that out then would mean finding it out in the wood.
   */
  private swingAt(tree: Tree): void {
    if (!toolBelt.holding('axe')) return;
    if (tree.state === 'gone') return;

    const towards = this.directionTo(tree.x, tree.y);
    const swung = this.player.chop(
      towards,
      () => this.landBlow(tree),
      () => this.syncPlayerHooks(),
    );
    if (swung) hooks.swings += 1;
  }

  /** The moment the axe is in the wood. */
  private landBlow(tree: Tree): void {
    const before = tree.state;
    const what = tree.whack();
    if (!what) return;

    hooks.whacks += 1;

    if (what === 'shake') {
      // Escalating, and the sound escalates with it. `before` rather than a
      // count of its own: an unchoppable tree is always on its first blow, and
      // that is exactly what it should keep sounding like.
      playChopThunk(before === 'stump' ? 1 : 0);
      this.cameras.main.shake(110, tree.choppable ? 0.004 : 0.0025);
    } else if (what === 'fell') {
      playTreeCrash();
      this.cameras.main.shake(360, 0.011);
      hooks.sparkles += 1;
    } else {
      playStumpPop();
      this.cameras.main.shake(140, 0.005);
      // The world just changed shape. Nothing else in the game does this, so
      // nothing else has to tell the hooks about it.
      this.syncWorldHooks();
    }

    this.syncTreeHooks();
  }

  /** Which of the four ways she is facing points at a thing. */
  private directionTo(x: number, y: number): 'up' | 'down' | 'left' | 'right' {
    const dx = x - this.player.x;
    const dy = y - this.player.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
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

  private drawHud(): void {
    // What she is carrying, bottom-left, with the empty boxes drawn.
    this.toolRow = makeToolRow(this, toolBelt);

    // The zone used to caption itself "Walk: left stick or arrow keys". She
    // cannot read it, so it is a picture now — and it leaves once she walks.
    // Fixed to the screen, because the world moves underneath it.
    //
    // It has moved up the corner to clear the tool row and the space kept for
    // the coin row above it. Still bottom-left: it is an instruction about the
    // left stick, and the left stick is on the left.
    if (!walkHintDone) {
      this.stickHint = makeStickHint(this, 108, GAME_HEIGHT - 264);
      this.stickHint.container.setDepth(DEPTH.hud).setScrollFactor(0);
    }

    // A green dot, never the letter "A" — see ButtonDot. The dot over a prop
    // and the dot on the title screen are the same promise: press green.
    this.prompt = makeButtonDot(this, 0, 0, { radius: 18, pulse: true })
      .setDepth(DEPTH.prompt)
      .setVisible(false);
  }
}
