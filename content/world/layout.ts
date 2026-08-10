/**
 * The world, as Matt described it, written down.
 *
 * This is the authored source for both maps — the same standing as
 * `content/voice/lines.json`. Nothing here is a tile index: it is regions,
 * roads, "the shed goes there", and the generator turns that into
 * `public/world/*.json`. Which is the whole point of the arrangement: moving
 * Joey's house two tiles left is a two-character edit here and a re-run of
 * `npm run world:build`, never a hand-placed tile anywhere.
 *
 * Everything is in **tiles**. Fractions are allowed and mean what they say.
 *
 * ## Outside — 64 x 44 tiles
 *
 *      0        18       32          46          62
 *    0 +--------- tree line all the way round ------+
 *    5 | woods  | field | shed  joey    scar        |
 *   13 |        |        ==== the top road ====     |
 *   18 |        |     Seraphina's house      |      |
 *   25 |        |        (enterable)       pond     |
 *   29 |    cave|         |                         |
 *   33 |  ===== the bottom road, west into the wood |
 *   43 +-------------------------------------------+
 *
 * ## House — 40 x 26 tiles, one scrolling floor plan
 *
 *   kitchen | living room          <- gap in the wall, no transition
 *   --------+-----------
 *   bedroom | playroom             <- front door in the bottom wall
 */

import { IMAGES } from '../../tools/world/catalog.js';
import {
  Cells,
  disc,
  grow,
  rect,
  road,
  scatter,
  union,
  without,
  type Cell,
  type Placement,
} from '../../tools/world/shapes.js';
import type { ZoneLayout } from '../../tools/world/types.js';

const T = 16;

/** What part of a catalog image is solid, for the scatter to keep off roads. */
const blocksOf = (image: string) => IMAGES[image]?.blocks;

/** Every tile a sprite's picture covers, so nothing gets planted through a roof. */
function coverage(placements: Placement[], pad = 0): Cell[] {
  const out: Cell[] = [];
  for (const p of placements) {
    const def = IMAGES[p.image];
    if (!def) throw new Error(`layout: no catalog image "${p.image}"`);
    out.push(
      ...rect(
        Math.floor(p.x) - pad,
        Math.floor(p.y) - pad,
        Math.ceil(def.w / T) + pad * 2,
        Math.ceil(def.h / T) + pad * 2,
      ),
    );
  }
  return out;
}

// ===========================================================================
// Outside
// ===========================================================================

const OUT_COLS = 64;
const OUT_ROWS = 44;

/** Two tiles of blocked edge all the way round, dressed as a wall of trees. */
const EDGE = union(
  rect(0, 0, OUT_COLS, 2),
  rect(0, OUT_ROWS - 2, OUT_COLS, 2),
  rect(0, 0, 2, OUT_ROWS),
  rect(OUT_COLS - 2, 0, 2, OUT_ROWS),
);

/** The Mystic Woods: the far-left sixteen columns, walkable but thick. */
const WOODS = rect(2, 2, 16, 40);

/** The vegetable patch, up against the woods. */
const FIELD = rect(21, 4, 8, 7);

const POND = disc(53, 25, 4.5);

/**
 * Four dirt roads, all joined: the top road past the neighbours' doors, the
 * east road down to the bottom road, Seraphina's own front path, and the
 * bottom road running west until it disappears into the trees.
 *
 * Three tiles wide, not two. The autotile spends most of the outer tiles on the
 * grassy edge, so a two-wide road draws as one thin ribbon of dirt — legible to
 * an adult reading a map, not to a four-year-old following a path.
 */
const ROAD_WIDTH = 3;

const ROADS = union(
  road([[22, 14], [58, 14]], ROAD_WIDTH),
  road([[45, 14], [45, 33]], ROAD_WIDTH),
  road([[30, 27], [30, 33]], ROAD_WIDTH),
  road([[10, 33], [58, 33]], ROAD_WIDTH),
  road([[19, 32], [19, 33]], ROAD_WIDTH),
);

/** The one enterable building. Its door is a doorway, not a prop. */
const HOUSE: Placement = { image: 'house', x: 28, y: 18 };

