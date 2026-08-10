/**
 * The flourish a doorway makes when you walk through it.
 *
 * Walking between rooms is the single most repeated thing in a wander-and-poke
 * game, so it is worth being pointlessly gorgeous: a burst at the threshold, a
 * chime, a lean of the camera, and a wash of colour that the next room comes
 * back out of. Leaving and arriving are two halves of one gesture and share a
 * colour, which is what makes the two rooms feel joined rather than cut.
 *
 * Every doorway names a flourish, so a wardrobe into a snowy wood can wash blue
 * and chime downwards without touching the scene that plays it.
 */

import Phaser from 'phaser';
import { playArriveChime, playDoorChime } from '../audio/beep';
import type { FlourishId } from './mapData';

interface Flourish {
  /** The colour the screen fades through, and comes back out of. */
  wash: [number, number, number];
  /** Where the camera pushes to on the way out; the way in undoes it. */
  zoom: number;
  /** Notes of the leaving chime, in Hz. Arrival plays the last two, softly. */
  notes: number[];
  particles: number;
}

const FLOURISHES: Record<FlourishId, Flourish> = {
  // Warm and upward: stepping indoors, towards the light.
  sparkle: { wash: [255, 246, 255], zoom: 1.14, notes: [523.3, 659.3, 784, 1046.5], particles: 64 },
  // Cool and settling: stepping back out under the sky.
  hush: { wash: [206, 230, 255], zoom: 0.9, notes: [784, 659.3, 587.3, 523.3], particles: 52 },
};

export const EXIT_MS = 360;
export const ARRIVE_MS = 320;

export interface FlourishTarget {
  x: number;
  y: number;
  kind: FlourishId;
  sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
}

/** Leave: burst at the threshold, then hand the screen over. */
export function playExitFlourish(
  scene: Phaser.Scene,
  { x, y, kind, sparkles }: FlourishTarget,
  onDone: () => void,
): void {
  const f = FLOURISHES[kind];
  const camera = scene.cameras.main;

  sparkles.explode(f.particles, x, y);
  playDoorChime(f.notes);
  camera.shake(180, 0.004);
  camera.zoomTo(f.zoom, EXIT_MS, 'Quad.easeIn');
  camera.fadeOut(EXIT_MS, ...f.wash);

  // Once, and only after the screen has actually gone — a room swapped mid-fade
  // shows the seam.
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, onDone);
}

/** Arrive: come back out of the same colour, undoing the camera's lean. */
export function playArrivalFlourish(
  scene: Phaser.Scene,
  { x, y, kind, sparkles }: FlourishTarget,
): void {
  const f = FLOURISHES[kind];
  const camera = scene.cameras.main;

  camera.setZoom(f.zoom);
  camera.zoomTo(1, ARRIVE_MS + 140, 'Quad.easeOut');
  camera.fadeIn(ARRIVE_MS, ...f.wash);

  sparkles.explode(Math.round(f.particles * 0.45), x, y);
  playArriveChime(f.notes);
}
