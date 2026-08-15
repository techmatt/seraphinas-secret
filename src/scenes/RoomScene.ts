import Phaser from 'phaser';
import {
  playChopThunk,
  playCoin,
  playCoinBounce,
  playFanfare,
  playFizzle,
  playGemBreak,
  playGiggle,
  playPageTurn,
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
import {
  gatheredBy,
  itemOf,
  lureOf,
  pickupsOf,
  readingOf,
  rocksOf,
  walkToOf,
  type Gathered,
  type QuestPen,
  type QuestSpot,
  type RitualStep,
} from '../quest/Quest';
import { quests } from '../quest/QuestEngine';
import { bookById } from '../../content/books';
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
import {
  BOOK_ICON,
  CARROT_WORLD,
  COIN_ICON,
  GEM_ICONS,
  registerBookArt,
  TOOL_ICONS,
  type IconDef,
} from '../ui/toolIcons';
import { BookReader } from '../ui/BookReader';
import { SpeechBubble, type Speaker } from '../ui/SpeechBubble';
import { NEEDS, nameOf } from '../voice/barks';
import { VoiceBank } from '../voice/VoiceBank';
import {
  Character,
  characterArtLoaded,
  preloadCharacter,
  registerCharacterAnims,
} from '../world/Character';
import { Bunny, preloadBunnies, registerBunnyAnims, type Roam } from '../world/Bunny';
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
import { makeLeafEmitter, TINY_TREE, Tree } from '../world/Tree';
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

/**
 * The two ways the lure phase says no, and the two Hazel says how-many.
 *
 * Both refusals are hers rather than Hazel's, because neither is somebody
 * talking to her: they are the world answering a button, which is the narrative
 * voice rule in CLAUDE.md. The counting pair is Hazel's, because she is standing
 * at the den watching them arrive — and it is indexed by how many are home, so
 * one bunny in means "two more" and there is no third entry, because the third
 * one home is not a count, it is the end.
 */
const BUNNY_ONE_AT_A_TIME = 'seraphina_one_bunny';
const BUNNY_NEEDS_CARROT = 'seraphina_need_carrot';
const BUNNIES_LEFT = ['hazel_two_more', 'hazel_one_more'];

/** The last two things anybody says about the bunnies. Hers, at the den. */
const HAZEL_HOME = 'hazel_bunnies_home';
const HAZEL_COIN = 'hazel_bunny_coin';

/** ...and the last two about the story. Hers too, on the rug. */
const HAZEL_HUG = 'hazel_story_hug';
const HAZEL_STORY_COIN = 'hazel_story_coin';

/**
 * What a `gather` phase's things are drawn as, keyed by the one word the quest
 * uses for them.
 *
 * The game's side of the fence: a quest says it is gathering carrots and this is
 * where a carrot becomes a picture. The same string picks the box on the quest
 * row (`KIND_ICONS`) and the word she says as she straightens up (`nameOf`), so
 * a new thing to pick up is an entry here, an entry there, and a line in
 * `lines.json`.
 */
const GATHER_ART: Record<Gathered, IconDef> = {
  carrot: CARROT_WORLD,
  storybook: BOOK_ICON,
};

/** What clears a prop: half its picture and a bit. */
const DOT_LIFT = 58;

/** What clears a person: their own height, and a bit. */
const HEAD_GAP = 34;

/** What clears a one-tile thing lying in the grass: its own tile, and a bit. */
const ITEM_LIFT = TILE_SIZE + 30;

/** What clears a bunny, which is about half a tile of animal. */
const BUNNY_LIFT = TILE_SIZE * 0.9;

/**
 * How long the celebration at the end of the quest runs before the next thing
 * anybody says. Long, on purpose: the summoning is the biggest moment in the
 * game and the first sentence over the top of it would take the size off it.
 */
const SUMMONING_BEAT = 1200;

/**
 * How close she has to get to the den before the bunny at her heels is home, in
 * tiles.
 *
 * Generous. There is nothing standing at the den to walk up to — it is a spot in
 * a wood with a light on it and Hazel beside it — so "arrived" has to be a
 * circle rather than a doorstep, and a circle a four-year-old can miss is a
 * circle she will walk through three times wondering why nothing happened.
 */
const DEN_REACH = 1.8;

/**
 * How far a loose bunny will hop from the ring it came out of, in tiles.
 *
 * A little wider than the pen, so they read as *out* — and no wider, because a
 * bunny that wandered off across the wood would be a thing she has to look for,
 * and looking for one is what the carrots are.
 */
const LOOSE_LEASH = 3.4;

/** ...and how far one settled at the den will drift from it. Barely at all. */
const DEN_ROAM = 1.1;

/**
 * The pen's own light: how big a pool each tree gets, and how much of it.
 *
 * Under a third of the objective shimmer's radius and half its brightness. It
 * says "these trees" rather than "this one thing", which is a different sentence
 * and has to be said more quietly — sixteen objective shimmers in a five-tile
 * ring would be a bonfire.
 */
const PEN_GLOW = { radius: 34, alpha: 0.26 };

/** The pen's twinkle: how many particles come off the one tree whose turn it is. */
const PEN_TWINKLE = 2;

/**
 * What the three lights of the second quest are tinted.
 *
 * A carrot's own orange, so the pool of light on the grass is the colour of the
 * thing standing in it — the gems' arrangement, which is the whole of how "the
 * green one" works. The pen and the den share a soft green: the pen because a
 * ring of trees glowing orange would be a ring of trees on fire, and the den
 * because it is where the wood takes them back.
 */
const CARROT_TINT = 0xff9d3c;
const PEN_TINT = 0xa8e86b;
const DEN_TINT = 0x8fe0a0;

/**
 * ...and the light on the rug where the story happens: lamplight rather than a
 * colour, because the reading nook is the one objective in the game that is a
 * place indoors and a green pool on a red rug would be a puddle.
 */
const NOOK_TINT = 0xffd9a0;

/**
 * The beat between the book closing and Hazel saying what she thought of it.
 *
 * Shorter than the summoning's, because there is nothing to watch: the book
 * folds away and the room is back, and a second of an empty living room before
 * anybody speaks would read as the game having stopped.
 */
const STORY_BEAT = 600;

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
  /** The things a `gather` phase has left lying about. Same idea, several of them. */
  private pickups: GroundItem[] = [];
  private shimmers: Shimmer[] = [];
  /**
   * Everybody with a cloud over their head. A list, because there are two
   * quests and neither has been taken until one of them has — see `quests.ts`.
   */
  private markers: QuestMarker[] = [];

  /**
   * The ring of trees a quest planted, and the light on each of them.
   *
   * Kept apart from `trees` and `shimmers` — which they are also in — because
   * those two are rebuilt on every phase change and the pen is not: it goes up
   * on the press that takes the job and stands until the night. See `buildPen`.
   */
  private penTrees: Tree[] = [];
  private penGlows: { tree: Tree; glow: Shimmer }[] = [];
  /** Which pen tree twinkles next. One at a time, round the ring. */
  private penTwinkle = 0;

  /** Three bunnies, penned, loose, following her or home. See Bunny. */
  private bunnies: Bunny[] = [];
  private circle: SpellCircle | null = null;
  /** True while she is standing inside it — which is while it owns the buttons. */
  private inCircle = false;

  /**
   * The book on the rug: the thing the green button opens during a reading
   * phase. A GroundItem like a carrot, and deliberately not picked up — the
   * press opens it where it lies.
   */
  private storybook: GroundItem | null = null;
  /** The takeover it opens into. One per scene, hidden until it is. */
  private reader!: BookReader;

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
    this.pickups = [];
    this.shimmers = [];
    this.markers = [];
    this.penTrees = [];
    this.penGlows = [];
    this.penTwinkle = 0;
    this.bunnies = [];
    this.circle = null;
    this.inCircle = false;
    this.storybook = null;
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
    // One sheet, queued everywhere. A quest can put bunnies in any zone and the
    // scene has no way of knowing which before the map is up, so the cheapest
    // honest answer is to always have the picture.
    preloadBunnies(this);
    this.preloadBookPages();
    if (this.mapData) TileWorld.preload(this, this.mapData);
  }

  /**
   * The pictures of whatever book the quest she is on is about.
   *
   * Queued for the *whole* quest rather than only for the phase that reads it,
   * because the reading phase begins without a zone rebuild — she walks across
   * one room to get to it — and a preload that waited for the phase would never
   * run. Queued only while that quest is on, because the files may not be there:
   * `content/books/` says the pictures are Matt's to drop in later, so until he
   * does, this is four requests that miss, and four is worth paying inside the
   * one quest that wants them rather than on every doorway in the game.
   *
   * A miss costs nothing else. Phaser logs the failure and carries on, and the
   * reader draws its placeholder card for any page whose texture never arrived.
   */
  private preloadBookPages(): void {
    const spec = quests.active?.phases
      .map((phase) => readingOf(phase))
      .find((reading) => reading !== null);
    if (!spec) return;

    const book = bookById(spec.book);
    for (const page of book?.pages ?? []) {
      if (this.textures.exists(page.image)) continue;
      this.load.image(page.image, page.image);
    }
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
    // interactable list, because a thing lying in the grass is in it — and the
    // pen before both, because its trees are solid and she is about to be stood
    // somewhere that has to not be inside one.
    registerBunnyAnims(this);
    // The book spread's named sub-frame, before anything that draws from it —
    // the storybook lying on the rug and its box on the quest row are both put
    // out below, and a frame nobody registered draws the whole sheet.
    registerBookArt(this);
    this.buildPen();
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
        this.twinklePen();
      },
    });

    // The bubble belongs to whoever is talking, which for now is always
    // Seraphina, so it anchors to the player.
    this.bubble = new SpeechBubble(this, this.player.x, this.player.y, this.voice);
    // The book is built with the zone and hidden until she opens one. It is a
    // takeover, so it is welded to the camera and knows nothing about the world
    // behind it — see `ui/BookReader.ts`.
    this.reader = new BookReader(this, this.voice);
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
    // And the same standing-in for a job already done today.
    //
    // Hazel carries two of the three quests and one head has one thought bubble,
    // so her second job — the story — is only ever on offer on an afternoon the
    // bunnies are already home. That afternoon costs a minute and a half to play
    // through honestly, and `quest.spec` already plays it; a test about the book
    // would be paying for the wood again to reach the shelf. This writes the
    // morning down without living it, the way `grantCoin` hands over a coin
    // nothing earned. See `QuestEngine.offerFrom`.
    hooks.finishQuest = (id) => {
      session.completeQuest(id);
      this.refreshQuestHud();
    };
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

    if (this.reader.isOpen) {
      // The book has the screen and every button on the pad. Nothing about the
      // world is asked and nothing about the world answers — she is not standing
      // anywhere she can walk out of, and a doorway that fired while she was
      // being read to would take the story away. The day below carries on.
      this.player.setMoving(false);
      this.handleBook(button);
      this.reader.tick(delta);
    } else if (!this.leaving) {
      // She steers through the swing. There is no moment in this game where the
      // stick does nothing: the blow was aimed when the swing started and moving
      // does not retarget or cancel it, so letting her walk costs the chop
      // nothing and buys back the only half-second the game ever took off her.
      this.movePlayer(seconds, pad);
      this.checkDoorways();
      this.watchTheCircle();
      this.watchQuestSpots();

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
    for (const bunny of this.bunnies) bunny.update(delta, this.player);
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
    this.syncVoiceHooks();
    this.syncBookHooks();
    // Where the three of them are, or an empty list when they have not been
    // summoned. The only honest way to ask "are they still with her" after a
    // doorway, which is the whole claim they exist to make.
    hooks.faeries = this.faeries?.positions ?? [];
    // And where the bunnies are, and what each is doing. Every frame, because
    // three of the four things a bunny can be doing involve moving.
    hooks.bunnies = this.bunnies.map((b) => ({ id: b.id, x: b.x, y: b.y, state: b.state }));
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

  /**
   * Whose words are on screen: the balloon's, or the open book's page.
   *
   * The balloon wins whenever it has anything, because a balloon over the book
   * is somebody actually talking — Hazel, delighted, as a page turns — and the
   * page underneath is not being read at that moment. The book only answers
   * while it is reading itself, so "is anybody talking" stays one question with
   * one answer and `waitForQuiet` means the same thing inside a book as out.
   */
  private get wordsOnScreen(): {
    lineId: string | null;
    spokenWords: string[];
    highlightedIndex: number;
  } {
    if (this.bubble.lineId !== null) return this.bubble;
    return this.reader?.isOpen ? this.reader : this.bubble;
  }

  /** update() does this every frame, but a paused scene has no frames. */
  private syncVoiceHooks(): void {
    const said = this.wordsOnScreen;
    hooks.voice.lineId = said.lineId;
    hooks.voice.words = said.spokenWords;
    hooks.voice.highlighted = said.highlightedIndex;
    this.syncBubbleHooks();
  }

  /**
   * The book, from the outside.
   *
   * Its own object rather than more fields on `quest`, because the reader is not
   * the quest: a page being turnable is a fact about a sentence having finished,
   * and which page she is on is the *quest's* progress read back. A test that
   * could only see the quest could not tell "the page is still reading" from
   * "green did nothing", which is the one rule of this screen.
   */
  private syncBookHooks(): void {
    const reader = this.reader;
    hooks.book = {
      open: reader?.isOpen ?? false,
      id: reader?.bookId ?? null,
      page: reader?.page ?? 0,
      pages: reader?.pages ?? 0,
      reading: reader?.reading ?? false,
      turnable: reader?.turnable ?? false,
      turns: reader?.turns ?? 0,
      line: reader?.current?.line ?? null,
      words: reader?.spokenWords ?? [],
      highlighted: reader?.highlightedIndex ?? -1,
    };
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
      /**
       * Everybody in this zone wearing a thought bubble right now, and how many
       * are actually built. A list because there are two quests: two of them
       * before either is taken, none at all while one is running, and whatever
       * she has not done yet again the moment it is finished.
       */
      offers: this.npcs.filter((npc) => quests.offerFrom(npc.id) !== null).map((n) => n.id),
      markers: this.markers.length,
      slots: quests.slots.map((slot) => ({ ...slot })),
      held: [...quests.held],
      /** The bunny at her heels, or null. Never more than one. */
      following: quests.following,
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
        ...(this.storybook
          ? [
              {
                id: this.storybook.id,
                x: this.storybook.x,
                y: this.storybook.y,
                broken: false,
              },
            ]
          : []),
        ...this.pickups.map((carrot) => ({
          id: carrot.id,
          x: carrot.x,
          y: carrot.y,
          broken: false,
        })),
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
    for (const marker of this.markers) marker.destroy();
    this.markers = [];
    this.sparkles.explode(60, this.player.x, this.player.y - 40);
    hooks.sparkles += 1;

    // A quest may bring its own furniture with it. The pen goes up on this
    // press and not before — she has to be able to walk that clearing all
    // morning and find nothing in it.
    this.buildPen();
    this.moveGuestsIn();
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
      // Or opened the book, which is the one thing an instruction may never be
      // spoken over: the page is reading itself, and two voices at once is no
      // voice at all. The sentence is lost rather than queued — it was telling
      // her to do the thing she is now doing.
      if (this.reader.isOpen) return;
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
      this.lying = new GroundItem(this, item.id, TOOL_ICONS[item.id], item);
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

    // The carrots — or the storybook, which is the same phase with a different
    // noun in it. The stones' arrangement exactly, minus the hammer: one that
    // has been picked up is simply not built, because there is nothing left of
    // it to see — where a cracked stone still has its own broken picture.
    const of = gatheredBy(phase);
    for (const spot of pickupsOf(phase)) {
      if (spot.zone !== this.zoneId || !quests.waiting(spot.id) || !of) continue;
      const lying = new GroundItem(this, spot.id, GATHER_ART[of], spot);
      this.pickups.push(lying);
      this.shimmers.push(
        makeShimmer(
          this,
          lying.x,
          lying.y - TILE_SIZE / 2,
          of === 'storybook' ? NOOK_TINT : CARROT_TINT,
        ),
      );
    }

    // And the book, lying open on the rug where the two of them are sitting.
    // She is carrying it — this is her putting it down to read it — so it is a
    // place with a picture on it rather than a thing to collect, and the green
    // button opens it rather than picking it up. See `openBook`.
    const reading = readingOf(phase);
    if (reading && reading.zone === this.zoneId) {
      const spot = { id: 'storybook', zone: this.zoneId, x: reading.x, y: reading.y };
      this.storybook = new GroundItem(this, spot.id, BOOK_ICON, spot);
      this.shimmers.push(
        makeShimmer(this, this.storybook.x, this.storybook.y - TILE_SIZE / 2, NOOK_TINT),
      );
    }

    // And the den, which is a place rather than a thing — so the only mark on it
    // is the light, and Hazel standing in it.
    const lure = lureOf(phase);
    if (lure && lure.den.zone === this.zoneId) {
      this.shimmers.push(
        makeShimmer(this, lure.den.x * TILE_SIZE, lure.den.y * TILE_SIZE, DEN_TINT),
      );
    }

    // The walk out to the pen: the ring's own trees glow all quest long, and
    // this is the brighter light in the middle of them that says *that* is where
    // she is going. It goes when the phase does.
    const walk = walkToOf(phase);
    if (walk && walk.zone === this.zoneId) {
      this.shimmers.push(makeShimmer(this, walk.x * TILE_SIZE, walk.y * TILE_SIZE, DEN_TINT));
    }
  }

  private clearQuestObjects(): void {
    for (const shimmer of this.shimmers) shimmer.destroy();
    this.shimmers = [];
    this.lying?.destroy();
    this.lying = null;
    for (const carrot of this.pickups) carrot.destroy();
    this.pickups = [];
    this.storybook?.destroy();
    this.storybook = null;
    // The rocks' own sprites go with the scene; only the list has to be dropped.
    this.rocks = [];
  }

  /**
   * Somebody the quest has just moved, moved — now, rather than the next time
   * this zone is built.
   *
   * `gather` was written for the cave: Sneak and Hazel go on ahead while she is
   * walking there, and the walk itself is a doorway, so by the time she arrives
   * the zone has been rebuilt with them in it. The second quest is given and
   * done in the same field. Its giver is standing a stride in front of her when
   * she takes it, and waiting for a doorway would mean either a den with nobody
   * at it or Hazel in two places, depending which way she went first.
   *
   * So the person is picked up and put down, with a burst at each end — which is
   * the same "she went on ahead" the cave already tells, said in the one second
   * where it can actually be watched. Nobody is copied and nobody is duplicated:
   * this moves the Npc that is already standing here, and only builds one for a
   * guest the zone did not have.
   */
  private moveGuestsIn(): void {
    const guests = quests.guests(this.zoneId);
    // Anybody the quest has just sent somewhere *else* goes first. Storytime is
    // given by the pond and read on the rug, so the press that takes it has to
    // take Hazel off the grass as well as put her on the rug — and a person left
    // standing where she no longer is would be the same bug as a person in two
    // places, which is the one thing `gather` exists to avoid. The next build of
    // this zone would have left her out anyway; this is that, one second early
    // and where it can be watched.
    const sent = this.npcs.filter(
      (npc) => quests.away(npc.id) && !guests.some((guest) => guest.id === npc.id),
    );
    for (const gone of sent) {
      this.sparkles.explode(30, gone.x, gone.y - HEAD_GAP);
      gone.destroy();
    }
    if (sent.length) {
      this.npcs = this.npcs.filter((npc) => !sent.includes(npc));
      playWhoosh();
      hooks.sparkles += 1;
      this.syncNpcHooks();
    }

    if (!guests.length) return;

    for (const guest of guests) {
      const to = { x: guest.x * TILE_SIZE, y: guest.y * TILE_SIZE };
      const here = this.npcs.find((npc) => npc.id === guest.id);
      if (!here) {
        registerCharacterAnims(this, sheetFor(guest.sheet));
        this.npcs.push(
          new Npc(this, {
            id: guest.id,
            sheet: guest.sheet,
            x: guest.x * TILE,
            y: guest.y * TILE,
            facing: guest.facing,
            lines: [...guest.lines],
          } satisfies MapNpc),
        );
        this.sparkles.explode(30, to.x, to.y - HEAD_GAP);
        continue;
      }

      this.sparkles.explode(30, here.x, here.y - HEAD_GAP);
      here.setPosition(to.x, to.y);
      here.setDepth(to.y);
      here.face(guest.facing);
      this.sparkles.explode(30, to.x, to.y - HEAD_GAP);
    }

    playWhoosh();
    hooks.sparkles += 1;
    this.syncNpcHooks();
  }

  // --- the pen and the bunnies ----------------------------------------------

  /**
   * The ring of tiny trees, and the three bunnies inside it.
   *
   * Built once per visit to the zone and never again, which is what keeps it out
   * of `buildQuestObjects`: that runs on every phase change and every one of
   * these is a solid tile and a sprite, so rebuilding it four times an afternoon
   * would leave four rings standing in the same clearing. The press that takes
   * the job calls this itself; every other caller is a zone opening.
   *
   * **The trees are per placement, like every other choppable in the game.** A
   * tree the map file has never heard of is still a Tree: it is given the cells
   * it makes solid, the cells felling it hands back, and the memory of what she
   * already did to it — the same three things the generator writes down for the
   * wood, worked out here because the generator was not there when this was
   * planted. What is different is only its `TreeStyle`.
   */
  private buildPen(): void {
    const pen = quests.pen;
    if (this.penTrees.length || !pen || pen.zone !== this.zoneId) return;

    const felled = session.trees(this.zoneId);
    const edge = (col: number, row: number) =>
      col === pen.x || row === pen.y || col === pen.x + pen.size - 1 || row === pen.y + pen.size - 1;

    for (let row = pen.y; row < pen.y + pen.size; row++) {
      for (let col = pen.x; col < pen.x + pen.size; col++) {
        if (!edge(col, row)) continue;
        // Never onto something that is already solid. The clearing was chosen
        // because nothing is — see PEN in `quests.ts` — and this is what makes
        // that a fact rather than a claim: a ring that lands on a trunk simply
        // has a gap in it, which is a wonky pen and not a broken world.
        if (this.world.solidCell(col, row)) continue;

        const id = `pen_${this.penTrees.length}`;
        const cells = { x: col, y: row, w: 1, h: 1 };
        // The picture hangs two tiles above its own trunk and half a tile to the
        // left of it, which is where `blocks` on `oakSmall` says the trunk is.
        // Written out rather than imported: `footing.ts` is the generator's, and
        // the game may not reach into `tools/`.
        const tree = new Tree(
          this,
          this.world,
          {
            id,
            key: 'oakSmall',
            x: (col - 0.5) * TILE,
            y: (row - 2) * TILE,
            ax: Math.round((col + 0.5) * TILE),
            ay: Math.round((row + 0.5) * TILE),
            chop: true,
            cells,
            clears: [[col, row]],
          },
          { leaves: this.leaves, sparkles: this.sparkles },
          felled[id],
          TINY_TREE,
        );

        // Solid from the moment it is planted — unless she has already knocked
        // this one all the way out, in which case the Tree has just handed the
        // cell back and blocking it now would be taking it away again.
        if (tree.state !== 'gone') this.world.block([[col, row]]);

        this.penTrees.push(tree);
        this.trees.push(tree);
        if (tree.state === 'standing') this.lightPenTree(tree);
      }
    }

    this.syncWorldHooks();
    this.buildBunnies(pen);
  }

  /**
   * Three bunnies, put wherever the quest says they are by now.
   *
   * Nothing about a bunny is remembered except which one is following her, so
   * this is where the other three states are *worked out* rather than restored:
   * home if its box is filled, following if the store says so, loose once the
   * ring is open, and penned until then. Which is why walking through a doorway
   * costs a bunny nothing — there was never anything to lose.
   */
  private buildBunnies(pen: QuestPen): void {
    const den = quests.den;
    const loose = quests.bunniesLoose;
    // Inside the ring is what it encloses; out of it is a little wider than the
    // ring itself. Both are the same point, which is the middle of the pen.
    const inside = this.penRoam((pen.size - 2) / 2)!;
    const outside = this.penRoam(LOOSE_LEASH)!;
    const atDen = den
      ? { x: den.x * TILE_SIZE, y: den.y * TILE_SIZE, r: DEN_ROAM * TILE_SIZE }
      : null;

    for (const spot of pen.bunnies) {
      if (atDen && quests.atHome(spot.id)) {
        this.bunnies.push(new Bunny(this, spot.id, atDen, 'home', atDen));
        continue;
      }

      const following = quests.following === spot.id;
      const start = loose
        ? { x: outside.x, y: outside.y }
        : { x: spot.x * TILE_SIZE, y: spot.y * TILE_SIZE };
      const bunny = new Bunny(
        this,
        spot.id,
        start,
        following ? 'following' : loose ? 'loose' : 'penned',
        loose ? outside : inside,
      );
      // A follower is standing wherever she is, because that is where it was
      // when she walked through the door — the faeries' rule, and the only
      // answer that is not "your bunny is back in the wood".
      if (following) bunny.placeAt(this.player.x, this.player.y);
      this.bunnies.push(bunny);
    }
  }

  /** The quiet light on one pen tree: "this is one of the important ones". */
  private lightPenTree(tree: Tree): void {
    const glow = makeShimmer(this, tree.x, tree.y - TILE_SIZE / 2, PEN_TINT, PEN_GLOW);
    this.penGlows.push({ tree, glow });
  }

  /**
   * One tree of the ring twinkles, and the next one twinkles next time.
   *
   * Round the ring rather than all sixteen at once: sixteen bursts a second is
   * the objective sparkle turned up, and what this has to say is quieter than
   * that. It also drops the light off anything that is no longer a standing
   * tree, which is the one place a felled pen tree's glow gets tidied away.
   */
  private twinklePen(): void {
    for (let i = this.penGlows.length - 1; i >= 0; i--) {
      const lit = this.penGlows[i]!;
      if (lit.tree.state === 'standing') continue;
      lit.glow.destroy();
      this.penGlows.splice(i, 1);
    }
    if (!this.penGlows.length) return;

    this.penTwinkle = (this.penTwinkle + 1) % this.penGlows.length;
    const lit = this.penGlows[this.penTwinkle]!;
    this.sparkles.explode(PEN_TWINKLE, lit.glow.x, lit.glow.y);
  }

  /** The row of slots, the yellow dot, and the bubble over the boy next door. */
  private refreshQuestHud(): void {
    this.questRow.show(quests.slots);

    // A cloud over everybody who has something to ask: two before either job is
    // taken, none while one is running, and one again the moment it is finished
    // — see `quests.ts` for why two is allowed and one active quest still is
    // not. That last transition is why this runs at the end of a quest and not
    // only at the start of one: the bubble has to come back on the instant, over
    // whoever is standing in the zone she happens to have finished in.
    const wants = this.npcs.filter((npc) => quests.offerFrom(npc.id) !== null);
    if (wants.length !== this.markers.length) {
      for (const marker of this.markers) marker.destroy();
      this.markers = wants.map((npc) =>
        makeQuestMarker(this, npc.x, npc.y, npc.headHeight + HEAD_GAP + 26),
      );
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
      ...this.pickups.map((thing) => ({
        id: thing.id,
        x: thing.x,
        y: thing.y,
        lift: ITEM_LIFT,
        press: () => this.pickUpGathered(thing),
      })),
      // The book on the rug. The one interactable green *opens* rather than
      // picks up or talks to — and it is in this list rather than being a
      // special case in `handleInteract` because the dot is a promise: whatever
      // is under it is what the button does, and a green button that quietly
      // meant something else near a rug would be the first place in this game
      // that was not true.
      ...(this.storybook
        ? [
            {
              id: this.storybook.id,
              x: this.storybook.x,
              y: this.storybook.y,
              lift: ITEM_LIFT,
              press: () => this.openBook(),
            },
          ]
        : []),
      // And every loose bunny, from the moment the ring comes open — not from
      // the moment she is *told* to bring them home.
      //
      // Which is the whole reason the gentle refusal exists. She frees three
      // bunnies, presses green at one with nothing in her pocket, and is told
      // the bunny wants a carrot — at the exact moment the job is to go and find
      // three carrots, and in answer to a button she pressed rather than a
      // sentence somebody said at her. Gated to the lure phase it would be a
      // line nothing could ever reach: by the time that phase starts she has one
      // carrot per bunny and spends them one for one.
      ...this.bunnies
        .filter((bunny) => bunny.taggable)
        .map((bunny) => ({
          id: bunny.id,
          x: bunny.x,
          y: bunny.y,
          lift: BUNNY_LIFT,
          press: () => this.tagBunny(bunny),
        })),
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
    const lying = this.lying;
    // Which *tool* it is comes off the quest rather than off the sprite: a
    // GroundItem is any small thing in the grass now — a carrot is one — and
    // only the phase knows that this particular one goes in the tool row.
    const tool = itemOf(quests.phase)?.id;
    if (!lying || !tool) return;

    lying.collect();
    this.lying = null;
    this.refreshInteractables();

    toolBelt.give(tool);
    toolBelt.hold(tool);
    session.grant(tool);
    this.toolRow.refresh();
    this.toolRow.bounce(toolBelt.heldSlot);
    this.syncToolHooks();

    playPickup();
    this.sparkles.explode(48, lying.x, lying.y - TILE_SIZE / 2);
    hooks.sparkles += 1;

    // She names it as she straightens up. One line and not two, even though this
    // also put a new tool in her hand: a pickup does not go through the blue
    // button, so the switch bark never gets a turn — the two paths are separate
    // by construction rather than by a flag one of them has to remember to set.
    this.bark(nameOf(tool));

    const { complete } = quests.finish(tool, false);
    if (complete) this.nextPhase();
    else this.syncQuestHooks();
  }

  // --- the bunny rescue ------------------------------------------------------

  /**
   * A thing a `gather` phase left lying about, off the ground and into her
   * pocket. A carrot in the wood, a storybook off the shelf.
   *
   * `pickUp`'s sibling and deliberately not the same method: that one puts a
   * *tool* in her hand and lights a box on the tool row, and neither of these is
   * that — they are things she is carrying for a quest, which is what `keep` on
   * `finish` has always meant. What they do share is the grammar she can see:
   * walk up, green dot, press, it leaps and spins away, she says its name.
   *
   * The word she says comes off the phase rather than off the sprite. One noun
   * per `gather`, so three carrots are all "carrot" and the book is "storybook";
   * see `Gathered` and `nameOf`.
   */
  private pickUpGathered(thing: GroundItem): void {
    const of = gatheredBy(quests.phase);
    if (!of) return;

    thing.collect();
    this.pickups = this.pickups.filter((c) => c !== thing);
    // Its light goes with it. Everything else on the row keeps its own.
    const lit = this.shimmers.find((s) => s.x === thing.x);
    if (lit) {
      lit.destroy();
      this.shimmers = this.shimmers.filter((s) => s !== lit);
    }
    this.refreshInteractables();

    playPickup();
    this.sparkles.explode(48, thing.x, thing.y - TILE_SIZE / 2);
    hooks.sparkles += 1;
    this.faeries?.cheer();
    this.bark(nameOf(of));

    const { complete } = quests.finish(thing.id);
    this.questRow.land(thing.id);
    this.refreshQuestHud();
    if (complete) this.nextPhase();
  }

  /**
   * She pressed green at a bunny. One of three things happens and none of them
   * is nothing.
   *
   * The two refusals are the whole reason this reads as a rule rather than as a
   * bug: a second bunny while one is already following gets a laugh and a line,
   * and a bunny with no carrot in her pocket gets told where the carrots are.
   * Nothing is taken either way and nothing is blocked — there is no button in
   * this game that answers with silence. See CLAUDE.md, "No fail states".
   */
  private tagBunny(bunny: Bunny): void {
    const answer = quests.tag(bunny.id);

    if (answer !== 'following') {
      playFizzle();
      playGiggle();
      this.sparkles.explode(12, bunny.x, bunny.y - TILE_SIZE / 2);
      hooks.sparkles += 1;
      this.bark(answer === 'busy' ? BUNNY_ONE_AT_A_TIME : BUNNY_NEEDS_CARROT);
      return;
    }

    bunny.follow();
    playSparkleChime();
    this.sparkles.explode(36, bunny.x, bunny.y - TILE_SIZE / 2);
    hooks.sparkles += 1;
    this.faeries?.cheer();
    this.bark(nameOf('bunny'));
    this.refreshInteractables();
    this.syncQuestHooks();
  }

  /**
   * The one at her heels is home.
   *
   * Fired by walking into the den with a bunny behind her, which is the only
   * thing this phase ever asks: there is no button to press at the far end,
   * because a four-year-old who has walked a bunny across a wood has already
   * done the thing.
   */
  private dropOffBunny(den: QuestSpot): void {
    const got = quests.deposit();
    if (!got) return;

    const at = { x: den.x * TILE_SIZE, y: den.y * TILE_SIZE };
    this.bunnies.find((b) => b.id === got.id)?.settle({ ...at, r: DEN_ROAM * TILE_SIZE });

    playSparkleChime();
    this.sparkles.explode(60, at.x, at.y - TILE_SIZE / 2);
    this.cameras.main.shake(160, 0.004);
    hooks.sparkles += 1;
    this.faeries?.cheer();

    this.refreshQuestHud();
    this.questRow.land(got.id);
    this.refreshInteractables();

    if (got.complete) {
      this.bunniesAllHome(at);
      return;
    }

    // ...and Hazel counts what is left, out loud, in a sentence that was cut
    // knowing the number. There is no synthesiser in this game and there never
    // will be, so "two more" and "one more" are two clips and a lookup — see
    // `state/recap.ts` for the same rule from the other end.
    const counting = BUNNIES_LEFT[got.count - 1];
    if (counting) this.time.delayedCall(700, () => this.sayFrom(quests.giver, counting));
  }

  /**
   * All three are home. The end of the second quest.
   *
   * The state settles here and only the flourish waits, which is the split the
   * first quest's coin established: walking away in the middle of the
   * celebration cannot cost her anything, because by this line everything has
   * already happened. See `summon`, and `RoomScene.payUp`.
   */
  private bunniesAllHome(at: { x: number; y: number }): void {
    playFanfare();
    playSummon();
    this.sparkles.explode(160, at.x, at.y - TILE_SIZE / 2);
    this.cameras.main.shake(420, 0.010);
    hooks.sparkles += 1;

    quests.advance();
    this.refreshQuestHud();
    this.refreshInteractables();
    this.syncQuestHooks();

    const earned = session.addCoin();
    this.syncCoinHooks();

    this.time.delayedCall(SUMMONING_BEAT, () => {
      if (!this.scene.isActive() || this.leaving) return;
      this.sayFrom('hazel', HAZEL_HOME);
      this.sayNext(HAZEL_HOME, 'hazel', HAZEL_COIN, () => this.payUp(earned, 'hazel'));
    });
  }

  /**
   * One of the ring's trees has gone over. Fills a box, and on the fourth one
   * lets the bunnies out through the hole she has just made.
   *
   * Any four of the sixteen, in any order. The gap is the tree that just fell,
   * which is what the three of them aim for as they leave — see `Bunny.release`.
   * Nothing here checks whether they *can* get out: they have no collision and
   * never did, and a pen a bunny could genuinely be trapped in would be a fail
   * state with fur on it.
   */
  private penFell(tree: Tree): void {
    if (!this.penTrees.includes(tree)) return;
    const got = quests.fell();
    if (!got) return;

    this.refreshQuestHud();
    this.questRow.land(got.id);
    if (!got.complete) return;

    const loose = this.penRoam(LOOSE_LEASH);
    if (loose) {
      for (const bunny of this.bunnies) bunny.release({ x: tree.x, y: tree.y }, loose);
    }
    this.nextPhase();
  }

  /** The middle of the ring and a radius, in world pixels. See `Roam`. */
  private penRoam(tiles: number): Roam | null {
    const pen = quests.pen;
    if (!pen) return null;
    return {
      x: (pen.x + pen.size / 2) * TILE_SIZE,
      y: (pen.y + pen.size / 2) * TILE_SIZE,
      r: tiles * TILE_SIZE,
    };
  }

  /**
   * The two things the scene watches her walk into: a spot a phase named, and
   * the den with a bunny behind her.
   *
   * Both are places rather than objects, which is why neither is an
   * interactable and why this is a per-frame proximity test — the same shape as
   * `watchTheCircle`, and cheap for the same reason: nearly always a no, and
   * never asked at all unless a quest is on.
   */
  private watchQuestSpots(): void {
    const phase = quests.phase;

    const walk = walkToOf(phase);
    if (walk && walk.zone === this.zoneId) {
      const away = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        walk.x * TILE_SIZE,
        walk.y * TILE_SIZE,
      );
      // Self-guarding: getting there moves the phase on, and the next frame's
      // `walkToOf` is null.
      if (away <= walk.r * TILE_SIZE) this.nextPhase();
      return;
    }

    const lure = lureOf(phase);
    if (!lure || lure.den.zone !== this.zoneId || !quests.following) return;
    const away = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      lure.den.x * TILE_SIZE,
      lure.den.y * TILE_SIZE,
    );
    if (away <= DEN_REACH * TILE_SIZE) this.dropOffBunny(lure.den);
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
      // ...and never over an open book. See `sayInstructionAfter`.
      if (this.reader.isOpen) return;
      this.bubble.say(line, this.speaking());
      this.syncVoiceHooks();
    });
  }

  // --- storytime -------------------------------------------------------------

  /**
   * Green, at the book on the rug. The room goes quiet and the story starts.
   *
   * Everything on screen that is about the world goes with it: the balloon
   * stops mid-sentence, the dot goes, and the rows along the bottom are taken
   * off rather than drawn over — a takeover that left the tool belt showing
   * would be four boxes she can see and cannot press. `update` does the rest,
   * which is to stop asking the world anything at all while this is up.
   *
   * Where it opens is the quest's answer and not the reader's: `pageReached` is
   * read off the store, so closing the book and coming back is the same page,
   * across a doorway and across the whole afternoon.
   */
  private openBook(): void {
    const reading = readingOf(quests.phase);
    const spec = reading ? bookById(reading.book) : null;
    if (!spec) return;

    unlockAudio();
    this.bubble.stop();
    this.showHud(false);
    playPageTurn();
    this.sparkles.explode(24, this.player.x, this.player.y - 60);
    hooks.sparkles += 1;

    this.reader.open(spec, quests.pageReached);
    this.syncVoiceHooks();
    this.syncBookHooks();
  }

  /**
   * The red button, or the last page. The book folds away and the room is back.
   *
   * Never a failure and never a loss: the quest is exactly where it was, the
   * page she was on is written down, and the book is still lying on the rug with
   * a green dot over it. See CLAUDE.md, "No fail states".
   */
  private closeBook(): void {
    this.reader.close();
    this.showHud(true);
    this.syncVoiceHooks();
    this.syncBookHooks();
  }

  /** The rows along the bottom, on or off. What a takeover does to the HUD. */
  private showHud(on: boolean): void {
    this.toolRow.container.setVisible(on);
    this.coinRow.container.setVisible(on);
    if (on) return;
    this.prompt.setVisible(false);
    // And the picture of the stick, if she has not walked yet. It is drawn over
    // the book like everything else on the HUD shelf, and being shown how to
    // walk while somebody is reading to you is an answer to a question nobody
    // asked. It never comes back: dismissing it is what walking does.
    this.stickHint?.dismiss();
  }

  /**
   * The face buttons, while the book has them.
   *
   * Green is the whole design of this screen and most of it is what green does
   * *not* do: while the page is still reading itself the press is thrown away,
   * with no noise, no shake and nothing said about it. A four-year-old mashing
   * green cannot skip a sentence and is never told she pressed too early —
   * the sentence simply finishes, the dot comes up, and then it works.
   *
   * Yellow reads the page again, which is the same thing yellow does everywhere
   * else in the game: say it again. Red closes the book. Blue is the one button
   * with nothing to do in here, and it stays that way rather than borrowing a
   * meaning it does not have anywhere else.
   */
  private handleBook(button: Record<PadColorName, boolean>): void {
    if (button.red) {
      playPageTurn();
      this.closeBook();
      return;
    }

    if (button.yellow) {
      unlockAudio();
      this.reader.read();
      this.syncVoiceHooks();
      this.syncBookHooks();
      return;
    }

    if (button.green && this.reader.turnable) this.turnPage();
  }

  /**
   * Over the page.
   *
   * Three things in a row and none of them on top of another, which is the same
   * rule every celebration in this game keeps: the leaf goes over, Hazel says
   * what she thought of the page that just went by, and only when she has
   * finished does the new page start reading itself. Two voices at once is no
   * voice at all for somebody being taught to follow one.
   *
   * The page is written down in the store *first*, before any of the flourish
   * runs — so walking away, closing the book or reloading the zone in the middle
   * of the turn cannot cost her the page she just finished.
   */
  private turnPage(): void {
    const turned = quests.turnPage();
    if (!turned) return;

    const cheer = this.reader.current?.cheer ?? null;
    const next = this.reader.page + 1;
    const half = this.reader.flipHalf;

    playPageTurn();
    this.reader.flip();
    hooks.sparkles += 1;
    this.syncBookHooks();

    this.time.delayedCall(half, () => {
      if (!this.scene.isActive() || this.leaving) return;
      if (turned.complete) {
        this.finishStory(cheer);
        return;
      }
      if (!this.reader.isOpen) return;

      this.reader.showPage(next);
      this.sayFrom('hazel', cheer);
      this.syncBookHooks();

      // ...and the new page, once she has stopped talking. Measured off her own
      // clip, the way every other chained line in this scene is.
      const spoken = cheer ? (this.voice.get(cheer)?.duration ?? 0) : 0;
      this.time.delayedCall((spoken + 0.45) * 1000, () => {
        if (!this.scene.isActive() || this.leaving) return;
        // She may have shut the book, turned on past it, or pressed yellow in
        // the gap — all three are hers to do, and none of them wants this.
        if (!this.reader.isOpen || this.reader.page !== next || this.reader.reading) return;
        this.reader.read();
        this.syncVoiceHooks();
        this.syncBookHooks();
      });
    });
  }

  /**
   * The last page is turned. The end of the third quest.
   *
   * The state settles here and only the flourish waits, which is the split both
   * the other quests established: walking away in the middle of the celebration
   * cannot cost her anything, because by this line the quest has parked and the
   * coin is already in the store. See `summon` and `bunniesAllHome`.
   */
  private finishStory(cheer: string | null): void {
    this.closeBook();
    playFanfare();
    this.sparkles.explode(120, this.player.x, this.player.y - 50);
    this.cameras.main.shake(300, 0.007);
    hooks.sparkles += 1;

    quests.advance();
    this.buildQuestObjects();
    this.refreshInteractables();
    this.refreshQuestHud();
    this.syncQuestHooks();

    const earned = session.addCoin();
    this.syncCoinHooks();

    const hug = this.npcs.find((npc) => npc.id === 'hazel');
    if (hug) this.hug(hug);

    // Her line about the story, then the hug, then the coin — each one after the
    // last has finished, on its own measured length.
    this.time.delayedCall(STORY_BEAT, () => {
      if (!this.scene.isActive() || this.leaving) return;
      if (!cheer) {
        this.sayFrom('hazel', HAZEL_STORY_COIN);
        this.payUp(earned, 'hazel');
        return;
      }
      this.sayFrom('hazel', cheer);
      this.sayNext(cheer, 'hazel', HAZEL_HUG, () => {
        this.sayNext(HAZEL_HUG, 'hazel', HAZEL_STORY_COIN, () => this.payUp(earned, 'hazel'));
      });
    });
  }

  /**
   * A hug, as a picture: she leans in, bumps, and settles back.
   *
   * There is no hug animation in the pack and there is not going to be one — see
   * `engineering.md`, every person in this game is the same paper doll — so the
   * hug is the *movement*, which is a thing a four-year-old reads before she
   * reads a sprite. Put back by hand at the end, because a tween interrupted by
   * a doorway would otherwise leave somebody standing in the middle of the rug.
   */
  private hug(who: Npc): void {
    who.lookAt(this.player.x, this.player.y);
    const home = { x: who.x, y: who.y };
    const lean = {
      x: home.x + (this.player.x - home.x) * 0.45,
      y: home.y + (this.player.y - home.y) * 0.45,
    };

    this.tweens.killTweensOf(who);
    this.tweens.add({
      targets: who,
      x: lean.x,
      y: lean.y,
      duration: 380,
      yoyo: true,
      hold: 260,
      ease: 'Sine.easeInOut',
      onComplete: () => who.setPosition(home.x, home.y),
    });
    this.sparkles.explode(70, (home.x + this.player.x) / 2, home.y - HEAD_GAP);
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
          this.sayNext('sneak_thanks', 'sneak', 'sneak_coin', () => this.payUp(earned, 'sneak'));
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
   *
   * `from` is whose hand it comes out of. There are two quests and two people
   * who finish one, and the coin is thrown from wherever that person is
   * standing — which for a guest is not where the map put them.
   */
  private payUp(earned: boolean, fromId: string): void {
    const from = this.npcs.find((npc) => npc.id === fromId);
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
    // Nor over a story. He is indoors and unhurried; the call keeps until the
    // book is shut, which is what the latch below being burnt *after* this line
    // buys — he has not called yet, so he still will.
    if (this.reader.isOpen) return;

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
      this.cameras.main.shake(
        110,
        (bites && tree.choppable ? 0.004 : 0.0025) * tree.style.juice,
      );
    } else if (what === 'fell') {
      playTreeCrash();
      this.cameras.main.shake(360 * tree.style.juice, 0.011 * tree.style.juice);
      hooks.sparkles += 1;
      // A tree of the ring coming down is also a box on the quest row filling
      // in. Asked of the pen rather than of the tree, because a tree does not
      // know what a quest is and this is the only place that has to.
      this.penFell(tree);
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