/**
 * The neighbours, and the cave. Nothing here opens this prompt — knocking gets
 * a wiggle and a knock and no words. They are props rather than scenery so the
 * knock has something to happen to, and `door` is where she has to be standing
 * for the green dot to appear: the drawn door, not the middle of the roof.
 */
const FACADES = [
  { id: 'shed_door', image: 'shed', x: 32, y: 5, door: { x: 32 + 39 / T, y: 11 } },
  { id: 'joey_door', image: 'joeyHouse', x: 41, y: 5, door: { x: 41 + 40 / T, y: 10 } },
  { id: 'scar_door', image: 'scarHouse', x: 51, y: 5, door: { x: 51 + 36 / T, y: 11 } },
  { id: 'cave_mouth', image: 'caveMouth', x: 19, y: 29, door: { x: 20.5, y: 31 } },
] as const;

/** The fence along the front of the vegetable patch. */
const FENCE: Placement[] = [
  { image: 'fenceRail', x: 21, y: 11 },
  { image: 'fenceRail', x: 24, y: 11 },
  { image: 'fenceRail', x: 27, y: 11 },
  { image: 'fencePost', x: 20, y: 9 },
  { image: 'fencePost', x: 30, y: 9 },
];

/**
 * Nothing may be planted on a road, in the pond, or on top of a building. The
 * roads get a tile of margin as well, so a trunk cannot narrow one to a gap she
 * has to be aimed through.
 */
const OUT_KEEP_CLEAR = new Cells([
  ...grow(ROADS, 1),
  ...POND,
  ...FIELD,
  ...coverage([HOUSE, ...FACADES.map((f) => ({ image: f.image, x: f.x, y: f.y })), ...FENCE], 1),
  // Room to stand outside her own front door.
  ...rect(27, 24, 8, 4),
  // The cave mouth needs an approach.
  ...rect(18, 31, 5, 3),
]);

const WOOD_TREES = scatter({
  region: WOODS,
  images: ['spruceBig', 'spruceBig2', 'oakBig', 'oakBig2', 'birchBig', 'spruceMed', 'oakMed'],
  chance: 0.55,
  spacing: 2,
  jitter: 0.6,
  seed: 20260809,
  avoid: OUT_KEEP_CLEAR,
  blocksOf,
});

const TOWN_TREES = scatter({
  region: union(rect(18, 2, 44, 40)),
  images: ['oakBig', 'oakBig2', 'oakMed', 'fruitBig', 'birchBig'],
  chance: 0.1,
  spacing: 4,
  jitter: 0.5,
  seed: 4242,
  avoid: OUT_KEEP_CLEAR,
  blocksOf,
});

/** The tree line that hides the edge of the world. */
const EDGE_TREES = scatter({
  region: union(
    rect(0, 0, OUT_COLS, 2),
    rect(0, OUT_ROWS - 3, OUT_COLS, 3),
    rect(0, 0, 2, OUT_ROWS),
    rect(OUT_COLS - 3, 0, 3, OUT_ROWS),
  ),
  images: ['spruceBig', 'spruceBig2', 'oakBig'],
  chance: 0.8,
  spacing: 1,
  jitter: 0.3,
  seed: 99,
});

const UNDERGROWTH = scatter({
  region: WOODS,
  images: ['bush', 'bushDark', 'bushBright', 'toadstool', 'toadstoolPurple', 'toadstoolBlue',
    'mossyStump', 'log', 'rock', 'tallGrass', 'sprig', 'sprig2'],
  chance: 0.16,
  spacing: 1,
  jitter: 0.4,
  seed: 7,
  avoid: OUT_KEEP_CLEAR,
  blocksOf,
});

const MEADOW = scatter({
  region: rect(18, 2, 44, 40),
  images: ['flowerBlue', 'flowerWhite', 'daisies', 'flowerRed', 'flowerYellow', 'sprig',
    'sprig2', 'bloomPink', 'bloomYellow', 'bloomWhite', 'bloomRed', 'bloomPurple',
    'rockSmall', 'bush'],
  chance: 0.13,
  spacing: 1,
  jitter: 0.4,
  seed: 31337,
  avoid: OUT_KEEP_CLEAR,
  blocksOf,
});

