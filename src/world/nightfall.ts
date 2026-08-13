/**
 * The night, and the morning after it.
 *
 * Sleeping is the one thing in this game she will do *on purpose to watch it* —
 * there is no other reason to press the bed twice, since nothing about a new day
 * is a reward — so the sequence has to be worth the press. Three beats: the
 * light going out of the room, a night sky with a moon in it, and a sunrise she
 * wakes into. Two of them are here and the third is `playSunrise`, which runs in
 * the zone rebuilt on the far side of the reset.
 *
 * **It is all drawn in screen space, above the HUD.** A camera fade would be
 * simpler and cannot work: `fadeOut` paints over everything the camera renders,
 * which is exactly the layer the stars have to be *in front of*. So the night is
 * a curtain of our own, welded to the screen, and everything on it is welded to
 * the curtain.
 *
 * **Nothing here has letters on it.** The obvious cartoon shorthand for sleep is
 * a Z, and a Z is text: she cannot read, every word on screen in this game is
 * spoken aloud with the word lit as it is said, and there is no way to speak a
 * Z that teaches her anything. So sleep is drawn instead — soft motes rising off
 * her and going out, one after another, which is the same idea with nothing to
 * read. See CLAUDE.md.
 */

import Phaser from 'phaser';
import { playSleepChime, playWakeChime } from '../audio/beep';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { makeGlow } from '../ui/ButtonDot';

/** How long the room takes to go dark. */
export const DUSK_MS = 900;

/** How long the night sky is held before the day turns over. */
export const NIGHT_MS = 1500;

/** How long the morning takes to arrive, and then to get out of the way. */
const BLOOM_MS = 460;
const CLEAR_MS = 780;

/** Over the HUD, which is over everything else. The night covers the game. */
const CURTAIN_DEPTH = DEPTH.hud + 50;

/** Deep blue-violet: a night sky in a picture book, never black. */
const NIGHT = 0x0d0b2b;

/** The first light: warm, and far too bright, because that is what waking is. */
const MORNING = 0xffe9b8;

const STAR_COUNT = 26;
const MOTE_COUNT = 5;

export interface NightTarget {
  /** Where she is lying down, in world pixels. */
  x: number;
  y: number;
  sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
}

/** A full-screen sheet of colour, fixed to the camera, above everything. */
function curtain(scene: Phaser.Scene, color: number, alpha: number): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color)
    .setScrollFactor(0)
    .setAlpha(alpha)
    .setDepth(CURTAIN_DEPTH);
}

/**
 * Where a world point is on the screen right now.
 *
 * The curtain and everything on it are pinned to the camera, and she is not —
 * so the motes coming off her have to be told where she has ended up. Zoom is
 * in it because the camera is allowed to be leaning when this starts.
 */
function onScreen(scene: Phaser.Scene, x: number, y: number): { x: number; y: number } {
  const camera = scene.cameras.main;
  return {
    x: (x - camera.scrollX) * camera.zoom,
    y: (y - camera.scrollY) * camera.zoom,
  };
}

/**
 * The light goes out, the sky comes up, and then `onDark` — which is where the
 * day is actually reset and the zone rebuilt.
 *
 * The handover happens at the darkest moment on purpose: the screen is a flat
 * sheet of one colour at that instant, and the zone on the far side opens with
 * the same sheet of the same colour, so the seam between the two scenes is a
 * thing nobody can see. Everything drawn here goes away with the scene it was
 * drawn in.
 */
export function playNightfall(
  scene: Phaser.Scene,
  target: NightTarget,
  onDark: () => void,
): void {
  const night = curtain(scene, NIGHT, 0);
  playSleepChime();

  scene.tweens.add({
    targets: night,
    alpha: 1,
    duration: DUSK_MS,
    ease: 'Sine.easeIn',
    onComplete: () => {
      drawSky(scene);
      drawMotes(scene, target);
      scene.time.delayedCall(NIGHT_MS, onDark);
    },
  });
}

