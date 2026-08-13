import Phaser from 'phaser';
import {
  playChopThunk,
  playCoin,
  playCoinBounce,
  playFanfare,
  playFizzle,
  playGemBreak,
  playGiggle,
  playPickup,
  playRockCrack,
  playSparkleChime,
  playStumpPop,
  playSummon,
  playThudChime,
  playTreeCrash,
  playWhoosh,
} from '../audio/beep';
import { unlockAudio } from '../audio/context';
import { DEPTH, GAME_HEIGHT, TILE, TILE_SIZE, WORLD_SCALE } from '../config';
import { itemOf, rocksOf, type RitualStep } from '../quest/Quest';
import { quests } from '../quest/QuestEngine';
import { dayClock } from '../state/dayClock';
import { recapFor, snapshotDay } from '../state/recap';
import { nightPasses } from '../state/sleep';
import { session } from '../state/session';
import { makeButtonDot, padColor, type PadColorName } from '../ui/ButtonDot';
import { makeCoinRow, type CoinRow } from '../ui/CoinRow';
import { makeQuestMarker, type QuestMarker } from '../ui/QuestMarker';
import { makeQuestRow, type QuestRow } from '../ui/QuestRow';
import { makeShimmer, type Shimmer } from '../ui/shimmer';
import { makeStickHint, type StickHint } from '../ui/StickHint';
import { makeToolRow, preloadToolIcons, type ToolRow } from '../ui/ToolRow';
import { COIN_ICON, GEM_ICONS } from '../ui/toolIcons';
import { SpeechBubble, type Speaker } from '../ui/SpeechBubble';
import { NEEDS, nameOf } from '../voice/barks';
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
import { Dusk } from '../world/dusk';
import { Faeries } from '../world/Faeries';
import { GemRock, makeChipEmitter } from '../world/GemRock';
import { GroundItem } from '../world/GroundItem';
import {
  loadMap,
  spawnOf,
  type Direction,
  type FlourishId,
  type MapData,
  type MapNpc,
} from '../world/mapData';
import { Npc, sheetFor } from '../world/Npc';
import { SpellCircle } from '../world/SpellCircle';
import { CURTAIN_DEPTH, playNightfall, playSunrise } from '../world/nightfall';
import { makeProp, nudgeProp, type Prop } from '../world/scenery';
import { TileWorld } from '../world/TileWorld';
import { toolBelt, type ToolId } from '../world/ToolBelt';
import { makeLeafEmitter, Tree } from '../world/Tree';
import { isOutdoors, STARTING_ZONE, type ZoneId } from '../world/zones';
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

/**
 * How close she must be to a prop before it will sparkle. About a tile and a
 * half.
 *
 * It was two tiles-ish, and that was too generous: a dot came on while she was
 * still walking past a thing, and in the village two things are often within
 * that of each other, so the dot hopped between them without her having gone
 * anywhere. Down 30% (Matt, 2026-08-12), which is close enough that the dot
 * means *this* one.
 */
const INTERACT_RADIUS = 98;

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

/**
 * The catalog picture that means "a place to sleep".
 *
 * Keyed off the image rather than the prop's id for the same reason the
 * campfire's smoke is — see `addSmoke`. A bed is a bed wherever the layout puts
 * one, and the day there is a second bedroom nothing here has to hear about it.
 */
const BED = 'bed';

/** What Dad calls out of the house when the light starts going. */
const DAD_BEDTIME = 'dad_bedtime';

/** What clears a prop: half its picture and a bit. */
const DOT_LIFT = 58;

/** What clears a person: their own height, and a bit. */
const HEAD_GAP = 34;

/** What clears a one-tile thing lying in the grass: its own tile, and a bit. */
const ITEM_LIFT = TILE_SIZE + 30;

/**
 * How long the celebration at the end of the quest runs before the next thing
 * anybody says. Long, on purpose: the summoning is the biggest moment in the
 * game and the first sentence over the top of it would take the size off it.
 */
const SUMMONING_BEAT = 1200;

/**
 * How the bedtime recap is paced over the starfield.
 *
 * `LEAD` is the stars getting themselves up before she says anything — they
 * arrive over about a second each, staggered, and a sentence laid over the top
 * of that would be two things at once. `GAP` is the breath between her
 * sentences; short, because they are one thought and not three. `TAIL` is the
 * beat after the last word, which is what stops the morning arriving on top of
 * "goodnight" — it is the only one of the three that is really about the
 * *next* thing rather than this one.
 *
 * Everything between them is measured off the clips themselves, so a line
 * re-cut a second longer paces itself. See `sayRecap`.
 */
const RECAP_LEAD = 650;
const RECAP_GAP = 420;
const RECAP_TAIL = 900;

