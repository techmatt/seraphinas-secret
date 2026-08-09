/**
 * Turning a room's data into things on screen.
 *
 * Everything here is placeholder art drawn from primitives — no asset files yet.
 * The point is that a new room is a list of decor kinds and prop kinds that
 * already exist, so writing one costs an entry in rooms.ts and nothing else.
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { makeGlow } from '../ui/ButtonDot';
import { WALL, type DecorDef, type PropDef, type RoomDef } from './rooms';

/** Depths, so every room stacks the same way. */
export const DEPTH = {
  outside: -10,
  floor: -9,
  decor: -8,
  doorway: 2,
  prop: 5,
  player: 10,
  sparkles: 20,
  hud: 30,
} as const;

/** Muted enough to sit under a purple dusk without shouting. */
const GRASS = 0x5f9e6a;

export function paintRoom(scene: Phaser.Scene, room: RoomDef): void {
  scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, room.palette.outside)
    .setDepth(DEPTH.outside);

  scene.add
    .rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH - WALL * 2,
      GAME_HEIGHT - WALL * 2,
      room.palette.floor,
    )
    .setStrokeStyle(6, room.palette.edge)
    .setDepth(DEPTH.floor);

  for (const decor of room.decor) paintDecor(scene, decor);
}

function paintDecor(scene: Phaser.Scene, d: DecorDef): void {
  const s = d.scale ?? 1;

  switch (d.kind) {
    // A horizontal slab across the top of the floor: sky outdoors, wall indoors.
    case 'band': {
      const height = d.y - WALL;
      scene.add
        .rectangle(
          GAME_WIDTH / 2,
          WALL + height / 2,
          GAME_WIDTH - WALL * 2 - 6,
          height,
          d.tint ?? 0x000000,
        )
        .setDepth(DEPTH.decor);
      break;
    }

    case 'star': {
      const star = scene.add
        .star(d.x, d.y, 4, 2 * s, 8 * s, d.tint ?? 0xfff3b0)
        .setDepth(DEPTH.decor);
      scene.tweens.add({
        targets: star,
        alpha: { from: 0.35, to: 1 },
        duration: 1200 + ((d.x * 7) % 900),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      break;
    }

    case 'tuft': {
      const g = scene.add.graphics().setDepth(DEPTH.decor);
      g.fillStyle(d.tint ?? GRASS, 0.9);
      for (const [offset, height, lean] of [
        [-11, 20, -6],
        [0, 30, 1],
        [11, 22, 7],
      ] as const) {
        g.fillTriangle(
          d.x + offset - 4,
          d.y,
          d.x + offset + 4,
          d.y,
          d.x + offset + lean,
          d.y - height * s,
        );
      }
      break;
    }

    case 'bush': {
      const tint = d.tint ?? GRASS;
      for (const [dx, dy, r] of [
        [-24, 4, 26],
        [0, -10, 32],
        [24, 4, 26],
      ] as const) {
        scene.add
          .circle(d.x + dx * s, d.y + dy * s, r * s, tint)
          .setAlpha(0.92)
          .setDepth(DEPTH.decor);
      }
      break;
    }

    case 'planks': {
      scene.add
        .rectangle(GAME_WIDTH / 2, d.y, GAME_WIDTH - WALL * 2 - 12, 3, d.tint ?? 0x3d2a1e, 0.5)
        .setDepth(DEPTH.decor);
      break;
    }

    case 'rug': {
      scene.add
        .ellipse(d.x, d.y, 330 * s, 190 * s, d.tint ?? 0x8c4a63)
        .setStrokeStyle(8, 0xd98aa8, 0.8)
        .setDepth(DEPTH.decor);
      scene.add
        .ellipse(d.x, d.y, 230 * s, 120 * s)
        .setStrokeStyle(6, 0xffd9e8, 0.5)
        .setDepth(DEPTH.decor);
      break;
    }

    case 'window': {
      makeGlow(scene, d.x, d.y, 190 * s, 0x9be7ff, 0.5).setDepth(DEPTH.decor);
      scene.add
        .rectangle(d.x, d.y, 150 * s, 120 * s, 0x2b3d63)
        .setStrokeStyle(9, 0xd9c7a8)
        .setDepth(DEPTH.decor);
      scene.add.rectangle(d.x, d.y, 150 * s, 7, 0xd9c7a8).setDepth(DEPTH.decor);
      scene.add.rectangle(d.x, d.y, 7, 120 * s, 0xd9c7a8).setDepth(DEPTH.decor);
      // A couple of stars through the glass, so indoors still feels like dusk.
      scene.add.circle(d.x - 32 * s, d.y - 30 * s, 3, 0xfff3b0).setDepth(DEPTH.decor);
      scene.add.circle(d.x + 38 * s, d.y + 26 * s, 2.5, 0xfff3b0).setDepth(DEPTH.decor);
      break;
    }
  }
}

/**
 * A pokeable thing. Every prop breathes so it reads as "come and press me"
 * without a word of instruction, and every prop is a container so the room can
 * tween the whole object on a hit.
 */
export function makeProp(scene: Phaser.Scene, def: PropDef): Phaser.GameObjects.Container {
  const parts: Phaser.GameObjects.GameObject[] = [];
  let glowRadius = 44;
  let glowTint = 0xf7c0ff;

  switch (def.kind) {
    case 'gem': {
      parts.push(scene.add.star(0, 0, 5, 14, 30, 0xf78ddd).setStrokeStyle(4, 0xffe6fb));
      break;
    }

    case 'wardrobe': {
      glowRadius = 72;
      glowTint = 0xffc98a;
      parts.push(
        scene.add.rectangle(0, 0, 116, 168, 0x8a5a34).setStrokeStyle(6, 0xc78f56),
        scene.add.rectangle(0, 0, 5, 152, 0xc78f56),
        scene.add.circle(-16, 8, 6, 0xffe6bb),
        scene.add.circle(16, 8, 6, 0xffe6bb),
        // A little pediment, so it is a wardrobe and not a fridge.
        scene.add.rectangle(0, -92, 132, 16, 0xc78f56).setStrokeStyle(4, 0x8a5a34),
      );
      break;
    }

    case 'bed': {
      glowRadius = 84;
      glowTint = 0x9be7ff;
      parts.push(
        scene.add.rectangle(0, 6, 210, 108, 0x6d5a8c).setStrokeStyle(6, 0xa08cc4),
        scene.add.rectangle(-64, -4, 66, 44, 0xfff6ff).setStrokeStyle(4, 0xd9c7ff),
        scene.add.rectangle(30, 10, 128, 76, 0xd98aa8).setStrokeStyle(4, 0xffd9e8),
        scene.add.rectangle(-112, -18, 14, 88, 0xa08cc4),
        scene.add.rectangle(112, 0, 14, 60, 0xa08cc4),
      );
      break;
    }
  }

  const glow = makeGlow(scene, 0, 0, glowRadius * 2.2, glowTint, 0.55);
  const container = scene.add.container(def.x, def.y, [glow, ...parts]);
  container.setDepth(DEPTH.prop);

  // A slow breath: enough to pull a four-year-old's eye, not enough to nag.
  scene.tweens.add({
    targets: glow,
    scale: { from: glow.scale * 0.86, to: glow.scale * 1.14 },
    duration: 1600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return container;
}
