/**
 * `npm run world:build` — turn the authored layout into map data the game reads.
 *
 * Input is `content/world/layout.ts`: regions, roads, "the shed goes there".
 * Output is `public/world/<zone>.json`: tile indices, a collision string, and
 * the sprites, doorways, props and landmarks in pack pixels. That output is
 * committed; the pack the tile sizes are measured from is not, which is the
 * same arrangement the voice pipeline uses — authored source in `content/`,
 * generator in `tools/`, generated artefact in `public/`.
 *
 * The pack is only needed for one thing: how many columns each tileset PNG has,
 * so a tile at (col, row) can be turned into an index. Reading it beats writing
 * the numbers down, because a pack update that resized a sheet would otherwise
 * shift every tile in the world and nothing would say so.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PACK_DIR } from '../assets/config.js';
import { blobOffset } from './blob.js';
import { footing } from './footing.js';
import { rect, union, type Cell } from './shapes.js';
import {
  BLOBS,
  FILLS,
  FLOOR_PATTERNS,
  IMAGES,
  OVERLAYS,
  TILE,
  TILESETS,
  WALL_FACES,
  WALL_BEAM,
  WALL_ROWS,
  WALL_TRIM,
  type ImageDef,
} from './catalog.js';
import { ZONES } from '../../content/world/layout.js';
import type {
  BuiltDoorway,
  BuiltImage,
  BuiltMap,
  BuiltMarker,
  BuiltNpc,
  BuiltProp,
  BuiltSprite,
  BuiltTileAnim,
  BuiltTileset,
  BuiltTree,
  TerrainKind,
  ZoneLayout,
} from './types.js';

const OUT_DIR = path.join('public', 'world');

/** Where a browser-facing `assets/...` path lives on this machine. */
function onDisk(file: string): string {
  return path.join(PACK_DIR, file.replace(/^assets\//, ''));
}

/** Width and height straight out of the PNG header. */
async function pngSize(file: string): Promise<{ width: number; height: number }> {
  const disk = onDisk(file);
  let head: Buffer;
  try {
    head = await readFile(disk);
  } catch {
    throw new Error(
      `world: cannot read ${disk}\n` +
        `  The Cute Fantasy pack is side-loaded and not in this repo. See README,\n` +
        `  "Art assets" — or point SERAPHINA_ASSETS at your copy.`,
    );
  }
  if (head.toString('ascii', 1, 4) !== 'PNG') throw new Error(`world: ${disk} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

// --- tilesets ---------------------------------------------------------------

interface Sheet extends BuiltTileset {
  rows: number;
}

/**
 * Every tileset, numbered. Global ids start at 1 so 0 stays free to mean "no
 * tile" the way a Tiled map does, and -1 is what actually lands in the layer.
 */
async function loadSheets(): Promise<Map<string, Sheet>> {
  const sheets = new Map<string, Sheet>();
  let firstgid = 1;

  for (const [name, def] of Object.entries(TILESETS)) {
    const { width, height } = await pngSize(def.file);
    if (width % TILE || height % TILE) {
      throw new Error(`world: ${def.file} is ${width}x${height}, not a whole number of tiles`);
    }
    const columns = width / TILE;
    const rows = height / TILE;
    const total = columns * rows;
    sheets.set(name, { key: def.key, file: encodeURI(def.file), columns, rows, firstgid, total });
    firstgid += total;
  }

  return sheets;
}

function gidOf(sheets: Map<string, Sheet>, tileset: string, col: number, row: number): number {
  const sheet = sheets.get(tileset);
  if (!sheet) throw new Error(`world: no tileset "${tileset}"`);
  if (col < 0 || col >= sheet.columns || row < 0 || row >= sheet.rows) {
    throw new Error(`world: ${tileset} has no tile at ${col},${row}`);
  }
  return sheet.firstgid + row * sheet.columns + col;
}

// --- building one zone ------------------------------------------------------

function buildZone(zone: ZoneLayout, sheets: Map<string, Sheet>): BuiltMap {
  const { cols, rows } = zone;
  const n = cols * rows;
  const at = (x: number, y: number) => y * cols + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;

  // Three grids, painted in precedence order: terrain under floor under wall.
  // A wall cell names its own tileset, column and row, because a wall face and
  // the timber that frames it come off different sheets.
  const terrain: (TerrainKind | null)[] = new Array(n).fill(null);
  const floor: (string | null)[] = new Array(n).fill(null);
  /**
   * A wall cell names its own tileset, column and row, because a wall face and
   * the timber that frames it come off different sheets. A face also remembers
   * *which material* it is, so the run-position pass below can tell one room's
   * wall from the next one's and put a seam between them.
   */
  const wall: ({ tileset: string; col: number; row: number; face?: string } | null)[] =
    new Array(n).fill(null);
  /**
   * The beam that caps a wall face, on the layer above the wall.
   *
   * It has to be a second layer because the bar is six pixels of a sixteen-pixel
   * tile and the rest of that tile is transparent: on the ground layer it would
   * be a hole in the house, and the filler it is drawn over is what stops the
   * backdrop showing through. See WALL_BEAM in the catalog.
   */
  const beam: ({ col: number; row: number } | null)[] = new Array(n).fill(null);

  for (const paint of zone.terrain ?? []) {
    for (const [x, y] of paint.cells) if (inside(x, y)) terrain[at(x, y)] = paint.kind;
  }
  const paintFloor = (pattern: string, cells: Iterable<Cell>) => {
    if (!FLOOR_PATTERNS[pattern]) throw new Error(`world: no floor "${pattern}"`);
    for (const [x, y] of cells) if (inside(x, y)) floor[at(x, y)] = pattern;
  };
  for (const paint of zone.floors ?? []) paintFloor(paint.pattern, paint.cells);

  for (const room of zone.rooms ?? []) {
    const { x, y, w, h } = room.floor;
    const faceRows = room.face ?? 2;
    const material = room.wall ?? 'plaster';
    const face = WALL_FACES[material];
    if (!face) throw new Error(`world: ${zone.id} — room ${room.id} has no wall "${room.wall}"`);

    paintFloor(room.pattern, rect(x, y, w, h));
    if (room.inset) paintFloor(room.inset.pattern, room.inset.cells);

    // The face, from the beam down to the skirting. One row is a skirting on
    // its own; two is the reference's wall, lit at the top and finished at the
    // foot; more repeats the plain middle.
    const rows = Array.from({ length: faceRows }, (_, j) =>
      j === faceRows - 1 ? WALL_ROWS.bottom : j === 0 ? WALL_ROWS.top : WALL_ROWS.middle,
    );
    for (let j = 0; j < faceRows; j++) {
      for (let i = 0; i < w; i++) {
        const cell = [x + i, y - faceRows + j] as const;
        if (inside(cell[0], cell[1])) {
          wall[at(cell[0], cell[1])] = {
            tileset: face.tileset,
            col: face.col,
            row: rows[j]!,
            face: material,
          };
        }
      }
    }

    // Dark timber all the way round: capping the face, down both sides from the
    // cap to the floor's foot, and along the foot itself.
    const trim = { ...WALL_TRIM };
    const top = y - faceRows - 1;
    const foot = y + h;
    for (const [tx, ty] of union(
      rect(x - 1, top, w + 2, 1),
      rect(x - 1, top, 1, foot - top + 1),
      rect(x + w, top, 1, foot - top + 1),
      rect(x - 1, foot, w + 2, 1),
    )) {
      if (inside(tx, ty)) wall[at(tx, ty)] = trim;
    }

    // And the beam laid along the cap, hugging the top of the face. Ends are
    // picked by the run pass below, the same way the face's own ends are.
    for (let i = -1; i <= w; i++) {
      if (inside(x + i, top)) beam[at(x + i, top)] = WALL_BEAM.top;
    }
  }

  // Doorways, cut back out of whatever the rooms just drew.
  for (const [x, y] of zone.openings ?? []) {
    if (!inside(x, y)) continue;
    wall[at(x, y)] = null;
    beam[at(x, y)] = null;
  }

  // Where every wall face run starts and stops.
  //
  // This runs *after* the openings, on purpose: a doorway cut through a wall
  // splits one run into two, and both new ends want a jamb. Which is the whole
  // reason it is a pass over the finished grid rather than something the room
  // loop could have worked out — a room knows how wide it is and does not know
  // what was later cut out of it.
  //
  // Everything it decides is 1D: a face cell whose left neighbour is not the
  // same material starts a run, one whose right neighbour is not ends it. That
  // covers all three of the places a seam belongs — the end of a wall, the jamb
  // of an opening, and the join where two rooms' materials abut — because all
  // three are the same fact from the tile's point of view. A run one tile wide
  // is both, and takes the left column: the sheet has no both-ends tile.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = wall[at(x, y)];
      if (!cell?.face) continue;
      const def = WALL_FACES[cell.face]!;
      const runs = (px: number) => px >= 0 && px < cols && wall[at(px, y)]?.face === cell.face;
      if (!runs(x - 1)) cell.col = def.left;
      else if (!runs(x + 1)) cell.col = def.right;
    }
  }

  // The same 1D question asked of the beam, whose ends are mitred corners. Two
  // rooms side by side share a cap cell, so this is what turns four rooms' four
  // caps into the two unbroken beams they read as — and what puts a mitre either
  // side of a passage rather than a bar sailing over the hole.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!beam[at(x, y)]) continue;
      const runs = (px: number) => px >= 0 && px < cols && beam[at(px, y)] !== null;
      const ends = !runs(x + 1);
      beam[at(x, y)] = !runs(x - 1)
        ? ends
          ? WALL_BEAM.top
          : WALL_BEAM.topLeft
        : ends
          ? WALL_BEAM.topRight
          : WALL_BEAM.top;
    }
  }

  const ground: number[] = new Array(n).fill(-1);
  const tileAnims: BuiltTileAnim[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = at(x, y);

      const face = wall[i];
      if (face !== null) {
        ground[i] = gidOf(sheets, face.tileset, face.col, face.row);
        continue;
      }

      const pattern = floor[i];
      if (pattern !== null) {
        // A 2x2 kit picks its quarter off the cell's parity; a one-tile floor
        // is the same tile wherever it lands. See FloorDef.
        const { tileset, col, row, size } = FLOOR_PATTERNS[pattern]!;
        const step = size === 2 ? 1 : 0;
        ground[i] = gidOf(sheets, tileset, col + (x & step), row + (y & step));
        continue;
      }

      const kind = terrain[i];
      if (kind === null) continue;

      const fill = FILLS[kind];
      if (fill) {
        ground[i] = gidOf(sheets, fill.tileset, fill.col, fill.row);
        continue;
      }

      const blob = BLOBS[kind];
      if (!blob) throw new Error(`world: terrain "${kind}" is neither a fill nor a blob`);
      // Off the map counts as more of the same, so a region running off the
      // edge does not draw a shoreline against nothing.
      const same = (px: number, py: number) =>
        !inside(px, py) || terrain[at(px, py)] === kind;
      const offset = blobOffset(same, x, y);
      // An animated blob is the same block repeated across the sheet, so a
      // frame is the block's own offset shifted three columns per step.
      const frameCol = (frame: number) => blob.col + frame * 3 + offset.col;
      ground[i] = gidOf(sheets, blob.tileset, frameCol(0), blob.row + offset.row);
      if (blob.frames && blob.frames > 1) {
        tileAnims.push({
          i,
          gids: Array.from({ length: blob.frames }, (_, f) =>
            gidOf(sheets, blob.tileset, frameCol(f), blob.row + offset.row),
          ),
          fps: blob.fps ?? 8,
        });
      }
    }
  }

  // --- the overlay layer --------------------------------------------------

  const overlayKind: (string | null)[] = new Array(n).fill(null);
  for (const paint of zone.overlay ?? []) {
    if (!OVERLAYS[paint.kind]) throw new Error(`world: no overlay "${paint.kind}"`);
    for (const [x, y] of paint.cells) if (inside(x, y)) overlayKind[at(x, y)] = paint.kind;
  }

  const overlay: number[] = new Array(n).fill(-1);
  let overlaid = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = at(x, y);
      const kind = overlayKind[i];
      if (kind === null) continue;
      const def = OVERLAYS[kind]!;
      // Off the map counts as more of the same, so a patch running under the
      // tree line does not draw a shoreline against the edge of the world.
      const same = (px: number, py: number) =>
        !inside(px, py) || overlayKind[at(px, py)] === kind;
      const offset = blobOffset(same, x, y);
      overlay[i] =
        offset.col === 1 && offset.row === 1
          ? gidOf(sheets, def.fill.tileset, def.fill.col, def.fill.row)
          : gidOf(sheets, def.edge.tileset, def.edge.col + offset.col, def.edge.row + offset.row);
      overlaid++;
    }
  }

  // The cap beams ride the same layer. Nothing else is ever painted where they
  // are — grass variants are an outdoor thing and a beam is an indoor one — so
  // this is a write rather than a merge, and it goes last on purpose.
  for (let i = 0; i < n; i++) {
    const part = beam[i];
    if (!part) continue;
    overlay[i] = gidOf(sheets, WALL_BEAM.tileset, part.col, part.row);
    overlaid++;
  }

  // --- collision ---------------------------------------------------------

  const blocked = new Uint8Array(n);
  /**
   * The half of the collision she can *see*, counted rather than flagged: walls,
   * water, and the tiles under things that were drawn, with a tally of how many
   * of them are standing on each cell. `zone.block` is deliberately not in here
   * — that is the invisible edge, and telling the two apart is the whole basis
   * of the boundary gate below.
   *
   * A tally and not a bit because two questions below need to tell "solid" from
   * "solid, and here is exactly what is making it so": which cells a felled tree
   * hands back, and whether the boundary still holds once every choppable tree
   * in the world is gone.
   */
  const blockers = new Uint16Array(n);
  /** How many of each cell's blockers are trees she is allowed to fell. */
  const choppers = new Uint16Array(n);
  const blockRect = (x: number, y: number, w: number, h: number, chop = false) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!inside(x + i, y + j)) continue;
        const i2 = at(x + i, y + j);
        blocked[i2] = 1;
        blockers[i2]++;
        if (chop) choppers[i2]++;
      }
    }
  };

  for (let i = 0; i < n; i++) {
    if (wall[i] !== null || terrain[i] === 'water') {
      blocked[i] = 1;
      blockers[i]++;
    }
  }
  for (const [x, y] of zone.block ?? []) if (inside(x, y)) blocked[at(x, y)] = 1;

  // --- sprites, props, doors ---------------------------------------------

  const used = new Map<string, BuiltImage>();
  const useImage = (key: string): ImageDef => {
    const def = IMAGES[key];
    if (!def) throw new Error(`world: no catalog image "${key}"`);
    if (!used.has(key)) {
      used.set(key, {
        key,
        file: encodeURI(def.file),
        x: def.x,
        y: def.y,
        w: def.w,
        h: def.h,
        ...(def.frames && def.frames > 1 ? { frames: def.frames, fps: def.fps ?? 8 } : {}),
        ...(def.flat ? { flat: true } : {}),
        ...(def.blocks ? { blocks: def.blocks } : {}),
        ...(def.glow ? { glow: def.glow } : {}),
      });
    }
    return def;
  };

  /**
   * Put one picture down. Where it ends up and what it makes solid are the same
   * decision, taken once in `footing.ts` — a sprite drawn from one rule and a
   * hitbox from another is exactly how the wood came to block bare grass.
   */
  const place = (def: ImageDef, tileX: number, tileY: number, chop = false) => {
    const spot = footing(def, tileX, tileY);
    if (spot.cells) blockRect(spot.cells.x, spot.cells.y, spot.cells.w, spot.cells.h, chop);
    return spot;
  };

  const sprites: BuiltSprite[] = [];
  /**
   * Trees are put down exactly like anything else and then handed to the game
   * separately, because the game is the only thing that can take one away. A
   * tree the catalog does not know is a tree — or one drawn with no footprint —
   * stays an ordinary sprite: there would be nothing to fell and nothing to
   * hand back.
   */
  const trees: BuiltTree[] = [];
  for (const placement of zone.place) {
    const def = useImage(placement.image);
    const chop = def.tree === true && placement.chop === true;
    const spot = place(def, placement.x, placement.y, chop);

    if (!def.tree || !spot.cells) {
      sprites.push({ key: placement.image, x: spot.x, y: spot.y });
      continue;
    }

    trees.push({
      id: `tree_${trees.length}`,
      key: placement.image,
      x: spot.x,
      y: spot.y,
      ax: Math.round((spot.cells.x + spot.cells.w / 2) * TILE),
      ay: Math.round((spot.cells.y + spot.cells.h / 2) * TILE),
      ...(chop ? { chop: true } : {}),
      cells: spot.cells,
      // Filled in below: which cells are only solid because of this tree cannot
      // be known until everything else in the zone has been put down.
      clears: [],
    });
  }

  // What each tree is single-handedly holding. A cell with two blockers on it
  // stays solid whichever of them goes, so it is not this tree's to give back.
  for (const tree of trees) {
    if (!tree.chop) continue;
    const { x, y, w, h } = tree.cells;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (inside(x + i, y + j) && blockers[at(x + i, y + j)] === 1) {
          tree.clears.push([x + i, y + j]);
        }
      }
    }
  }

  // What a felled tree leaves behind. Registered whenever the zone has anything
  // to fell, because the game places these itself and cannot ask for a picture
  // the map file never mentioned.
  if (trees.some((t) => t.chop)) useImage('stump');

  const props: BuiltProp[] = zone.props.map((prop) => {
    const def = useImage(prop.image);
    const spot = place(def, prop.x, prop.y);
    const at = prop.at ?? { x: prop.x + def.w / TILE / 2, y: prop.y + def.h / TILE / 2 };
    return {
      id: prop.id,
      key: prop.image,
      sx: spot.x,
      sy: spot.y,
      x: Math.round(at.x * TILE),
      y: Math.round(at.y * TILE),
      ...(prop.line ? { line: prop.line } : {}),
    };
  });

  const doorways: BuiltDoorway[] = zone.doorways.map((door) => ({
    ...door,
    enter: door.enter ?? 'walk',
    x: Math.round(door.x * TILE),
    y: Math.round(door.y * TILE),
    w: Math.round(door.w * TILE),
    h: Math.round(door.h * TILE),
  }));

  // People. Nothing is placed and nothing is blocked: an NPC is a character
  // sheet standing on a coordinate, so all the generator does is turn tiles into
  // pack pixels and check below that she can get to them.
  const npcs: BuiltNpc[] = (zone.npcs ?? []).map((npc) => ({
    id: npc.id,
    sheet: npc.sheet,
    x: Math.round(npc.x * TILE),
    y: Math.round(npc.y * TILE),
    facing: npc.facing,
    lines: npc.lines,
  }));

  const landmarks: BuiltMarker[] = zone.landmarks.map((mark) => ({
    id: mark.id,
    x: Math.round(mark.x * TILE),
    y: Math.round(mark.y * TILE),
  }));

  const spawns: BuiltMap['spawns'] = {};
  for (const [name, spawn] of Object.entries(zone.spawns)) {
    spawns[name] = {
      x: Math.round(spawn.x * TILE),
      y: Math.round(spawn.y * TILE),
      facing: spawn.facing,
    };
  }

  assertRoadsClear(zone, terrain, blocked, cols);
  assertReachable(zone, blocked, cols, rows);
  assertWalledIn(zone, blocked, blockers, choppers, cols, rows);

  const drawn = (sheet: Sheet) => {
    const owns = (gid: number) => gid >= sheet.firstgid && gid < sheet.firstgid + sheet.total;
    return ground.some(owns) || overlay.some(owns);
  };
  const usedSheets = [...sheets.values()].filter(drawn);

  return {
    id: zone.id,
    tile: TILE,
    cols,
    rows,
    backdrop: zone.backdrop,
    tilesets: usedSheets.map(({ key, file, columns, firstgid, total }) => ({
      key,
      file,
      columns,
      firstgid,
      total,
    })),
    images: [...used.values()],
    ground,
    ...(overlaid ? { overlay } : {}),
    ...(tileAnims.length ? { tileAnims } : {}),
    blocked: Array.from(blocked, (b) => (b ? '1' : '0')).join(''),
    sprites,
    trees,
    spawns,
    doorways,
    props,
    npcs,
    landmarks,
  };
}

/**
 * Nothing solid may stand on a road.
 *
 * A road is the one thing in this world a four-year-old is expected to follow
 * without being told, so a lamp post planted in the middle of one is a worse
 * bug than it looks: she walks the dirt, meets a thing, and the road has lied
 * to her. Scatters already keep off the roads — this catches the *hand-placed*
 * prop, which is exactly the kind that gets nudged two tiles in a later edit
 * and never looked at again.
 */
function assertRoadsClear(
  zone: ZoneLayout,
  terrain: (TerrainKind | null)[],
  blocked: Uint8Array,
  cols: number,
): void {
  const on: string[] = [];
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] !== 'path' || !blocked[i]) continue;
    on.push(`${i % cols},${Math.floor(i / cols)}`);
  }
  if (on.length) {
    throw new Error(
      `world: ${zone.id} — ${on.length} road tiles have something solid on them: ` +
        `${on.slice(0, 12).join(' ')}${on.length > 12 ? ' …' : ''}`,
    );
  }
}

/** Everywhere she can walk to from the spawn, over the collision she is given. */
function flood(
  zone: ZoneLayout,
  blocked: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  const at = (x: number, y: number) => y * cols + x;
  const start = zone.spawns.start ?? Object.values(zone.spawns)[0];
  if (!start) throw new Error(`world: ${zone.id} has no spawns`);

  const seen = new Uint8Array(cols * rows);
  const origin = at(Math.floor(start.x), Math.floor(start.y));
  if (blocked[origin]) throw new Error(`world: ${zone.id} spawns inside something solid`);

  const stack = [origin];
  seen[origin] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % cols;
    const y = Math.floor(i / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = at(nx, ny);
      if (seen[j] || blocked[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/**
 * A world you cannot walk across is the one bug this generator can actually
 * cause, and no screenshot would show it. So flood-fill from the spawn and
 * insist that every spawn, doorway, prop and landmark is standing in the same
 * open space. A layout that walls the woods off fails the build, not the play.
 */
function assertReachable(
  zone: ZoneLayout,
  blocked: Uint8Array,
  cols: number,
  rows: number,
): void {
  const at = (x: number, y: number) => y * cols + x;
  const seen = flood(zone, blocked, cols, rows);

  const complain = (what: string, x: number, y: number) => {
    const i = at(Math.floor(x), Math.floor(y));
    if (!seen[i]) throw new Error(`world: ${zone.id} — ${what} at ${x},${y} cannot be walked to`);
  };

  for (const [name, spawn] of Object.entries(zone.spawns)) complain(`spawn ${name}`, spawn.x, spawn.y);
  for (const mark of zone.landmarks) complain(`landmark ${mark.id}`, mark.x, mark.y);
  // A person she cannot reach is a person she cannot talk to, and the layout is
  // where that gets decided — so it is where it gets caught. They stand on their
  // own tile rather than beside it, having no footprint of their own.
  for (const npc of zone.npcs ?? []) complain(`npc ${npc.id}`, npc.x, npc.y);
  for (const door of zone.doorways) {
    complain(`doorway ${door.id}`, door.x + door.w / 2, door.y + door.h / 2);
  }
  // A prop is reached by standing *next* to it, so any open neighbour will do.
  for (const prop of zone.props) {
    const spot = prop.at ?? { x: prop.x, y: prop.y };
    const near = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const ok = near.some(([dx, dy]) => {
      const x = Math.floor(spot.x) + dx!;
      const y = Math.floor(spot.y) + dy!;
      return x >= 0 && y >= 0 && x < cols && y < rows && seen[at(x, y)];
    });
    if (!ok) throw new Error(`world: ${zone.id} — prop ${prop.id} cannot be walked up to`);
  }
}

/**
 * The boundary is obstacle-filled, and stays that way.
 *
 * Matt's principle for the edge of the world (2026-08-10): it must read as a
 * wall of stuff, and there must be no walkable route to any cell on the map's
 * own border. The first half is a screenshot's job. The second half is this,
 * run twice:
 *
 *  - **With everything.** No border cell is reachable at all. This is the flat
 *    statement of the rule, and it is what fails if a fence loses a tile and the
 *    invisible edge has been trimmed back too.
 *  - **Without `zone.block`.** No border cell is reachable using only the
 *    collision she can *see* — the cliff, the fence, the trunks. Without this
 *    second pass the first is nearly free: a frame of invisible blocked tiles
 *    satisfies it whatever the world looks like, which is exactly the boundary
 *    this rule was written to replace.
 *
 *  - **Without `zone.block`, and with every choppable tree felled.** She has an
 *    axe. A boundary that holds only while the wood in front of it is standing
 *    is a boundary with a timer on it, and the timer is a four-year-old with a
 *    green button — so "she can never chop her way out of the map" is settled
 *    here rather than trusted to whoever last marked a scatter choppable. A cell
 *    counts as open in this pass when *every* thing making it solid is a tree
 *    she may fell, which is the most generous reading of what an axe can do.
 *
 * `sealed.soft` is the one exemption and it is spent by name, not inferred: the
 * woods gap is closed with undergrowth she can walk into, on purpose, and the
 * map's own edge is what stops her there. Those cells count as solid in the
 * second and third passes, so declaring one is a visible line in the layout
 * rather than a hole that opens quietly.
 */
function assertWalledIn(
  zone: ZoneLayout,
  blocked: Uint8Array,
  blockers: Uint16Array,
  choppers: Uint16Array,
  cols: number,
  rows: number,
): void {
  if (!zone.sealed) return;

  const border = (i: number) => {
    const x = i % cols;
    const y = Math.floor(i / cols);
    return x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
  };

  const leaks = (seen: Uint8Array) => {
    const out: string[] = [];
    for (let i = 0; i < seen.length; i++) {
      if (seen[i] && border(i)) out.push(`${i % cols},${Math.floor(i / cols)}`);
    }
    return out;
  };

  const complain = (how: string, out: string[]) => {
    if (!out.length) return;
    throw new Error(
      `world: ${zone.id} — the boundary leaks (${how}): ${out.length} border cells can be ` +
        `walked to, from ${out.slice(0, 12).join(' ')}${out.length > 12 ? ' …' : ''}`,
    );
  };

  complain('everything solid', leaks(flood(zone, blocked, cols, rows)));

  /** What is drawn, plus the cells the layout declared soft by name. */
  const drawn = (standing: (i: number) => boolean) => {
    const grid = new Uint8Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = standing(i) ? 1 : 0;
    for (const [x, y] of zone.sealed?.soft ?? []) {
      if (x >= 0 && y >= 0 && x < cols && y < rows) grid[y * cols + x] = 1;
    }
    return grid;
  };

  complain('only what is drawn', leaks(flood(zone, drawn((i) => blockers[i]! > 0), cols, rows)));
  complain(
    'only what is drawn, with every choppable tree felled',
    leaks(flood(zone, drawn((i) => blockers[i]! > choppers[i]!), cols, rows)),
  );
}

// --- main -------------------------------------------------------------------

/**
 * `--check` builds every zone and runs every gate, and writes nothing.
 *
 * Same code path, same asserts, no side effects — so a test can ask "does the
 * world still hold together" without a passing run leaving the repository
 * dirty, and a person can ask the same question before committing a layout.
 */
async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const sheets = await loadSheets();
  if (!check) await mkdir(OUT_DIR, { recursive: true });

  for (const zone of ZONES) {
    const map = buildZone(zone, sheets);
    const file = path.join(OUT_DIR, `${zone.id}.json`);
    if (!check) await writeFile(file, `${JSON.stringify(map)}\n`);

    const solid = [...map.blocked].filter((c) => c === '1').length;
    const moving = map.images.filter((i) => i.frames).length;
    const choppable = map.trees.filter((t) => t.chop).length;
    console.log(
      `world: ${zone.id} — ${map.cols}x${map.rows} tiles, ` +
        `${map.tilesets.length} tilesets, ${map.images.length} images (${moving} animated), ` +
        `${map.sprites.length} sprites, ${map.props.length} props, ` +
        `${map.npcs.length} npcs, ` +
        `${map.trees.length} trees (${choppable} choppable), ` +
        `${map.overlay?.filter((g) => g >= 0).length ?? 0} overlaid, ` +
        `${map.tileAnims?.length ?? 0} moving tiles, ` +
        `${solid}/${map.cols * map.rows} solid ` +
        (check ? '— checked, not written' : `→ ${file}`),
    );
  }

  if (check) console.log('world: every zone builds and every gate holds.');
}

main().catch((error: unknown) => {
  console.error(`world build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