/** What a clip is assumed to run to when the voice bank never loaded. */
const RECAP_FALLBACK_SECONDS = 1.6;

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
  /**
   * She is waking up here, so the zone opens on last night rather than on a
   * doorway's colour wash. The same arrangement `flourish` has: the beat that
   * ends one scene and the beat that starts the next are two halves of one
   * gesture, and the only way to hand the second half over is in the data that
   * starts the scene. See `world/nightfall.ts`.
   */
  waking?: boolean;
  /**
   * Where to put her, in **world pixels**, instead of one of the map's named
   * spawn points.
   *
   * Sleep is the only thing that uses it, and it is why it exists: she goes to
   * bed standing next to her own bed and has to wake up standing next to it,
   * and "next to the bed" is a place in the room rather than a doorway anybody
   * ever came through. Passed through `nearestStanding` like every other
   * arrival, so it cannot put her inside the furniture.
   */
  wakeAt?: { x: number; y: number; facing: Direction };
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
  private waking = false;
  private wakeAt?: { x: number; y: number; facing: Direction };

  private world!: TileWorld;
  private player!: Character;

  private props: Prop[] = [];
  /**
   * The bed in this zone, if it has one. Picked out of the props because it is
   * the one thing in the world the green button asks a *question* with — see
   * `poke` and `goToSleep`.
   */
  private bed: Prop | null = null;
  private doorways: Doorway[] = [];
  private trees: Tree[] = [];
  private npcs: Npc[] = [];
  private interactables: Interactable[] = [];

  /** What the active quest phase has put out in *this* zone, if anything. */
  private rocks: GemRock[] = [];
  private lying: GroundItem | null = null;
  private shimmers: Shimmer[] = [];
  private marker: QuestMarker | null = null;
  private circle: SpellCircle | null = null;
  /** True while she is standing inside it — which is while it owns the buttons. */
  private inCircle = false;

  /**
   * Three lights that came out of a fire and are not going home. Built from one
   * flag in the session store, so they cross every doorway with her. See Faeries.
   */
  private faeries: Faeries | null = null;

  /**
   * The evening, if this zone has one. Null indoors and in the cave, which is
   * the whole of the rule — see `isOutdoors`.
   */
  private dusk: Dusk | null = null;

  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private leaves!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chips!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prompt!: Phaser.GameObjects.Container;
  private stickHint?: StickHint;
  private toolRow!: ToolRow;
  private questRow!: QuestRow;
  private coinRow!: CoinRow;
  private bubble!: SpeechBubble;
  private voice!: VoiceBank;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  /**
   * The green button, on the keyboard. Two keys, not one — see setupInput for
   * why each face button has both an old key and a diamond key.
   */
  private interactKeys: Phaser.Input.Keyboard.Key[] = [];
  /** The blue button, on the keyboard. Cycles the held tool. See ButtonDot. */
  private toolKeys: Phaser.Input.Keyboard.Key[] = [];
  /** The yellow button, on the keyboard. Says the job again. See ButtonDot. */
  private helpKeys: Phaser.Input.Keyboard.Key[] = [];
  /**
   * The red button, on the keyboard. It does nothing at all outside the spell
   * circle — see `handleRitual`, and `setupInput` for why it is not the B key.
   */
  private redKeys: Phaser.Input.Keyboard.Key[] = [];

  /** Hold this and the collision grid shows. See DebugHitboxes. */
  private hitboxKey?: Phaser.Input.Keyboard.Key;
  private hitboxes!: DebugHitboxes;
  /** Forced on by a test, so a headless screenshot can hold no key at all. */
  private hitboxesPinned = false;

  /**
   * Last frame's state of each face button, so a held one fires once.
   *
   * All four are read every frame, in one place, whatever is going on — see
   * `readButtons`. They used to be read inside the three handlers, which was
   * fine while every button had exactly one meaning; the ritual gives three of
   * them a second one, and a button whose edge is only *looked at* by the
   * handler that happens to be running is a button that fires again the moment
   * the other handler takes over.
   */
  private padWasDown: Record<'a' | 'b' | 'x' | 'y', boolean> = {
    a: false,
    b: false,
    x: false,
    y: false,
  };

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
    this.waking = data.waking ?? false;
    this.wakeAt = data.wakeAt;

    // Restarting the scene reuses the instance, so anything remembered across
    // create() has to be put back by hand.
    this.props = [];
    this.bed = null;
    this.doorways = [];
    this.trees = [];
    this.npcs = [];
    this.interactables = [];
    this.rocks = [];
    this.lying = null;
    this.shimmers = [];
    this.marker = null;
    this.circle = null;
    this.inCircle = false;
    this.faeries = null;
    this.dusk = null;
    this.leaving = false;
    this.doorwaysArmed = false;
    this.padWasDown = { a: false, b: false, x: false, y: false };
    this.stickHint = undefined;
    this.hitboxesPinned = false;
  }

  preload(): void {
    this.makeSparkTexture();
    preloadCharacter(this, SERAPHINA);
    // Everybody standing in this zone, queued alongside her. Their sheets are
    // hers with different files in the slots, so this is the same call.
    for (const npc of this.mapData?.npcs ?? []) preloadCharacter(this, sheetFor(npc.sheet));
    // And anybody the quest has moved here, who is in nobody's map file.
    for (const guest of quests.guests(this.zoneId)) preloadCharacter(this, sheetFor(guest.sheet));
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

    // Walking in here may itself be the thing the quest was waiting for. Asked
    // before anything is built, so the whole zone is built for the phase she is
    // actually in rather than for the one she was in on the far side of the
    // door — the circle on the floor is a phase's furniture, and a room that put
    // it out one frame late would flicker.
    const arrivedOn = quests.arrive(this.zoneId);

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
    this.chips = makeChipEmitter(this);

    for (const def of map.doorways) this.doorways.push(new Doorway(this, def));
    for (const def of map.props) {
      const prop = makeProp(this, this.world, def);
      this.props.push(prop);
      this.addSmoke(prop);
      // Found by its picture rather than by its id, the same way the campfire's
      // smoke is: any bed anywhere is a place she can sleep, and the day the
      // house has two of them neither is a special case.
      if (def.key === BED) this.bed = prop;
    }
    // Each tree is built with whatever she already did to it. The map file has
    // every one of them standing — it is the generator's output, and the
    // generator has never met her — so without the store the wood grows back
    // every time she goes indoors.
    const felled = session.trees(this.zoneId);
    for (const def of map.trees ?? []) {
      this.trees.push(
        new Tree(
          this,
          this.world,
          def,
          { leaves: this.leaves, sparkles: this.sparkles },
          felled[def.id],
        ),
      );
    }

    // People, before the interactable list is built, because they are in it.
    // Their animations are registered per sheet and the call is idempotent, so a
    // zone with two children drawn off the same stack pays for one.
    //
    // Anybody the quest has taken somewhere else is left out — they are standing
    // in the cave, not on their own doorstep, and a person in two places at once
    // is worse than a person missing from one. See `gather` on a Quest.
    for (const def of map.npcs ?? []) {
      if (quests.away(def.id)) continue;
      registerCharacterAnims(this, sheetFor(def.sheet));
      this.npcs.push(new Npc(this, def));
    }
    // ...and anybody it has brought here instead. They are ordinary people from
    // this point on: the green button, the balloon and the jostle do not know
    // the difference, because there is none.
    for (const guest of quests.guests(this.zoneId)) {
      registerCharacterAnims(this, sheetFor(guest.sheet));
      this.npcs.push(
        new Npc(this, {
          id: guest.id,
          sheet: guest.sheet,
          // A guest is written in tiles, the way a quest writes everything; a
          // map npc arrives in pack pixels, having been through the generator.
          x: guest.x * TILE,
          y: guest.y * TILE,
          facing: guest.facing,
          lines: [...guest.lines],
        } satisfies MapNpc),
      );
    }

    // The ring on the floor, where the map says there is one. It is the zone's
    // furniture and not a phase's: somebody scratched it into this rock long
    // before she walked in, and it is still there when the spell is over. What
    // the ritual borrows is the *rule* — inside it the face buttons are the
    // spell's — and the quest's own numbers are checked against these by
    // `quest.spec`, standing in the ring and pressing them. See SpellCircle.
    if (map.circle) {
      this.circle = new SpellCircle(
        this,
        map.circle.x * WORLD_SCALE,
        map.circle.y * WORLD_SCALE,
        map.circle.r * WORLD_SCALE,
      );
    }

    // Whatever the quest has put out here, and the light on it. Before the
    // interactable list, because a thing lying in the grass is in it.
    this.buildQuestObjects();
    this.refreshInteractables();

    // Where she is standing when the zone opens. A named spawn point normally —
    // the far side of the door she came through — but waking up is a place in
    // the middle of a room rather than a doorway, so sleep hands over a world
    // point instead. Both go through `nearestStanding`, so neither can put her
    // inside the furniture.
    const spawn = spawnOf(map, this.arrivedVia);
    const at = this.wakeAt ?? {
      x: spawn.x * WORLD_SCALE,
      y: spawn.y * WORLD_SCALE,
      facing: spawn.facing,
    };
    const stand = this.world.nearestStanding(at.x, at.y);
    registerCharacterAnims(this, SERAPHINA);
    this.player = new Character(this, stand.x, stand.y, SERAPHINA);
    this.player.face(at.facing);
    // She sorts against the world by where she is standing, same as everything
    // else. update() keeps it there; this is so the first frame is right too.
    this.player.setDepth(this.player.y);

    this.setupCamera();

    // Trees come and go, so the overlay asks for theirs rather than being told
    // once. It only asks while it is on screen, which is while B is held.
    this.hitboxes = new DebugHitboxes(this, this.world, () =>
      this.trees.map((tree) => tree.footprint),
    );

    // Three lights that are not going home. One flag in the store, so they are
    // rebuilt beside her in whatever zone she walks into next.
    if (session.faeries) this.faeries = new Faeries(this, this.player.x, this.player.y);

    // And the evening, where there is a sky to have one in. Built at whatever
    // the clock already says rather than from zero, so walking out of the house
    // at dusk opens on the evening she left rather than fading into it — the
    // clock crosses doorways and the zone drawing it does not.
    if (isOutdoors(this.zoneId)) this.dusk = new Dusk(this, this.player.x, this.player.y);
    this.applyDusk();

    this.setupInput();
    this.drawHud();
    this.refreshQuestHud();
    this.arrive();
    // He is standing here waiting for her, so he says so — after the doorway's
    // flourish has landed, because two things at once is one thing missed.
    if (arrivedOn) {
      this.time.delayedCall(700, () => {
        if (this.leaving || !this.scene.isActive()) return;
        this.sayFrom(quests.giver, quests.phase?.instruction ?? null);
      });
    }

    // The objective's own twinkle, on one timer for the whole zone rather than
    // one per thing: there are never more than three of these, and a burst of
    // four particles a second each is the difference between a glow and
    // something magic sitting in the grass.
    this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => {
        for (const shimmer of this.shimmers) this.sparkles.explode(4, shimmer.x, shimmer.y);
      },
    });

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
    // The same standing-in, for coins. Only one thing in the game hands one over
    // so far and it is at the end of a whole quest, so this is what lets the
    // night test have a coin worth keeping — and what lets a fourth coin be
    // offered to a full pocket at all, which is otherwise unreachable.
    hooks.grantCoin = () => this.grantCoin();
    hooks.session = () => session.snapshot();
    hooks.warpDay = (ms) => {
      dayClock.warp(ms);
      this.applyDusk();
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

    // Every button, every frame, in one place — even while she is being carried
    // through a doorway. See `padWasDown`.
    const button = this.readButtons(pad);

    if (!this.leaving) {
      // She steers through the swing. There is no moment in this game where the
      // stick does nothing: the blow was aimed when the swing started and moving
      // does not retarget or cancel it, so letting her walk costs the chop
      // nothing and buys back the only half-second the game ever took off her.
      this.movePlayer(seconds, pad);
      this.checkDoorways();
      this.watchTheCircle();

      // Inside the circle the spell has the face buttons and nothing else does.
      // Everywhere else — which is everywhere in the world but one ring on one
      // floor — blue is still the tool and green is still what is in front of
      // her. Yellow is untouched either way: "say it again" is the one thing
      // that has to work in the middle of a sequence.
      if (this.inCircle) this.handleRitual(button);
      else {
        this.handleTools(button.blue);
        this.handleInteract(button.green);
        // Red is the only face button with nothing to do out here, which is
        // exactly why the bed borrows it: backing out of a question is the one
        // thing "cancel" has always meant, and it is free everywhere else.
        if (button.red) this.cancelSleep();
      }
      this.handleHelp(button.yellow);
    }
    // The afternoon runs whatever she is doing with it, including standing in a
    // doorway. It changes nothing she can lose, so there is nothing to pause.
    dayClock.tick(delta);
    this.applyDusk();
    this.dusk?.update(delta, this.player.x, this.player.y);
    this.dadCallsHer();
    this.faeries?.update(delta, this.player.x, this.player.y);
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
      this.sparkles.getAliveParticleCount() +
      this.leaves.getAliveParticleCount() +
      this.chips.getAliveParticleCount();
    hooks.peakParticles = Math.max(hooks.peakParticles, hooks.aliveParticles);
    hooks.voice.lineId = this.bubble.lineId;
    hooks.voice.words = this.bubble.spokenWords;
    hooks.voice.highlighted = this.bubble.highlightedIndex;
    // Where the three of them are, or an empty list when they have not been
    // summoned. The only honest way to ask "are they still with her" after a
    // doorway, which is the whole claim they exist to make.
    hooks.faeries = this.faeries?.positions ?? [];
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

  /**
   * Her, naming something to herself — over her own head, in her own voice.
   *
   * Every one of these is a thing she did with a button rather than a thing
   * somebody said to her, so it goes in at the bottom of the pecking order: it
   * cuts off another bark and gets dropped if anybody is mid-sentence. See
   * `SpeechBubble.bark`. Verbose on purpose — this is a reading game, and a
   * four-year-old who hears "Malachite!" while a green stone flies across the
   * screen is being taught the word.
   */
  private bark(id: string): void {
    unlockAudio();
    if (!this.bubble.bark(id, this.speaking())) return;
    this.syncVoiceHooks();
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

  /**
   * How many coins she has.
   *
   * Off the store rather than off the row, because the store is what survives a
   * night and the row is a picture of it — and the one claim worth making about
   * coins is that the picture agrees with the thing that survived.
   */
  private syncCoinHooks(): void {
    hooks.coins = session.coins;
  }

  /**
   * What the quest thinks is true, and what this zone has put on the ground
   * because of it.
   *
   * Two halves on purpose. The engine's half — which quest, which phase, which
   * slots are full — is the same everywhere in the world and comes straight off
   * the store, so a test can walk indoors and check it survived. `objects` is
   * this zone's half, and it is the only way to ask whether the *picture* agrees
   * with the bookkeeping.
   */
  private syncQuestHooks(): void {
    hooks.quest = {
      id: quests.active?.id ?? null,
      phase: quests.phase?.id ?? null,
      instruction: quests.instruction,
      giver: quests.giver,
      /** Who is wearing a thought bubble right now, or null. */
      offering: this.npcs.find((npc) => quests.offerFrom(npc.id) !== null)?.id ?? null,
      marker: this.marker !== null,
      slots: quests.slots.map((slot) => ({ ...slot })),
      held: [...quests.held],
      /**
       * The ritual, from the outside. `circle` is whether the ring is actually
       * on the floor of this zone, `inCircle` whether she is standing in it —
       * which is the same thing as "who owns the face buttons" — and `step` the
       * colour he is asking for. Three questions a test cannot otherwise ask
       * without reading pixels.
       */
      circle: this.circle !== null,
      inCircle: this.inCircle,
      step: quests.step?.id ?? null,
      objects: [
        ...(this.lying
          ? [{ id: this.lying.id, x: this.lying.x, y: this.lying.y, broken: false }]
          : []),
        ...this.rocks.map((rock) => ({
          id: rock.id,
          x: rock.x,
          y: rock.y,
          broken: rock.broken,
        })),
      ],
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
    this.syncCoinHooks();

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
    // Each face button answers to two keys, because the keyboard is doing two
    // jobs. Z/X/Y are the *test* keys: named for the button they stand in for,
    // so a spec that presses "the blue button" reads like the pad in her hands,
    // and every test in the suite already presses them. I/J/K/L are the *play*
    // keys: a diamond under the right hand laid out like the pad's face — J left
    // is blue, K bottom is green, I top is yellow — for the evenings the pad is
    // flat and somebody still wants to play. Neither set is the real input. The
    // pad is.
    this.interactKeys = this.addKeys(keyboard, ['Z', 'K']);
    this.toolKeys = this.addKeys(keyboard, ['X', 'J']);
    this.helpKeys = this.addKeys(keyboard, ['Y', 'I']);
    // The red button. `L` is the diamond's right-hand key, where B sits on the
    // pad. The test key is **C, not B**, and that is the one place the naming
    // breaks: B has been the hitbox overlay since long before anything in this
    // game asked for a red button, holding it is documented in CLAUDE.md, and
    // the overlay is worth more than the letter. Nothing outside the spell
    // circle listens to either of these.
    this.redKeys = this.addKeys(keyboard, ['C', 'L']);
    this.hitboxKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);

    // The title screen already unlocked audio; this is only insurance for a
    // context the browser suspended again while the tab was in the background.
    keyboard.on('keydown', unlockAudio);
    this.input.on('pointerdown', unlockAudio);
    this.input.gamepad?.on('connected', unlockAudio);
  }

  private addKeys(
    keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
    names: (keyof typeof Phaser.Input.Keyboard.KeyCodes)[],
  ): Phaser.Input.Keyboard.Key[] {
    return names.map((name) => keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[name]));
  }

  /**
   * Did any of these keys go down this frame?
   *
   * Every key is asked, even once the answer is known: `JustDown` clears the
   * flag it reads, so short-circuiting would leave the unasked key still latched
   * and fire it again on the next frame — one press, two swings.
   */
  private justPressed(keys: Phaser.Input.Keyboard.Key[]): boolean {
    let pressed = false;
    for (const key of keys) {
      if (Phaser.Input.Keyboard.JustDown(key)) pressed = true;
    }
    return pressed;
  }

  /**
   * Did this face button go down this frame, on the pad?
   *
   * Called exactly once per button per frame, from `readButtons` and nowhere
   * else, because it is what remembers whether the button was down last time.
   */
  private padPressed(pad: Phaser.Input.Gamepad.Gamepad | undefined, face: 'a' | 'b' | 'x' | 'y'): boolean {
    const down =
      (face === 'a' ? pad?.A : face === 'b' ? pad?.B : face === 'x' ? pad?.X : pad?.Y) ?? false;
    const pressed = down && !this.padWasDown[face];
    this.padWasDown[face] = down;
    return pressed;
  }

  /**
   * The four face buttons, by the only name that means anything to her.
   *
   * Every one of them is read every frame whatever is happening, and the pad
   * half and the keyboard half are both asked before either answer is used —
   * `JustDown` clears the flag it reads, so a short-circuit here would leave a
   * key latched and fire it a frame later under whatever took over next.
   */
  private readButtons(pad?: Phaser.Input.Gamepad.Gamepad): Record<PadColorName, boolean> {
    const padGreen = this.padPressed(pad, 'a');
    const padRed = this.padPressed(pad, 'b');
    const padBlue = this.padPressed(pad, 'x');
    const padYellow = this.padPressed(pad, 'y');

    const keyGreen = this.justPressed(this.interactKeys);
    const keyRed = this.justPressed(this.redKeys);
    const keyBlue = this.justPressed(this.toolKeys);
    const keyYellow = this.justPressed(this.helpKeys);

    return {
      green: padGreen || keyGreen,
      red: padRed || keyRed,
      blue: padBlue || keyBlue,
      yellow: padYellow || keyYellow,
    };
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

  private handleInteract(pressed: boolean): void {
    const near = this.nearestInteractable();
    this.prompt.setVisible(near !== null);
    if (near) this.prompt.setPosition(near.x, near.y - near.lift);

    if (!pressed) return;

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
  private handleTools(pressed: boolean): void {
    if (!pressed) return;

    if (toolBelt.cycle()) {
      playSparkleChime();
      // And she says what she is now holding. Mashing blue therefore sounds like
      // mashing blue: each bark cuts the last one off and nothing is queued, so
      // three fast presses end on the name of the tool she actually has out
      // rather than owing her three sentences about tools she has been through.
      const held = toolBelt.held;
      if (held) this.bark(nameOf(held));
    } else this.toolRow.bounce(toolBelt.heldSlot);
    this.toolRow.refresh();
    this.syncToolHooks();
  }

  /**
   * The yellow button: what am I doing again?
   *
   * From anywhere, at any distance from the boy who asked. The balloon comes up
   * over *her* rather than over him, because she is the one remembering — but the
   * voice is his, because that is whose sentence it is. Which is the pairing the
   * whole speech system was built for: the balloon says who is talking, and here
   * that is her, quoting.
   *
   * Nothing at all happens without a quest on. A button that answers sometimes is
   * worse than one that answers never, so the yellow dot is only on screen while
   * there is something for it to say — see QuestRow.
   */
  private handleHelp(pressed: boolean): void {
    if (!pressed) return;

    const line = quests.instruction;
    if (!line) return;

    unlockAudio();
    this.sparkles.explode(10, this.player.x, this.player.y - 60);
    this.bubble.say(line, this.speaking());
    hooks.sparkles += 1;
    this.syncVoiceHooks();
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
   * waking up it is the morning; out of the title screen it is the title's own
   * flash, unchanged.
   */
  private arrive(): void {
    // Morning first, because it is the only one of the three that has to paint
    // the frame it opens on: the night has to still be up when the first frame
    // of this zone is drawn, or the restart shows as a flash of daylight.
    if (this.waking) {
      playSunrise(this, { x: this.player.x, y: this.player.y, sparkles: this.sparkles });
      return;
    }

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
    this.faeries?.cheer();

    const line = this.whatTheySay(npc);
    if (!line) return;

    this.sparkles.explode(14, npc.x, npc.y - 40);
    this.bubble.say(line, { id: npc.id, x: npc.x, y: npc.y });
    hooks.sparkles += 1;
    this.syncNpcHooks();
    this.syncVoiceHooks();
  }

  /**
   * What comes out of somebody when green is pressed at them.
   *
   * Three answers, in order. Somebody with a quest to give says the next line of
   * the offer, and the last of those *is* taking the job — there is no yes or no
   * to get wrong, only a boy who keeps talking until she is on an errand.
   * Somebody who has already given her one says what the job is, every time,
   * because "ask him again" has to be a thing that works. Everybody else cycles
   * their own lines, exactly as before.
   */
  private whatTheySay(npc: Npc): string | null {
    const offering = quests.offerFrom(npc.id);
    if (offering) {
      const { line, accepted } = quests.nextOfferLine(offering);
      if (accepted) this.tookTheJob(line);
      this.syncQuestHooks();
      return line;
    }

    if (quests.giver === npc.id && quests.instruction) return quests.instruction;
    return npc.say();
  }

  // --- the quest ------------------------------------------------------------

  /**
   * She has a job. The bubble clears off his head, the world puts out whatever
   * the first phase is about, and once he has finished the sentence he is in the
   * middle of, he tells her where to start.
   */
  private tookTheJob(offerLine: string): void {
    playFanfare();
    this.marker?.destroy();
    this.marker = null;
    this.sparkles.explode(60, this.player.x, this.player.y - 40);
    hooks.sparkles += 1;

    this.buildQuestObjects();
    this.refreshInteractables();
    this.refreshQuestHud();
    this.sayInstructionAfter(offerLine);
  }

  /**
   * Say the current phase's instruction once `after` has finished being spoken.
   *
   * Chained on the line's own length rather than on a guessed delay: the offer
   * runs to six seconds, and an instruction laid over the top of it would be two
   * sentences at once — which for a child who is being read to is no sentences
   * at all.
   *
   * Which job it is, is decided *here* rather than when the timer fires. Six
   * seconds is long enough to run off and finish the phase — the hammer is a
   * short walk — and reading the instruction late meant reading whatever the
   * quest had moved on to, which `nextPhase` has already said. From the outside
   * that was the boy saying the same sentence twice, the second time over
   * whatever she was doing by then.
   */
  private sayInstructionAfter(after: string): void {
    const spoken = this.voice.get(after)?.duration ?? 0;
    const line = quests.instruction;
    if (!line) return;

    this.time.delayedCall((spoken + 0.9) * 1000, () => {
      // She may have walked through a door in the six seconds he was talking.
      if (this.leaving || !this.scene.isActive()) return;
      // Or done the job in them, in which case this sentence is out of date and
      // its replacement has already been spoken.
      if (quests.instruction !== line) return;
      this.bubble.say(line, this.speaking());
      this.syncVoiceHooks();
    });
  }

  /**
   * Everything this phase wants standing in this zone, and the light on it.
   *
   * Called on every zone build and on every phase change, and it is the only
   * thing that puts a quest object on screen — so "the stones appear when he asks
   * for them" and "the stones are still there when she comes back out of the
   * house" are one piece of code rather than two that have to agree.
   */
  private buildQuestObjects(): void {
    this.clearQuestObjects();

    const phase = quests.phase;
    if (!phase) return;

    const item = itemOf(phase);
    if (item && item.zone === this.zoneId && quests.itemWaiting) {
      this.lying = new GroundItem(this, item.id, item);
      this.shimmers.push(makeShimmer(this, this.lying.x, this.lying.y - TILE_SIZE / 2, 0xfff3b0));
    }

    for (const spot of rocksOf(phase)) {
      if (spot.zone !== this.zoneId) continue;
      const rock = new GemRock(this, spot, this.chips, this.sparkles);
      this.rocks.push(rock);
      // A cracked one is remembered as cracked and comes back cracked, which is
      // to say it does not come back at all. It is still built, so that "which
      // stones are out there" is one list and not two.
      if (!quests.rockWhole(spot.id)) rock.restoreBroken();
      else this.shimmers.push(makeShimmer(this, rock.x, rock.midY, GEM_ICONS[spot.id].tint));
    }

  }

  private clearQuestObjects(): void {
    for (const shimmer of this.shimmers) shimmer.destroy();
    this.shimmers = [];
    this.lying?.destroy();
    this.lying = null;
    // The rocks' own sprites go with the scene; only the list has to be dropped.
    this.rocks = [];
  }

  /** The row of slots, the yellow dot, and the bubble over the boy next door. */
  private refreshQuestHud(): void {
    this.questRow.show(quests.slots);

    const wants = this.npcs.find((npc) => quests.offerFrom(npc.id) !== null);
    if (wants && !this.marker) {
      this.marker = makeQuestMarker(this, wants.x, wants.y, wants.headHeight + HEAD_GAP + 26);
    } else if (!wants && this.marker) {
      this.marker.destroy();
      this.marker = null;
    }
    this.syncQuestHooks();
  }

  /**
   * Everything the green button reaches, in one list: the props, the people, the
   * doors you press rather than walk through, and anything the quest has left
   * lying about. Nearest wins, and the winner wears the dot. Trees and gem rocks
   * are not in here — see Interactable and `swing`.
   *
   * Rebuilt rather than built once, because the last of those four comes and goes
   * while the zone stands still.
   */
  private refreshInteractables(): void {
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
      ...(this.lying
        ? [
            {
              id: this.lying.id,
              x: this.lying.x,
              y: this.lying.y,
              // A prop's `y` is its middle and a thing lying in the grass has
              // its `y` at its foot, so the prop lift would put the dot on top
              // of the very thing it is pointing at — asked of the object, the
              // same way a person's is. See `Interactable.lift`.
              lift: ITEM_LIFT,
              press: () => this.pickUp(),
            },
          ]
        : []),
    ];

    hooks.interactables = this.interactables.map(({ id, x, y }) => ({ id, x, y }));
  }

  /**
   * Bend down and pick the thing up. It goes into the first empty box on the row
   * *and* into her hand.
   *
   * Auto-equipping is the whole reason the quest flows: she is four, and a tool
   * she has to go and find a second button for is a tool she does not have. The
   * blue button gets its practice the first time she wants the axe back, which is
   * a thing she will want and can therefore be trusted to work out.
   */
  private pickUp(): void {
    const item = this.lying;
    if (!item) return;

    item.collect();
    this.lying = null;
    this.refreshInteractables();

    toolBelt.give(item.id);
    toolBelt.hold(item.id);
    session.grant(item.id);
    this.toolRow.refresh();
    this.toolRow.bounce(toolBelt.heldSlot);
    this.syncToolHooks();

    playPickup();
    this.sparkles.explode(48, item.x, item.y - TILE_SIZE / 2);
    hooks.sparkles += 1;

    // She names it as she straightens up. One line and not two, even though this
    // also put a new tool in her hand: a pickup does not go through the blue
    // button, so the switch bark never gets a turn — the two paths are separate
    // by construction rather than by a flag one of them has to remember to set.
    this.bark(nameOf(item.id));

    const { complete } = quests.finish(item.id, false);
    if (complete) this.nextPhase();
    else this.syncQuestHooks();
  }

  /**
   * A phase is over. The celebration, then the new job.
   *
   * Generous on purpose, and the same size every time: from where she is sitting
   * finding the hammer and cracking the last stone are the same event — a thing
   * she was told to do, done.
   */
  private nextPhase(): void {
    playFanfare();
    this.sparkles.explode(90, this.player.x, this.player.y - 50);
    this.cameras.main.shake(220, 0.006);
    hooks.sparkles += 1;

    quests.advance();
    this.buildQuestObjects();
    this.refreshInteractables();
    this.refreshQuestHud();

    const line = quests.instruction;
    if (!line) return;
    // A beat, so the fanfare is not talked over — and long enough now to let the
    // bark that got her here finish first. A phase ends on a pickup or on a
    // stone coming open, and both of those are her saying the thing's name; the
    // longest of those names runs to a second, and an instruction laid over the
    // last syllable of one would clip a word she is being taught.
    this.time.delayedCall(1100, () => {
      if (this.leaving || !this.scene.isActive()) return;
      this.bubble.say(line, this.speaking());
      this.syncVoiceHooks();
    });
  }

  // --- the ritual ------------------------------------------------------------

  /**
   * Is she standing in the circle? Asked every frame, because the answer is what
   * decides who owns the face buttons.
   *
   * The first time it is yes, the spell starts: he asks for the first colour.
   * Every time after that it is just a light coming on — she may walk out and
   * back in as often as she likes and the sequence holds its place, because the
   * place is in the session store and not in this scene. It is not a timing
   * challenge and there is nothing here to lose.
   */
  private watchTheCircle(): void {
    const circle = this.circle;
    if (!circle) {
      this.inCircle = false;
      return;
    }

    // The ring is the cave's and is on the floor at all hours; what makes it
    // *live* is a ritual phase that names this zone. Any other time she walks
    // through a circle painted on some rock, which is what it is.
    const inside =
      quests.ritualZone === this.zoneId &&
      quests.step !== null &&
      circle.contains(this.player.x, this.player.y);
    circle.setLive(inside);
    if (inside === this.inCircle) return;
    this.inCircle = inside;
    if (!inside) return;

    // First arrival at the fire. `reachFire` is what makes that a fact about the
    // quest rather than about this visit, so the yellow button starts answering
    // with the colour he wants instead of "stand by the fire".
    if (quests.reachFire()) {
      playSparkleChime();
      this.sparkles.explode(24, circle.x, circle.y);
      hooks.sparkles += 1;
    }
    this.sayFrom(quests.giver, quests.step?.press ?? null);
    this.syncQuestHooks();
  }

  /**
   * The face buttons, while the spell has them.
   *
   * Green, red and blue are the spell's and nothing else's — no green dot, no
   * tool switching, no swing. Only here, only during this phase; two steps out
   * of the ring and every one of them means what it always meant. Yellow is
   * never taken, because "say it again" is exactly the thing a four-year-old
   * needs most in the middle of a sequence of three.
   */
  private handleRitual(button: Record<PadColorName, boolean>): void {
    // Whatever the green button would have opened, it is not opening it now.
    this.prompt.setVisible(false);

    const color = button.red ? 'red' : button.green ? 'green' : button.blue ? 'blue' : null;
    if (!color) return;

    unlockAudio();
    const answer = quests.press(color);
    if (!answer) return;
    if (answer.hit) this.ritualHit(answer.step, answer.complete);
    else this.ritualMiss(answer.step);
  }

  /**
   * The right button. The mark on the floor lights, and the stone that colour
   * belongs to leaves the row and goes into the fire.
   *
   * It flies from its own box along the bottom of the screen, which is where she
   * has just watched a dot light up — so the two halves of "that was the red one"
   * are one movement rather than two separate pieces of good news.
   */
  private ritualHit(step: RitualStep, complete: boolean): void {
    const circle = this.circle;
    if (!circle) return;

    playSparkleChime();
    const index = quests.slots.findIndex((slot) => slot.id === step.id);
    circle.light(index, padColor(step.id));
    this.refreshQuestHud();
    this.questRow.land(step.id);

    const icon = GEM_ICONS[step.gem];
    const from = this.questRow.slotAt(step.id);
    const camera = this.cameras.main;
    const landed = () => {
      if (!this.scene.isActive()) return;
      this.sparkles.explode(70, circle.x, circle.y);
      this.cameras.main.shake(180, 0.005);
      hooks.sparkles += 1;
      if (complete) this.summon();
      else this.sayFrom(quests.giver, quests.step?.press ?? null);
    };

    if (!from || !this.textures.exists(icon.file)) {
      landed();
      return;
    }

    // Welded to the camera for the same reason the gems flying the other way
    // are: the row it leaves is fixed to the screen, so the fire has to be
    // measured in screen space too or the stone lands where the cave used to be.
    const flying = this.add
      .image(from.x, from.y, icon.file, icon.slot)
      .setScrollFactor(0)
      .setScale(2)
      .setDepth(DEPTH.hud + 1);

    this.tweens.add({
      targets: flying,
      x: circle.x - camera.scrollX,
      y: circle.y - camera.scrollY,
      scale: WORLD_SCALE * 0.6,
      angle: 380,
      duration: 480,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        flying.destroy();
        landed();
      },
    });
  }

  /**
   * The wrong button. The fire spits, everybody laughs, and he says which one it
   * was again.
   *
   * Nothing else happens — no step lost, no stone back out of the fire, no
   * starting again. There is no wrong answer in this game, only an answer that
   * was funny; see CLAUDE.md, "No fail states". `retry` names the colour rather
   * than saying "no", because what she needs is the thing to go and do.
   */
  private ritualMiss(step: RitualStep): void {
    const circle = this.circle;
    playFizzle();
    playGiggle();
    if (circle) this.sparkles.explode(16, circle.x, circle.y - TILE_SIZE / 2);
    this.cameras.main.shake(120, 0.003);
    hooks.sparkles += 1;
    hooks.ritualMisses += 1;
    this.sayFrom(quests.giver, step.retry);
  }

  /**
   * The third stone goes in, and three faeries come out of the fire.
   *
   * The biggest thing that has ever happened in this game, and everything in it
   * is turned up: the longest noise, the widest burst, the hardest shake, and a
   * circle that stays lit afterwards because a spell that worked should look
   * like one. The quest is over at this instant — the phase moves, the hammer
   * goes back — and the three lines that follow are the celebration talking over
   * the top of a state that is already settled.
   */
  private summon(): void {
    const circle = this.circle;
    const at = circle ?? { x: this.player.x, y: this.player.y };

    playSummon();
    circle?.blaze();
    this.sparkles.explode(160, at.x, at.y);
    this.cameras.main.shake(520, 0.012);
    hooks.sparkles += 1;

    // Out of the fire, and not going home. From here on they are the session's,
    // not this zone's.
    session.summonFaeries();
    this.faeries?.destroy();
    this.faeries = new Faeries(this, at.x, at.y);

    // The quest is done. The hammer was lent, so it goes back — with a poof on
    // its own box, because a tool that simply was not there any more would be a
    // thing she lost rather than a thing she gave back.
    quests.advance();
    this.revokeTool('hammer');
    this.refreshQuestHud();
    this.refreshInteractables();
    this.syncQuestHooks();

    // And the coin. It goes into the *store* here, with the rest of the settled
    // state, so that walking out of the cave in the middle of the celebration
    // cannot cost her it — the row is drawn from the store every time a zone is
    // built, so it is on screen whichever way she leaves. What waits for the end
    // of the chain is only the flourish and the boy handing it over.
    const earned = session.addCoin();
    this.syncCoinHooks();

    // "Faeries. Real faeries!", then Hazel, then the thank-you, then the coin —
    // each one after the last has finished, on its own measured length. Four
    // sentences at once is no sentences at all.
    this.time.delayedCall(SUMMONING_BEAT, () => {
      if (!this.scene.isActive() || this.leaving) return;
      this.sayFrom('sneak', 'sneak_faeries_real');
      this.sayNext('sneak_faeries_real', 'hazel', 'hazel_pretty', () => {
        this.sayNext('hazel_pretty', 'sneak', 'sneak_thanks', () => {
          this.sayNext('sneak_thanks', 'sneak', 'sneak_coin', () => this.payUp(earned));
        });
      });
    });
  }

  /**
   * The coin, out of Sneak's hand and into the corner of the screen.
   *
   * Split off `summon` because the two halves happen a good six seconds apart:
   * the coin is *hers* the instant the spell works, and this is only the picture
   * of her being given it, thrown as he says the words so that the sentence and
   * the gold flying across the screen are one event rather than two — the same
   * arrangement a gem coming out of a stone has.
   *
   * `earned` is whether the store took it back at `summon`. It is false only if
   * she already had three, in which case this bounces one off a full pocket
   * instead — the honest picture of what just happened, and not a failure. The
   * store was told either way, so nothing here can get the count wrong.
   */
  private payUp(earned: boolean): void {
    const from = this.npcs.find((npc) => npc.id === 'sneak');
    if (!earned) {
      this.coinBouncesOff();
      return;
    }
    this.coinArrives(from ? { x: from.x, y: from.y - HEAD_GAP } : undefined);
  }

  /**
   * A coin, into her pocket.
   *
   * `from` is where in the world it came from — somebody's hand, usually — and
   * the coin is thrown from there to its box. Left out, the box simply lands,
   * which is what a coin with nowhere to have come from should do.
   *
   * **The full pocket is not a failure.** Three coins and a fourth offered means
   * the last box thumps, a coin bounces off it and falls away, and a bright
   * little noise says so. Nothing is taken, nothing is said, nothing is blocked
   * and there is no counter anywhere that has gone wrong — she has all three
   * coins, which is the best thing that can be true of her. See CLAUDE.md, "No
   * fail states", and `SessionState.addCoin`.
   *
   * Returns whether it landed, for the sake of a caller that wants to know.
   */
  private grantCoin(from?: { x: number; y: number }): boolean {
    const landed = session.addCoin();
    this.syncCoinHooks();
    if (landed) this.coinArrives(from);
    else this.coinBouncesOff();
    return landed;
  }

  /**
   * The picture of a coin arriving, with no bookkeeping in it.
   *
   * Its own method because the summoning needs the two halves apart: the coin is
   * hers the instant the spell works, and the flourish waits six seconds for the
   * boy to hand it over. Everywhere else the two happen together, which is what
   * `grantCoin` is.
   *
   * It fills the last box the store says is full, so it is right whether it runs
   * immediately or a chain of sentences later.
   */
  private coinArrives(from?: { x: number; y: number }): void {
    const index = session.coins - 1;
    const slot = this.coinRow.slotAt(index);
    const camera = this.cameras.main;

    const arrive = () => {
      this.coinRow.refresh(session.coins);
      this.coinRow.land(index);
      playCoin();
      hooks.sparkles += 1;
    };

    if (!from || !slot || !this.textures.exists(COIN_ICON.file)) {
      arrive();
      return;
    }

    // Thrown across the screen rather than through the world, for `takeGem`'s
    // reason: the row it is aimed at is welded to the camera, so the coin has to
    // be too, or it lands wherever the village has scrolled to.
    const flying = this.add
      .image(from.x - camera.scrollX, from.y - camera.scrollY, COIN_ICON.file, COIN_ICON.slot)
      .setScrollFactor(0)
      .setScale(WORLD_SCALE)
      .setDepth(DEPTH.hud + 1);

    this.tweens.add({
      targets: flying,
      x: slot.x,
      y: slot.y,
      scale: 2,
      angle: 380,
      duration: 520,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        flying.destroy();
        if (!this.scene.isActive()) return;
        arrive();
      },
    });
  }

  /** And the picture of one she had no room for. Happy, and over in a second. */
  private coinBouncesOff(): void {
    playCoinBounce();
    this.coinRow.bounceOff();
  }

  /**
   * Take back a tool a quest lent her, with a sparkle-poof on its box.
   *
   * The belt puts the light back on the axe by itself — see `ToolBelt.take` — so
   * if she was holding the hammer she is holding the axe by the time this
   * returns, which is the only sensible place for it to have gone.
   */
  private revokeTool(tool: ToolId): void {
    const slot = toolBelt.slots.indexOf(tool);
    if (slot < 0) return;

    const box = this.toolRow.slotAt(slot);
    if (box) {
      // Fixed to the screen, like the row it is over.
      const poof = this.add
        .particles(box.x, box.y, 'spark', {
          speed: { min: 60, max: 190 },
          angle: { min: 0, max: 360 },
          scale: { start: 1, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 300, max: 700 },
          blendMode: 'ADD',
          tint: [0xfff3b0, 0xd9b8ff, 0xffffff],
          emitting: false,
        })
        .setScrollFactor(0)
        .setDepth(DEPTH.hud + 2);
      poof.explode(34);
      this.time.delayedCall(900, () => poof.destroy());
    }

    toolBelt.take(tool);
    session.ungrant(tool);
    this.toolRow.refresh();
    this.toolRow.bounce(toolBelt.heldSlot);
    this.syncToolHooks();
  }

  /**
   * Somebody in this zone says a line, out of their own mouth.
   *
   * Falls back to her own balloon if whoever it is has walked off or was never
   * here — a line with nobody to say it is still a line she needs to hear, and
   * silence is the one answer this game may not give.
   */
  private sayFrom(npcId: string | null, line: string | null): void {
    if (!line) return;
    unlockAudio();
    const who = npcId ? this.npcs.find((npc) => npc.id === npcId) : undefined;
    if (who) {
      who.lookAt(this.player.x, this.player.y);
      this.bubble.say(line, { id: who.id, x: who.x, y: who.y });
      this.syncNpcHooks();
    } else {
      this.bubble.say(line, this.speaking());
    }
    this.syncVoiceHooks();
  }

  /** The same, once `after` has finished being spoken. See `sayInstructionAfter`. */
  private sayNext(after: string, npcId: string, line: string, then?: () => void): void {
    const spoken = this.voice.get(after)?.duration ?? 0;
    this.time.delayedCall((spoken + 0.5) * 1000, () => {
      if (this.leaving || !this.scene.isActive()) return;
      this.sayFrom(npcId, line);
      then?.();
    });
  }

  /** The stone comes open, and what was in it flies to its box on the row. */
  private takeGem(rock: GemRock): void {
    const id = rock.id;
    // Named as it comes out of the stone, so the word and the green thing flying
    // across the screen are one event rather than two.
    this.bark(nameOf(id));

    const { complete } = quests.finish(id);
    this.syncQuestHooks();

    const icon = GEM_ICONS[id];
    const slot = this.questRow.slotAt(id);
    const camera = this.cameras.main;

    if (!slot || !this.textures.exists(icon.file)) {
      this.refreshQuestHud();
      if (complete) this.nextPhase();
      return;
    }

    // Thrown across the screen rather than through the world: the row it is
    // aimed at is welded to the camera, so the gem has to be too, or it lands
    // wherever the village happens to have scrolled to.
    const flying = this.add
      .image(rock.x - camera.scrollX, rock.midY - camera.scrollY, icon.file, icon.slot)
      .setScrollFactor(0)
      .setScale(WORLD_SCALE)
      .setDepth(DEPTH.hud + 1);

    this.tweens.add({
      targets: flying,
      x: slot.x,
      y: slot.y,
      scale: 2,
      angle: 340,
      duration: 520,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        flying.destroy();
        if (!this.scene.isActive()) return;
        this.refreshQuestHud();
        this.questRow.land(id);
        playSparkleChime();
        if (complete) this.nextPhase();
      },
    });
  }

  /**
   * Smoke off a campfire, wherever one is standing.
   *
   * Keyed off the picture rather than off the zone, so the fire in the wood and
   * the fire in the cave get the same treatment without either being named here
   * — the same idea as `glow` on a catalog image, one layer up. Thin, slow and
   * grey: a fire that puffed would be a bonfire, and this is a campfire.
   */
  private addSmoke(prop: Prop): void {
    if (prop.def.key !== 'campfire' || !prop.sprite) return;

    this.add
      .particles(prop.x, prop.y - TILE_SIZE * 0.7, 'spark', {
        x: { min: -6, max: 6 },
        speedY: { min: -34, max: -16 },
        speedX: { min: -10, max: 10 },
        scale: { start: 0.45, end: 1.5 },
        alpha: { start: 0.3, end: 0 },
        lifespan: { min: 1500, max: 2800 },
        frequency: 320,
        tint: [0x9c8f8a, 0x6f6560, 0xb9aca6],
      })
      // Above the flame it comes off, and below anything standing in front of
      // it: smoke is not something she can walk behind.
      .setDepth(prop.y + 1);
  }

  private poke(prop: Prop): void {
    // The bed is the one prop that asks something rather than only answering.
    // The first press is an ordinary poke and says her sleepy line; a second
    // press *while that line is still in the air* is the yes — the same
    // second-press-is-acceptance grammar the quest offers use, because it is the
    // only ceremony a four-year-old can be asked for. Nothing else can put that
    // line on screen, so "is the offer up" needs no flag of its own; walking out
    // of reach or letting it time out is the no, and so is the red button. See
    // `cancelSleep`.
    if (prop === this.bed && this.sleepOffered) {
      this.goToSleep();
      return;
    }

    nudgeProp(this, prop);
    this.faeries?.cheer();

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

  // --- the evening -----------------------------------------------------------

  /**
   * Push the light to wherever the clock says it is.
   *
   * Called every frame and also the instant anything jumps the clock, which is
   * what makes the test hook honest: the suite warps eight minutes forward and
   * the very next reading is of a village at dusk, rather than of a village that
   * will be at dusk once it has had a frame.
   *
   * Two things get told, and they are both idempotent: the sheet of blue over
   * the world, and the lamps standing in it. The lamps are told even indoors,
   * where the answer is always zero, because the cave's torches are `glow`
   * pictures too and "the cave keeps its current look" is exactly what telling
   * them nothing achieves — see `isOutdoors`.
   */
  private applyDusk(): void {
    const level = isOutdoors(this.zoneId) ? dayClock.dusk : 0;
    this.dusk?.setLevel(level);
    this.world?.setDusk(level);
    this.syncDayHooks();
  }

  private syncDayHooks(): void {
    hooks.day = {
      elapsed: Math.round(dayClock.elapsedMs),
      dusk: this.dusk?.dusk ?? 0,
      outdoors: isOutdoors(this.zoneId),
      fireflies: this.dusk?.flyCount ?? 0,
      lamps: this.world?.lightCount ?? 0,
      lampGlow: this.world?.lightLevel ?? 0,
      dadCalled: dayClock.dadCalled,
    };
  }

  /**
   * Dad, calling her in from indoors, once the light starts going.
   *
   * He is a voice and not a person: there is no Dad standing in the world and
   * this prompt is explicit that there is not going to be one today. So the
   * balloon is anchored at the front door — the words come out of the *house* —
   * and it is his voice rather than hers, which is the one place the narrative
   * rule in CLAUDE.md does not apply, because this is somebody actually talking.
   *
   * Asked every frame and nearly always a no. Four things have to be true, and
   * each of them is a different kind of restraint:
   *
   *  - the light has started going, and he has not called yet today — the latch
   *    lives on the clock rather than here, because dusk can arrive while she is
   *    down the cave and the call belongs to the yard she comes back up into;
   *  - she is outdoors, so there is a house to be called from. Indoors he simply
   *    waits, and calls on the evening she next steps out;
   *  - nobody is mid-sentence. He is the only thing in the game that speaks
   *    without being asked to, so he is also the only thing that could talk over
   *    a line she was listening to;
   *  - and it is not a nag, which is the whole of the last one: once a day.
   */
  private dadCallsHer(): void {
    if (this.leaving || !dayClock.isDusk || dayClock.dadCalled) return;
    if (!isOutdoors(this.zoneId)) return;
    if (this.bubble.lineId !== null) return;

    const door = this.doorways.find((d) => d.def.to === 'house');
    if (!door) return;
    // And there is something to *show*. The manifest is still loading for the
    // first second of a page and may never arrive at all — the game plays on
    // mute either way — and a call spent while there were no words to put on
    // screen would be a call she never got. The latch is burnt below this line
    // on purpose.
    if (!this.voice.get(DAD_BEDTIME)) return;

    dayClock.dadCalls();
    unlockAudio();
    this.bubble.say(DAD_BEDTIME, { id: 'dad', x: door.x, y: door.y });
    this.syncVoiceHooks();
    this.syncDayHooks();
  }

  // --- going to bed ----------------------------------------------------------

  /**
   * Is the bed's question still on the table?
   *
   * Read off the balloon rather than kept in a flag, and that is what makes
   * every way of saying no free. Walking away takes the green dot off the bed,
   * so the button cannot reach it; poking anything else replaces the line;
   * letting it run out clears it by itself. There is nothing to remember to
   * unset, so there is nothing that can be left set — which for a mechanic that
   * ends the day is worth more than the flag would have cost.
   */
  private get sleepOffered(): boolean {
    const line = this.bed?.def.line;
    return line !== undefined && this.bubble.lineId === line;
  }

  /**
   * The red button, while the bed is asking. Never mind, then.
   *
   * The only thing red does anywhere outside the spell circle, and it is
   * deliberately quiet: the balloon popping away is the whole of the answer, and
   * a noise on top of it would make backing out sound like a thing that went
   * wrong. Nothing happened, which here is the correct amount to have happened.
   */
  private cancelSleep(): void {
    if (!this.sleepOffered) return;
    this.bubble.stop();
    this.syncVoiceHooks();
  }

  /**
   * She said yes. The day ends.
   *
   * Four beats and a seam. `playNightfall` takes the light out of the room and
   * puts a sky up; she says what her day was, over the stars; and at the darkest
   * moment — a flat sheet of one colour, with nothing on screen that could show
   * a join — the day is swept and this zone is rebuilt from the empty store it
   * leaves behind. The zone on the far side opens on the same sheet of the same
   * colour and comes up into morning. See `world/nightfall.ts`, and
   * `state/sleep.ts` for what a night actually clears.
   *
   * **The recap is decided here, before any of that runs.** A night wipes the
   * store, and the store is the only record of what the day was — so the last
   * possible moment to ask is the first line of this method, and asking a line
   * later would be asking a day that has already been deleted. The lines
   * themselves are chosen by `recapFor` and paced by `sayRecap`; nothing about
   * either is in flight yet when this is written down.
   *
   * She is handed back to herself standing exactly where she went to bed, which
   * is beside the bed, because that is the only place this can have been pressed
   * from. `leaving` is the latch: from here she is not driving, doorways are
   * deaf, and every delayed line already in flight checks it and gives up.
   */
  private goToSleep(): void {
    if (this.leaving) return;
    this.leaving = true;
    hooks.transitioning = true;
    hooks.sleeps += 1;

    // Read off the store while there is still a day in it.
    const recap = recapFor(snapshotDay());
    hooks.recap = [...recap];

    this.bubble.stop();
    this.prompt.setVisible(false);
    this.stickHint?.dismiss();
    this.syncVoiceHooks();

    const wakeAt = { x: this.player.x, y: this.player.y, facing: 'down' as const };

    playNightfall(
      this,
      { x: this.player.x, y: this.player.y, sparkles: this.sparkles },
      {
        onSky: () => this.sayRecap(recap),
        onDark: () => {
          // Everything a day is kept in, gone — store, belt, offer counters and
          // the clock. The picture catches up by being built again from scratch,
          // which is the same thing a doorway does and is why the wood regrows
          // and the thought bubble comes back over his head without a line of
          // code apiece.
          nightPasses();
          this.scene.restart({
            voice: this.voice,
            room: this.zoneId,
            map: this.mapData,
            waking: true,
            wakeAt,
          } satisfies RoomSceneData);
        },
      },
    );
  }

  /**
   * Her day, said out loud over the starfield. Returns how long that will take.
   *
   * Every line is scheduled up front off the clip lengths the voice bank already
   * knows, rather than each one being started by the one before it finishing.
   * Chaining would be the obvious shape and it is the wrong one here: the night
   * has to be told how long to hold *before* the first word is spoken, and a
   * chain cannot answer that until it is over.
   *
   * The balloon is lifted over the night curtain for the duration. It is welded
   * to the screen and the curtain is a flat sheet above the whole game — see
   * `world/nightfall.ts` — so a balloon at its usual depth would be a sentence
   * spoken behind the sky. Nothing puts it back, and nothing needs to: this
   * scene is a few seconds from being restarted from scratch.
   */
  private sayRecap(lines: string[]): number {
    this.bubble.setDepth(CURTAIN_DEPTH + 3);

    let at = RECAP_LEAD;
    for (const line of lines) {
      const when = at;
      this.time.delayedCall(when, () => {
        if (!this.scene.isActive()) return;
        // Hers, over her own head — she is the one remembering. The camera has
        // not moved since she lay down, so "over her head" is still somewhere on
        // screen even though she herself is behind a night sky.
        this.bubble.say(line, this.speaking());
        this.syncVoiceHooks();
      });
      at += (this.voice.get(line)?.duration ?? RECAP_FALLBACK_SECONDS) * 1000 + RECAP_GAP;
    }

    // The last gap is not a gap, it is the tail.
    return at - RECAP_GAP + RECAP_TAIL;
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
   * Everything that happens to the thing hit is that thing's business; the two
   * `land` methods pick the noise and shake the camera by how big a thing just
   * happened.
   *
   * **The wrong tool still swings and still connects.** A hammer in a tree and
   * an axe on a stone both land a real blow that does no damage — the thing
   * wobbles, sheds what it sheds, and is exactly as it was. That is not a
   * punishment and not a hint: everything in this world answers when it is hit,
   * and a swing that produced silence would read as a game that had stopped
   * working. See CLAUDE.md, "No fail states".
   */
  private swing(): void {
    const tool = toolBelt.held;
    if (tool !== 'axe' && tool !== 'hammer') return;

    const target = this.nearestTarget();
    const swung = this.player.chop(
      tool === 'axe' ? 'chop' : 'hammer',
      target ? this.directionTo(target.x, target.y) : this.player.facing,
      () => {
        if (target instanceof Tree) this.landOnTree(target, tool === 'axe');
        else if (target) this.landOnRock(target, tool === 'hammer');
      },
      () => this.syncPlayerHooks(),
    );
    if (!swung) return;

    hooks.swings += 1;
    // A whiff answers quietly. The blow has its own noise and it lands a frame
    // and a half from now, so a whoosh under it would only muddy it.
    if (!target) playWhoosh();
  }

  /**
   * What the swing would connect with, or null for a whiff.
   *
   * Trees and gem rocks in one pool, because from where she is standing they are
   * the same kind of thing — something you hit — and picking the nearer of two
   * pools separately would let her swing at a tree four tiles away while standing
   * on top of a stone. Same reach and same nearest-wins rule as the dot, so
   * "close enough to press" and "close enough to hit" are one distance.
   *
   * Which *tool* she is holding is deliberately not part of this. Aiming that
   * skipped the stones while she had the axe out would mean the axe swung at
   * nothing over a stone she is standing next to, and "nothing happened" is the
   * one answer this game may never give.
   */
  private nearestTarget(): Tree | GemRock | null {
    const standing: (Tree | GemRock)[] = [
      ...this.trees.filter((tree) => tree.state !== 'gone'),
      ...this.rocks.filter((rock) => !rock.broken),
    ];

    let best: Tree | GemRock | null = null;
    let bestDistance = INTERACT_RADIUS;

    for (const thing of standing) {
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

  /** The moment a tool is in the wood. `bites` is false for anything but the axe. */
  private landOnTree(tree: Tree, bites: boolean): void {
    const before = tree.state;
    const what = tree.whack(bites);
    if (!what) return;

    hooks.whacks += 1;
    // The hammer, in a tree. The blow is unchanged — it lands, the trunk shakes,
    // it sheds leaves — and she names the tool that would have felled it. That
    // is the difference between "nothing happened" and a game that told her what
    // to go and do, and it is a hint in her own voice rather than a buzzer: see
    // CLAUDE.md, "No fail states".
    if (!bites) this.bark(NEEDS.axe);

    if (what === 'shake') {
      // Escalating, and the sound escalates with it. `before` rather than a
      // count of its own: an unchoppable tree is always on its first blow, and
      // that is exactly what it should keep sounding like.
      playChopThunk(before === 'stump' ? 1 : 0);
      this.cameras.main.shake(110, bites && tree.choppable ? 0.004 : 0.0025);
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

    // Written down on every blow, not only on the ones that change its shape, so
    // a tree she hit twice and walked away from is still two blows in when she
    // comes back through the door.
    session.rememberTree(this.zoneId, tree.def.id, tree.memory);
    this.syncTreeHooks();
  }

  /** The moment a tool is on the stone. `cracks` is false for anything but the hammer. */
  private landOnRock(rock: GemRock, cracks: boolean): void {
    const what = rock.whack(cracks);
    if (!what) return;

    hooks.whacks += 1;
    // And the same sentence from the other end: the axe on a stone.
    if (!cracks) this.bark(NEEDS.hammer);

    if (what === 'shake') {
      playRockCrack(0);
      this.cameras.main.shake(110, cracks ? 0.004 : 0.0025);
      this.syncQuestHooks();
      return;
    }

    playGemBreak();
    this.cameras.main.shake(300, 0.009);
    hooks.sparkles += 1;
    this.takeGem(rock);
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
    // And what she is collecting, along from it. Hidden until a phase wants
    // something; see QuestRow.
    this.questRow = makeQuestRow(this);
    // And what she has kept, on the shelf above the tools. Always on screen,
    // empty boxes and all, and drawn from the store rather than from the scene:
    // a coin outlives the zone it was earned in and outlives the night as well.
    this.coinRow = makeCoinRow(this);
    this.coinRow.refresh(session.coins);

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
