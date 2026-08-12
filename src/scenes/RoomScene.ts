import Phaser from 'phaser';
import {
  playChopThunk,
  playSparkleChime,
  playStumpPop,
  playThudChime,
  playTreeCrash,
  playWhoosh,
} from '../audio/beep';
import { unlockAudio } from '../audio/context';
import { DEPTH, GAME_HEIGHT, TILE_SIZE, WORLD_SCALE } from '../config';
import { makeButtonDot } from '../ui/ButtonDot';
import { makeStickHint, type StickHint } from '../ui/StickHint';
import { makeToolRow, preloadToolIcons, type ToolRow } from '../ui/ToolRow';
import { SpeechBubble, type Speaker } from '../ui/SpeechBubble';
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
import { Npc, sheetFor } from '../world/Npc';
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
 * A prop, a press-to-enter door and a person are the same thing from where she
 * is standing: get near it, a green dot appears, press green, something happens.
 * They are different objects in the map data and the same object here, which is
 * what lets a front door pick up every affordance a chest already had — the
 * proximity radius, the dot, the nearest-wins rule — without any of it being
 * written twice.
 *
 * Everything in this list has a dot, and that is now the definition of the list:
 * the dot is a *selection*, so a thing the button is about is a thing that says
 * so. Trees are deliberately not in here. There are two hundred of them, she
 * walks through them constantly, and a dot drifting from trunk to trunk beside
 * her would be an answer to a question nobody asked — but the version of that
 * which kept them in the pool and hid their dot had the worse half of both:
 * standing between a spruce and a shed took the dot off the shed and gave the
 * press to the spruce. The axe is a fallback now, not a competitor. See `swing`.
 */
interface Interactable {
  id: string;
  /** Where she walks up to, in world pixels. */
  x: number;
  y: number;
  /**
   * How far above `y` the green dot floats.
   *
   * A prop's `y` is its middle, so a fixed lift clears it. A person's `y` is
   * their feet, and a person in this pack is seventy screen pixels tall — so the
   * same fixed lift puts the dot on their chest, where it covers the child it is
   * pointing at. Asked of whoever it is about, rather than assumed.
   */
  lift: number;
  press: () => void;
}

/** What clears a prop: half its picture and a bit. */
const DOT_LIFT = 58;

