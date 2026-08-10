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
import {
  BLOBS,
  FILLS,
  FLOOR_PATTERNS,
  IMAGES,
  TILE,
  TILESETS,
  WALL_TILES,
  type ImageDef,
} from './catalog.js';
import { ZONES } from '../../content/world/layout.js';
import type {
  BuiltDoorway,
  BuiltImage,
  BuiltMap,
  BuiltMarker,
  BuiltProp,
  BuiltSprite,
  BuiltTileset,
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
  const terrain: (TerrainKind | null)[] = new Array(n).fill(null);
  const floor: (string | null)[] = new Array(n).fill(null);
  const wall: (number | null)[] = new Array(n).fill(null);

  for (const paint of zone.terrain ?? []) {
    for (const [x, y] of paint.cells) if (inside(x, y)) terrain[at(x, y)] = paint.kind;
  }
  for (const paint of zone.floors ?? []) {
    if (!FLOOR_PATTERNS[paint.pattern]) throw new Error(`world: no floor "${paint.pattern}"`);
    for (const [x, y] of paint.cells) if (inside(x, y)) floor[at(x, y)] = paint.pattern;
  }
  for (const [x, y] of zone.walls ?? []) if (inside(x, y)) wall[at(x, y)] = WALL_TILES.middle;
  for (const band of zone.tallWalls ?? []) {
    const faces = [WALL_TILES.top, WALL_TILES.middle, WALL_TILES.bottom];
    for (let j = 0; j < band.h; j++) {
      const face = faces[Math.min(j, faces.length - 1)]!;
      for (let i = 0; i < band.w; i++) {
        if (inside(band.x + i, band.y + j)) wall[at(band.x + i, band.y + j)] = face;
      }
    }
  }

  const ground: number[] = new Array(n).fill(-1);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = at(x, y);

      const face = wall[i];
      if (face !== null) {
        ground[i] = gidOf(sheets, WALL_TILES.tileset, WALL_TILES.col, face);
        continue;
      }

      const pattern = floor[i];
      if (pattern !== null) {
        const { bx, by } = FLOOR_PATTERNS[pattern]!;
        ground[i] = gidOf(sheets, 'floor', bx * 2 + (x & 1), by * 2 + (y & 1));
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
      ground[i] = gidOf(sheets, blob.tileset, blob.col + offset.col, blob.row + offset.row);
    }
  }

  // --- collision ---------------------------------------------------------

  const blocked = new Uint8Array(n);
  const blockRect = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (inside(x + i, y + j)) blocked[at(x + i, y + j)] = 1;
      }
    }
  };

  for (let i = 0; i < n; i++) {
    if (wall[i] !== null || terrain[i] === 'water') blocked[i] = 1;
  }
  for (const [x, y] of zone.block ?? []) if (inside(x, y)) blocked[at(x, y)] = 1;

  // --- sprites, props, doors ---------------------------------------------

  const used = new Map<string, BuiltImage>();
  const useImage = (key: string): ImageDef => {
    const def = IMAGES[key];
    if (!def) throw new Error(`world: no catalog image "${key}"`);
    if (!used.has(key)) {
      used.set(key, { key, file: encodeURI(def.file), x: def.x, y: def.y, w: def.w, h: def.h });
    }
    return def;
  };

  const applyBlocks = (def: ImageDef, tileX: number, tileY: number) => {
    if (!def.blocks) return;
    blockRect(
      Math.round(tileX) + def.blocks.x,
      Math.round(tileY) + def.blocks.y,
      def.blocks.w,
      def.blocks.h,
    );
  };

  const sprites: BuiltSprite[] = [];
  for (const placement of zone.place) {
    const def = useImage(placement.image);
    applyBlocks(def, placement.x, placement.y);
    sprites.push({
      key: placement.image,
      x: Math.round(placement.x * TILE),
      y: Math.round(placement.y * TILE),
    });
  }

  const props: BuiltProp[] = zone.props.map((prop) => {
    const def = useImage(prop.image);
    applyBlocks(def, prop.x, prop.y);
    const spot = prop.at ?? { x: prop.x + def.w / TILE / 2, y: prop.y + def.h / TILE / 2 };
    return {
      id: prop.id,
      key: prop.image,
      sx: Math.round(prop.x * TILE),
      sy: Math.round(prop.y * TILE),
      x: Math.round(spot.x * TILE),
      y: Math.round(spot.y * TILE),
      ...(prop.line ? { line: prop.line } : {}),
    };
  });

  const doorways: BuiltDoorway[] = zone.doorways.map((door) => ({
    ...door,
    x: Math.round(door.x * TILE),
    y: Math.round(door.y * TILE),
    w: Math.round(door.w * TILE),
    h: Math.round(door.h * TILE),
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

  assertReachable(zone, blocked, cols, rows);

  const usedSheets = [...sheets.values()].filter((sheet) =>
    ground.some((gid) => gid >= sheet.firstgid && gid < sheet.firstgid + sheet.total),
  );

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
    blocked: Array.from(blocked, (b) => (b ? '1' : '0')).join(''),
    sprites,
    spawns,
    doorways,
    props,
    landmarks,
  };
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

  const complain = (what: string, x: number, y: number) => {
    const i = at(Math.floor(x), Math.floor(y));
    if (!seen[i]) throw new Error(`world: ${zone.id} — ${what} at ${x},${y} cannot be walked to`);
  };

  for (const [name, spawn] of Object.entries(zone.spawns)) complain(`spawn ${name}`, spawn.x, spawn.y);
  for (const mark of zone.landmarks) complain(`landmark ${mark.id}`, mark.x, mark.y);
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

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  const sheets = await loadSheets();
  await mkdir(OUT_DIR, { recursive: true });

  for (const zone of ZONES) {
    const map = buildZone(zone, sheets);
    const file = path.join(OUT_DIR, `${zone.id}.json`);
    await writeFile(file, `${JSON.stringify(map)}\n`);

    const solid = [...map.blocked].filter((c) => c === '1').length;
    console.log(
      `world: ${zone.id} — ${map.cols}x${map.rows} tiles, ` +
        `${map.tilesets.length} tilesets, ${map.images.length} images, ` +
        `${map.sprites.length} sprites, ${map.props.length} props, ` +
        `${solid}/${map.cols * map.rows} solid → ${file}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`world build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