/** Reeds and lilies, so the pond has an edge that is not just a tile seam. */
const POND_DRESSING: Placement[] = [
  { image: 'lilypad', x: 51, y: 24 },
  { image: 'lilypad', x: 54, y: 26 },
  { image: 'lilypad', x: 52.5, y: 27 },
  { image: 'waterRock', x: 55, y: 23 },
  { image: 'cattail', x: 48, y: 22 },
  { image: 'cattail', x: 57, y: 27 },
  { image: 'cattail', x: 50, y: 29 },
];

const OUTSIDE: ZoneLayout = {
  id: 'outside',
  cols: OUT_COLS,
  rows: OUT_ROWS,
  backdrop: 0x24402c,
  terrain: [
    { kind: 'grass', cells: rect(0, 0, OUT_COLS, OUT_ROWS) },
    { kind: 'farm', cells: FIELD },
    { kind: 'path', cells: ROADS },
    { kind: 'water', cells: POND },
  ],
  place: [
    ...EDGE_TREES,
    ...WOOD_TREES,
    ...UNDERGROWTH,
    ...TOWN_TREES,
    ...MEADOW,
    ...POND_DRESSING,
    ...FENCE,
    { image: 'scarecrow', x: 24, y: 7 },
    HOUSE,
  ],
  block: EDGE,
  spawns: {
    // On the path outside her own front door, looking at whoever is watching.
    start: { x: 30, y: 29, facing: 'down' },
    from_house: { x: 30, y: 28, facing: 'down' },
  },
  doorways: [
    {
      id: 'outside_to_house',
      // Over the arched door drawn on the house, 39 px in from its left edge,
      // starting at the first row her feet can actually reach.
      x: 29.4,
      y: 25,
      w: 2,
      h: 1.6,
      to: 'house',
      toSpawn: 'from_outside',
      flourish: 'sparkle',
      tint: 0xffd98a,
      facing: 'down',
    },
  ],
  props: [
    { id: 'apple_tree', image: 'fruitBig', x: 35, y: 21, line: 'dad_apple' },
    { id: 'well', image: 'well', x: 26, y: 27, line: 'dad_sparkle' },
    { id: 'campfire', image: 'campfire', x: 33, y: 30, line: 'seraphina_sparky' },
    { id: 'cave_chest', image: 'chest', x: 22, y: 30, line: 'seraphina_secret' },
    { id: 'woods_toadstool', image: 'toadstool', x: 9, y: 23, line: 'seraphina_munchy' },
    // Facades. Their sprite is the whole building; what she pokes is the door.
    ...FACADES.map((f) => ({ id: f.id, image: f.image, x: f.x, y: f.y, at: f.door })),
  ],
  // Where a screenshot is taken from, as much as where a quest points. The
  // camera centres on her, so these sit a little south of what they are named
  // after — a landmark standing exactly on a building photographs its roof.
  landmarks: [
    { id: 'house_front', x: 30, y: 26 },
    { id: 'facades', x: 44, y: 11 },
    { id: 'cave', x: 21, y: 32 },
    { id: 'woods', x: 8, y: 24 },
    { id: 'pond', x: 53, y: 30 },
  ],
};

// ===========================================================================
// The house — one floor plan, four rooms, no transitions inside
// ===========================================================================

const IN_COLS = 40;
const IN_ROWS = 26;

/** The opening in the bottom wall that leads back out to the yard. */
const FRONT_DOOR = rect(19, 25, 2, 1);

const INSIDE_WALLS = union(
  rect(0, 3, 1, IN_ROWS - 3),
  rect(IN_COLS - 1, 3, 1, IN_ROWS - 3),
  without(rect(1, IN_ROWS - 1, IN_COLS - 2, 1), new Cells(FRONT_DOOR)),
  // Kitchen from living room, with a wide gap you walk straight through.
  without(rect(14, 3, 1, 10), new Cells(rect(14, 7, 1, 2))),
  // Bedroom from playroom.
  without(rect(18, 14, 1, 11), new Cells(rect(18, 18, 1, 2))),
  // Upstairs pair from downstairs pair, with a gap at each end.
  without(rect(1, 13, IN_COLS - 2, 1), new Cells(union(rect(5, 13, 2, 1), rect(27, 13, 2, 1)))),
);