/** What clears a person: their own height, and a bit. */
const HEAD_GAP = 34;

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
  private npcs: Npc[] = [];
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
    this.npcs = [];
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
    // Everybody standing in this zone, queued alongside her. Their sheets are
    // hers with different files in the slots, so this is the same call.
    for (const npc of this.mapData?.npcs ?? []) preloadCharacter(this, sheetFor(npc.sheet));
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

    // People, before the interactable list is built, because they are in it.
    // Their animations are registered per sheet and the call is idempotent, so a
    // zone with two children drawn off the same stack pays for one.
    for (const def of map.npcs ?? []) {
      registerCharacterAnims(this, sheetFor(def.sheet));
      this.npcs.push(new Npc(this, def));
    }

    // Everything the green button reaches, in one list: the props, the people,
    // and the doors you press rather than walk through. Nearest wins, and the
    // winner wears the dot. Trees are not in here — see Interactable and `swing`.
    this.interactables = [
      ...this.props.map((prop) => ({
        id: prop.def.id,
        x: prop.x,
        y: prop.y,
        lift: DOT_LIFT,
        press: () => this.poke(prop),
      })),
      ...this.npcs.map((npc) => ({
        id: npc.id,
        x: npc.x,
        y: npc.y,
        lift: npc.headHeight + HEAD_GAP,
        press: () => this.talkTo(npc),
      })),
      ...this.doorways
        .filter((door) => door.def.enter === 'press')
        .map((door) => ({
          id: door.def.id,
          x: door.x,
          y: door.y,
          lift: DOT_LIFT,
          press: () => this.leaveThrough(door),
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
      // She steers through the swing. There is no moment in this game where the
      // stick does nothing: the blow was aimed when the swing started and moving
      // does not retarget or cancel it, so letting her walk costs the chop
      // nothing and buys back the only half-second the game ever took off her.
      this.movePlayer(seconds, pad);
      this.checkDoorways();
      this.handleTools(pad);
      this.handleInteract(pad);
    }
    this.player.setDepth(this.player.y);
    this.world.revealBehind(this.player.x, this.player.y);
    this.updateHitboxes();
    this.watchForStumpGap();
    // She walks through people, so they wobble when she does. It is the only
    // thing that stops walking through somebody feeling like walking through a
    // photograph of them.
    for (const npc of this.npcs) npc.jostle(this.player.x, this.player.y);
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
    this.syncBubbleHooks();
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
      this.bubble.say(id, this.speaking());
      this.syncVoiceHooks();
    };
    hooks.voice.scrub = (seconds) => {
      this.bubble.scrub(seconds);
      this.syncVoiceHooks();
    };
    hooks.voice.timings = (id) => this.voice.get(id)?.words ?? [];
  }

  /** Seraphina, as somebody the balloon can point at. */
  private speaking(): Speaker {
    return { id: 'seraphina', x: this.player.x, y: this.player.y };
  }

  /** update() does this every frame, but a paused scene has no frames. */
  private syncVoiceHooks(): void {
    hooks.voice.lineId = this.bubble.lineId;
    hooks.voice.words = this.bubble.spokenWords;
    hooks.voice.highlighted = this.bubble.highlightedIndex;
    this.syncBubbleHooks();
  }

  /** Where the balloon actually is, and whose it is. */
  private syncBubbleHooks(): void {
    hooks.voice.bubble = {
      visible: this.bubble.visible,
      speaker: this.bubble.speakerId,
      x: this.bubble.x,
      y: this.bubble.y,
    };
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

  /**
   * Who is standing here, which way they are turned, and what they have to say.
   * Written on a change rather than every frame — people do not move — and one
   * of the two changes is a person turning to look at her, so `talkTo` calls it
   * too.
   */
  private syncNpcHooks(): void {
    hooks.npcs = this.npcs.map((npc) => ({
      id: npc.id,
      x: npc.x,
      y: npc.y,
      facing: npc.facing,
      lines: [...npc.def.lines],
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

    this.syncNpcHooks();

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

  /**
   * Count any frame in which a tree that has not been cleared has nothing on
   * screen at all.
   *
   * The bug this replaces was one visible beat long — trunk gone, stump not yet
   * raised, bare grass in between — which is exactly the size of thing a
   * screenshot cannot be pointed at and a person watching cannot be sure of. A
   * per-frame count can: the number is zero for a whole run of the wood, or it
   * is not. Cheap enough to leave on, at a couple of hundred null checks a frame.
   */
  private watchForStumpGap(): void {
    for (const tree of this.trees) {
      if (tree.state !== 'gone' && !tree.drawn) hooks.treeGaps += 1;
    }
  }

  private handleInteract(pad?: Phaser.Input.Gamepad.Gamepad): void {
    const padDown = pad?.A ?? false;
    const padPressed = padDown && !this.padInteractWasDown;
    this.padInteractWasDown = padDown;

    const keyPressed = this.interactKey
      ? Phaser.Input.Keyboard.JustDown(this.interactKey)
      : false;

    const near = this.nearestInteractable();
    this.prompt.setVisible(near !== null);
    if (near) this.prompt.setPosition(near.x, near.y - near.lift);

    if (!padPressed && !keyPressed) return;

    // The dot is a promise, so it is kept first: whatever is under it is what
    // green does. Only when there is nothing under it does the button fall
    // through to the tool in her hand — which is why standing between a spruce
    // and a shed now opens the shed, and why swinging at nothing is allowed.
    if (near) near.press();
    else this.swing();
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

  /**
   * Say hello. They turn to face her, and the balloon comes up over *them*.
   *
   * The anchor is the point of this. A speech balloon that always appears over
   * the player is a balloon that says nothing about who is talking, and the one
   * thing a pre-reader has to get out of a conversation is which of the two
   * people on screen the words belong to — so it sits over the speaker and
   * leans its tail at them, and her sister's lines come out of her sister.
   *
   * Pressing again says the next line and wraps. There is no end to a
   * conversation and there is nothing to get wrong: green says the next thing,
   * for ever.
   */
  private talkTo(npc: Npc): void {
    npc.lookAt(this.player.x, this.player.y);

    const line = npc.say();
    if (!line) return;

    this.sparkles.explode(14, npc.x, npc.y - 40);
    this.bubble.say(line, { id: npc.id, x: npc.x, y: npc.y });
    hooks.sparkles += 1;
    this.syncNpcHooks();
    this.syncVoiceHooks();
  }

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
    // A prop speaks in her voice and out of her mouth: she is the one saying
    // "my cozy bed", so the balloon belongs over her. Only a person who is not
    // her moves it — see `talkTo`.
    this.bubble.say(prop.def.line, this.speaking());
    this.cameras.main.shake(140, 0.004);
    hooks.sparkles += 1;
  }

  /**
   * Swing the held tool, and hit a tree with it if one is standing there.
   *
   * This is what the green button does when it has nothing else to do, and the
   * two halves are deliberately separable. The swing always happens: at nothing
   * at all, in the middle of a field, it is a full swing and a breath of air, and
   * a button that answers every press is worth more than a button that is right
   * about when it is worth pressing. The *hit* is decided once, here, from where
   * she is standing at the moment the swing starts — so walking out of range
   * mid-swing does not take the blow away, and walking into range does not
   * conjure one.
   *
   * Everything that happens to the tree is the tree's business; `landBlow` picks
   * the noise and shakes the camera by how big a thing just happened.
   *
   * Without the axe in hand nothing happens at all, which today cannot occur:
   * the axe is welded into slot one. The check is here because the day a quest
   * hands her a hammer is the day "the green button chops" stops being true, and
   * a hammer swung with the axe's animation would be the game drawing a lie.
   */
  private swing(): void {
    if (!toolBelt.holding('axe')) return;

    const tree = this.nearestTree();
    const swung = this.player.chop(
      tree ? this.directionTo(tree.x, tree.y) : this.player.facing,
      () => {
        if (tree) this.landBlow(tree);
      },
      () => this.syncPlayerHooks(),
    );
    if (!swung) return;

    hooks.swings += 1;
    // A whiff answers quietly. The blow has its own noise and it lands a frame
    // and a half from now, so a whoosh under it would only muddy it.
    if (!tree) playWhoosh();
  }

  /**
   * The tree the swing would connect with, or null for a whiff. Same reach and
   * same nearest-wins rule as the dot, so "close enough to press" and "close
   * enough to chop" are one distance and not two.
   */
  private nearestTree(): Tree | null {
    let best: Tree | null = null;
    let bestDistance = INTERACT_RADIUS;

    for (const tree of this.trees) {
      if (tree.state === 'gone') continue;
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        tree.x,
        tree.y,
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = tree;
      }
    }

    return best;
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