/** A moon and a scatter of stars, each arriving in its own time. */
function drawSky(scene: Phaser.Scene): void {
  // Twenty-odd little lights, coming on the way stars actually do: not together.
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = 40 + Math.random() * (GAME_WIDTH - 80);
    // Top two-thirds only. A star down where the floor is reads as a bug.
    const y = 30 + Math.random() * (GAME_HEIGHT * 0.62);
    const size = 1.6 + Math.random() * 2.2;

    const star = scene.add
      .circle(x, y, size, 0xffffff, 1)
      .setScrollFactor(0)
      .setAlpha(0)
      .setDepth(CURTAIN_DEPTH + 1);

    scene.tweens.add({
      targets: star,
      alpha: { from: 0, to: 0.55 + Math.random() * 0.45 },
      duration: 320 + Math.random() * 500,
      delay: Math.random() * 700,
      // And they keep twinkling for as long as the night lasts, each on its own
      // clock — three lights breathing in step read as one machine. Same trick
      // as the faeries, and for the same reason.
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // The moon, top right, out of the way of anything the sky is about.
  const at = { x: GAME_WIDTH - 190, y: 130 };
  makeGlow(scene, at.x, at.y, 190, 0xfff0c0, 0.34)
    .setScrollFactor(0)
    .setDepth(CURTAIN_DEPTH + 1);

  // A crescent, made by biting a night-coloured circle out of a pale one. There
  // is no erase in Phaser's Graphics, and against a curtain that is one flat
  // colour there does not need to be.
  const moon = scene.add.graphics().setScrollFactor(0).setDepth(CURTAIN_DEPTH + 2);
  moon.fillStyle(0xfff6dc, 1);
  moon.fillCircle(at.x, at.y, 46);
  moon.fillStyle(NIGHT, 1);
  moon.fillCircle(at.x + 22, at.y - 12, 44);
  moon.setAlpha(0);
  scene.tweens.add({ targets: moon, alpha: 1, duration: 700, ease: 'Sine.easeOut' });
}

/** Sleep, coming off her: soft lights that rise a little way and go out. */
function drawMotes(scene: Phaser.Scene, target: NightTarget): void {
  const from = onScreen(scene, target.x, target.y);

  for (let i = 0; i < MOTE_COUNT; i++) {
    const mote = makeGlow(scene, from.x, from.y - 40, 34, 0xcfe0ff, 0)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 1);

    scene.tweens.add({
      targets: mote,
      // Up and gently off to one side, growing as it goes — a thing leaving,
      // rather than a thing travelling somewhere.
      y: mote.y - 130 - Math.random() * 70,
      x: mote.x + (Math.random() - 0.5) * 120,
      scale: { from: mote.scale * 0.5, to: mote.scale * 1.4 },
      alpha: { from: 0, to: 0.75 },
      duration: 900 + Math.random() * 400,
      delay: i * 190,
      ease: 'Sine.easeOut',
      onComplete: () => {
        scene.tweens.add({ targets: mote, alpha: 0, duration: 420 });
      },
    });
  }
}

/**
 * Morning, in the zone that was rebuilt while the screen was dark.
 *
 * It opens on the same night the last scene closed on — same colour, same
 * opacity — so the restart happens inside a single unbroken picture. Then the
 * warm comes up through it, the chime runs back up the notes the night ran
 * down, and the whole lot gets out of the way of a room she has not seen since
 * yesterday.
 */
export function playSunrise(scene: Phaser.Scene, target: NightTarget): void {
  const night = curtain(scene, NIGHT, 1);
  const morning = curtain(scene, MORNING, 0);

  // The sun, as far as this game is concerned: the light arrives *from* her,
  // because she is the thing waking up.
  //
  // The one thing here left in world space, and it has to be: this runs inside
  // the scene's `create`, where the camera has been pointed at her but has not
  // yet clamped itself to the edges of the map — so asking it where she is on
  // screen gets the answer "the middle", and in a room she is standing at the
  // edge of that is half the floor away from her. The depth is what keeps it
  // over the curtain; the scroll factor was never what was doing that.
  const sun = makeGlow(scene, target.x, target.y, 260, 0xfff3cf, 0).setDepth(CURTAIN_DEPTH + 1);

  playWakeChime();

  scene.tweens.add({ targets: night, alpha: 0, duration: BLOOM_MS, ease: 'Sine.easeIn' });
  scene.tweens.add({
    targets: [morning, sun],
    alpha: { from: 0, to: 1 },
    duration: BLOOM_MS,
    ease: 'Sine.easeIn',
    onComplete: () => {
      // The blink. Everything that was hiding the room stops hiding it and the
      // camera catches the light.
      scene.cameras.main.flash(260, 255, 246, 225);
      // The burst that goes with it comes a beat later, because it is thrown by
      // the world's own emitter and the world is still behind a sheet of morning
      // at this instant — fired now it would spend its life invisible and be
      // over by the time the sheet cleared.
      scene.time.delayedCall(CLEAR_MS * 0.35, () => {
        target.sparkles.explode(70, target.x, target.y - 40);
      });

      // Two tweens, not one: the sun swells as it goes and the sheet of colour
      // behind it must not, or the last thing she sees of the night is a
      // rectangle growing.
      scene.tweens.add({
        targets: sun,
        alpha: 0,
        scale: sun.scale * 1.6,
        duration: CLEAR_MS,
        ease: 'Quad.easeOut',
      });
      scene.tweens.add({
        targets: morning,
        alpha: 0,
        duration: CLEAR_MS,
        ease: 'Quad.easeOut',
        onComplete: () => {
          night.destroy();
          morning.destroy();
          sun.destroy();
        },
      });
    },
  });
}