/**
 * Placeholder furniture, straight off the pack's sheets. Enough per room that
 * it reads as a kitchen or a bedroom from the doorway — which is the whole job
 * here, since she cannot read a label saying which room she is in.
 */
const FURNITURE: Placement[] = [
  // Kitchen: a run of units along the wall, and a table to sit at.
  { image: 'stove', x: 2, y: 3 },
  { image: 'sink', x: 3, y: 3 },
  { image: 'sink', x: 4, y: 3 },
  { image: 'fridge', x: 6, y: 3 },
  { image: 'tableWide', x: 4, y: 8 },
  { image: 'bookshelf', x: 11, y: 3 },
  // Living room: the fire, a table, a rug and something to read.
  { image: 'fireplace', x: 20, y: 3 },
  { image: 'bookshelf', x: 25, y: 3 },
  { image: 'bookshelf', x: 27, y: 3 },
  { image: 'tableRound', x: 30, y: 6 },
  { image: 'rugBlue', x: 21, y: 8 },
  { image: 'wardrobe', x: 35, y: 4 },
  // Bedroom: her bed and wardrobe are props, so this is what is around them.
  { image: 'rug', x: 6, y: 20 },
  { image: 'tableRound', x: 13, y: 16 },
  { image: 'bookshelf', x: 15, y: 21 },
  // Playroom: floor space, a spare bed and a rug to tip things out onto.
  { image: 'rugRound', x: 25, y: 17 },
  { image: 'bedTeal', x: 34, y: 15 },
  { image: 'tableWide', x: 32, y: 21 },
  { image: 'bookshelf', x: 21, y: 15 },
];

const HOUSE_INSIDE: ZoneLayout = {
  id: 'house',
  cols: IN_COLS,
  rows: IN_ROWS,
  backdrop: 0x211722,
  floors: [
    // A base under everything, so a gap in a wall is never a hole in the floor.
    { pattern: 'planks', cells: rect(0, 0, IN_COLS, IN_ROWS) },
    { pattern: 'tile', cells: rect(1, 3, 13, 10) },
    { pattern: 'herringbone', cells: rect(15, 3, 24, 10) },
    { pattern: 'planks', cells: rect(1, 14, 17, 11) },
    { pattern: 'parquet', cells: union(rect(19, 14, 20, 11), FRONT_DOOR) },
  ],
  walls: INSIDE_WALLS,
  tallWalls: [{ x: 0, y: 0, w: IN_COLS, h: 3 }],
  place: FURNITURE,
  spawns: {
    start: { x: 20, y: 20, facing: 'down' },
    from_outside: { x: 20, y: 22, facing: 'up' },
  },
  doorways: [
    {
      id: 'house_to_outside',
      x: 19,
      y: 24.2,
      w: 2,
      h: 1.8,
      to: 'outside',
      toSpawn: 'from_house',
      flourish: 'hush',
      tint: 0x9be7ff,
      facing: 'up',
    },
  ],
  props: [
    { id: 'bed', image: 'bed', x: 3, y: 16, line: 'dad_bedtime' },
    { id: 'wardrobe', image: 'wardrobe', x: 9, y: 15, line: 'seraphina_wardrobe' },
    { id: 'bookshelf', image: 'bookshelf', x: 22, y: 3, line: 'sister_book' },
    { id: 'toybox', image: 'chest', x: 30, y: 20, line: 'sister_again' },
  ],
  landmarks: [
    { id: 'kitchen', x: 7, y: 8 },
    { id: 'living_room', x: 26, y: 8 },
    { id: 'bedroom', x: 8, y: 19 },
    { id: 'playroom', x: 28, y: 19 },
  ],
};

export const ZONES: ZoneLayout[] = [OUTSIDE, HOUSE_INSIDE];
