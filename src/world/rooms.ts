/**
 * The room graph, as data.
 *
 * The game is room-based by design — discrete rooms joined by doorways, never an
 * open map — and v1 lands somewhere around four to six of them. So a room is a
 * table entry rather than a class: a palette, some scenery, spawn points,
 * doorways and props. Adding a room means adding an entry here. It must never
 * mean adding a scene.
 *
 * Positions are design pixels against GAME_WIDTH x GAME_HEIGHT; the canvas
 * scales to the window, so nothing here has to think about the real screen.
 */

import { GAME_WIDTH, GAME_HEIGHT } from '../config';

export type RoomId = 'yard' | 'house';

/** Where the title screen opens the door onto. */
export const STARTING_ROOM: RoomId = 'yard';

/** Inset of the walkable floor from the canvas edge. */
export const WALL = 48;

/** How far the character's body stays clear of a wall. */
export const BODY_RADIUS = 28;

/** Half the width of a doorway's opening. */
export const DOOR_HALF = 80;

/** How far into the room a doorway's trigger zone reaches. */
export const DOOR_DEPTH = 64;

/** Which wall a doorway is cut into. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** -1 looking left, 1 looking right, 0 looking at the player. */
export type Facing = -1 | 0 | 1;

export interface SpawnDef {
  x: number;
  y: number;
  facing: Facing;
}

/** Which little transition flourish a doorway plays; see world/transition.ts. */
export type FlourishId = 'sparkle' | 'hush';

export interface DoorwayDef {
  id: string;
  side: Side;
  /** Centre of the opening along its wall, in design pixels. */
  at: number;
  to: RoomId;
  /** Name of the spawn point in the room on the far side. */
  toSpawn: string;
  flourish: FlourishId;
  /** Colour of the archway's light. */
  tint: number;
}

export type PropKind = 'gem' | 'wardrobe' | 'bed';

export interface PropDef {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  /** Manifest line it speaks when she pokes it. Every prop must have one. */
  line: string;
}

export type DecorKind = 'band' | 'tuft' | 'bush' | 'star' | 'planks' | 'rug' | 'window';

export interface DecorDef {
  kind: DecorKind;
  x: number;
  y: number;
  scale?: number;
  tint?: number;
}

export interface RoomDef {
  id: RoomId;
  palette: { outside: number; floor: number; edge: number };
  /** Named places to stand. `start` is where a room is entered from nowhere. */
  spawns: Record<string, SpawnDef>;
  doorways: DoorwayDef[];
  props: PropDef[];
  decor: DecorDef[];
}

/**
 * Seraphina's house and the yard out front. The yard keeps the palette and the
 * star exactly where the single room had them, so the game she already knows is
 * still the game that opens.
 */
export const ROOMS: Record<RoomId, RoomDef> = {
  yard: {
    id: 'yard',
    palette: { outside: 0x2a1c3a, floor: 0x4a3b63, edge: 0x6d5a8c },
    spawns: {
      start: { x: 384, y: 432, facing: 1 },
      from_house: { x: WALL + DOOR_DEPTH + 78, y: 360, facing: 1 },
    },
    doorways: [
      {
        id: 'yard_to_house',
        side: 'left',
        at: 360,
        to: 'house',
        toSpawn: 'from_yard',
        flourish: 'sparkle',
        tint: 0xffd98a,
      },
    ],
    props: [{ id: 'star', kind: 'gem', x: 922, y: 302, line: 'seraphina_secret' }],
    decor: [
      // A deeper band across the top reads as sky without a second palette.
      { kind: 'band', x: 0, y: 292, tint: 0x372a4f },
      { kind: 'star', x: 210, y: 138, scale: 1.1 },
      { kind: 'star', x: 348, y: 98, scale: 0.8 },
      { kind: 'star', x: 604, y: 130, scale: 1 },
      { kind: 'star', x: 782, y: 92, scale: 1.3 },
      { kind: 'star', x: 1012, y: 152, scale: 0.9 },
      { kind: 'star', x: 1182, y: 108, scale: 1.1 },
      { kind: 'bush', x: 262, y: 566, scale: 1.1 },
      { kind: 'bush', x: 1136, y: 598, scale: 0.9 },
      { kind: 'tuft', x: 186, y: 622 },
      { kind: 'tuft', x: 322, y: 654 },
      { kind: 'tuft', x: 486, y: 672 },
      { kind: 'tuft', x: 704, y: 636 },
      { kind: 'tuft', x: 884, y: 668 },
      { kind: 'tuft', x: 1074, y: 646 },
    ],
  },

  house: {
    id: 'house',
    palette: { outside: 0x231825, floor: 0x5c4130, edge: 0x8a6242 },
    spawns: {
      start: { x: 640, y: 440, facing: 0 },
      from_yard: { x: GAME_WIDTH - WALL - DOOR_DEPTH - 78, y: 360, facing: -1 },
    },
    doorways: [
      {
        id: 'house_to_yard',
        side: 'right',
        at: 360,
        to: 'yard',
        toSpawn: 'from_house',
        flourish: 'hush',
        tint: 0x9be7ff,
      },
    ],
    props: [
      { id: 'wardrobe', kind: 'wardrobe', x: 470, y: 268, line: 'seraphina_wardrobe' },
      { id: 'bed', kind: 'bed', x: 880, y: 470, line: 'dad_bedtime' },
    ],
    decor: [
      // The band is the back wall; everything below it is floorboards.
      { kind: 'band', x: 0, y: 262, tint: 0x7a5b46 },
      { kind: 'window', x: 236, y: 168, scale: 1 },
      { kind: 'planks', x: 0, y: 330 },
      { kind: 'planks', x: 0, y: 424 },
      { kind: 'planks', x: 0, y: 518 },
      { kind: 'planks', x: 0, y: 612 },
      { kind: 'rug', x: 640, y: 512, scale: 1.1 },
    ],
  },
};

export function getRoom(id: RoomId): RoomDef {
  return ROOMS[id];
}

/** The named spawn, or `start`, or — failing both — the middle of the floor. */
export function spawnOf(room: RoomDef, spawnId?: string): SpawnDef {
  return (
    (spawnId ? room.spawns[spawnId] : undefined) ??
    room.spawns.start ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, facing: 0 }
  );
}

/** Walkable area. Shared by every room while every room is one screen. */
export const BOUNDS = {
  left: WALL + BODY_RADIUS,
  right: GAME_WIDTH - WALL - BODY_RADIUS,
  top: WALL + BODY_RADIUS,
  bottom: GAME_HEIGHT - WALL - BODY_RADIUS,
} as const;
