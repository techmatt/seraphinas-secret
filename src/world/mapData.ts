/**
 * The generated map file, as the game sees it.
 *
 * `public/world/*.json` is written by `npm run world:build` out of the layout
 * in `content/world/`. These types mirror `tools/world/types.ts` — deliberately
 * a copy rather than an import, because the generator is Node code with its own
 * module resolution and the game may not reach into `tools/`. The same
 * arrangement as `tests/harness.ts` mirroring the test hooks: one narrow
 * contract, written down at both ends.
 *
 * Every coordinate here is in **pack pixels**. Multiply by WORLD_SCALE to get
 * screen pixels; nothing in the file knows how big the world looks.
 */

export type Direction = 'down' | 'up' | 'left' | 'right';

/** Which little transition flourish a doorway plays; see world/transition.ts. */
export type FlourishId = 'sparkle' | 'hush';

/**
 * Walk through it, or stand at it and press green. Walking out of a building is
 * automatic; walking into one is a press, the way Stardew does it — see
 * RoomScene, where a `press` doorway becomes an interactable like any prop.
 */
export type DoorwayEntry = 'walk' | 'press';

export interface MapTileset {
  key: string;
  file: string;
  columns: number;
  firstgid: number;
  total: number;
}

/** A rectangle of a PNG, used as one sprite. */
export interface MapImage {
  key: string;
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Frames following it across the sheet at `w` intervals. Absent means still. */
  frames?: number;
  fps?: number;
  /** Lies on the floor: drawn under everything that stands on it. */
  flat?: boolean;
}

/** A ground tile that cycles: one global tile id per frame. */
export interface MapTileAnim {
  /** Index into the ground grid. */
  i: number;
  gids: number[];
  fps: number;
}

export interface MapSprite {
  key: string;
  /** Top-left, in pack pixels. */
  x: number;
  y: number;
}

export interface MapMarker {
  id: string;
  x: number;
  y: number;
}

export interface MapProp extends MapMarker {
  key: string;
  /** Sprite top-left, which for a facade is a whole building. */
  sx: number;
  sy: number;
  /** Absent means it wiggles and chimes but says nothing. */
  line?: string;
}

export interface MapDoorway {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  to: string;
  toSpawn: string;
  enter: DoorwayEntry;
  flourish: FlourishId;
  tint: number;
  /** Which way the light spills into the room. */
  facing: Direction;
}

export interface MapSpawn {
  /** Her feet. */
  x: number;
  y: number;
  facing: Direction;
}

export interface MapData {
  id: string;
  tile: number;
  cols: number;
  rows: number;
  backdrop: number;
  tilesets: MapTileset[];
  images: MapImage[];
  /** Global tile ids, row-major; -1 is nothing. */
  ground: number[];
  /** A second tile layer above the first, for grass variants; -1 is nothing. */
  overlay?: number[];
  /** Ground tiles that cycle — the pond, mostly. */
  tileAnims?: MapTileAnim[];
  /** One character per tile, '1' where she cannot stand. */
  blocked: string;
  sprites: MapSprite[];
  spawns: Record<string, MapSpawn>;
  doorways: MapDoorway[];
  props: MapProp[];
  landmarks: MapMarker[];
}

/**
 * Maps are fetched rather than put through Phaser's loader, because the scene
 * cannot queue its textures until it knows which ones the map wants, and a
 * loader that is already running is a worse place to find that out than a
 * promise resolved before the scene starts. Once per page load, then cached.
 */
const loaded = new Map<string, MapData>();
const loading = new Map<string, Promise<MapData>>();

export function cachedMap(id: string): MapData | undefined {
  return loaded.get(id);
}

export function loadMap(id: string): Promise<MapData> {
  const already = loaded.get(id);
  if (already) return Promise.resolve(already);

  const running = loading.get(id);
  if (running) return running;

  const fetching = fetch(`world/${id}.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`world: ${id}.json is ${response.status}`);
      return response.json() as Promise<MapData>;
    })
    .then((map) => {
      loaded.set(id, map);
      loading.delete(id);
      return map;
    });

  loading.set(id, fetching);
  return fetching;
}

export function spawnOf(map: MapData, name?: string): MapSpawn {
  return (
    (name ? map.spawns[name] : undefined) ??
    map.spawns.start ?? {
      x: (map.cols * map.tile) / 2,
      y: (map.rows * map.tile) / 2,
      facing: 'down',
    }
  );
}
