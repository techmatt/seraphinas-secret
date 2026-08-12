/**
 * The only way this game ever asks for a button press.
 *
 * The rule this implements — colored dots, never letter labels, and which colour
 * means which button — lives in CLAUDE.md under "Standing design rules". This
 * file is where it is built, not where it is decided.
 */

import Phaser from 'phaser';

/** Xbox 360 face buttons, as a child sees them. */
export const PAD_COLOR = {
  a: 0x44d95a,
  b: 0xe8483f,
  x: 0x3d7fe0,
  y: 0xf2c43d,
} as const;

/**
 * The same four, the other way round: colour name to face button.
 *
 * The ritual asks for buttons by colour out loud — "press the red button" — and
 * this is the one place that sentence is turned back into a button. It belongs
 * here with the rest of the pad, so that the rules layer can talk about a red
 * button without knowing there is such a thing as a B.
 */
export const FACE_BY_COLOR = { green: 'a', red: 'b', blue: 'x', yellow: 'y' } as const;

/** A colour the pad actually has. */
export type PadColorName = keyof typeof FACE_BY_COLOR;

export function padColor(name: PadColorName): number {
  return PAD_COLOR[FACE_BY_COLOR[name]];
}

/** Texture key for the soft radial blob every glow in the game is made of. */
export const GLOW_TEXTURE = 'glow';

/** Radius the glow texture is drawn at, so callers can scale to a real size. */
const GLOW_RADIUS = 128;

/**
 * Bake the soft blob once per game. A flat circle would put a hard edge around
 * the light, which reads as a disc lying on the background rather than as glow
 * coming off the button.
 */
export function ensureGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_TEXTURE)) return;

  const size = GLOW_RADIUS * 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const steps = 48;
  for (let i = steps; i > 0; i--) {
    // Squared falloff, so the edge disappears rather than banding.
    const t = i / steps;
    g.fillStyle(0xffffff, 0.05 * (1 - t) ** 2 + 0.003);
    g.fillCircle(GLOW_RADIUS, GLOW_RADIUS, GLOW_RADIUS * t);
  }
  g.generateTexture(GLOW_TEXTURE, size, size);
  g.destroy();
}

/** A soft pool of light, sized in design pixels rather than texture scale. */
export function makeGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Image {
  ensureGlowTexture(scene);
  return scene.add
    .image(x, y, GLOW_TEXTURE)
    .setScale(radius / GLOW_RADIUS)
    .setTint(color)
    .setAlpha(alpha)
    .setBlendMode(Phaser.BlendModes.ADD);
}

export interface ButtonDotOptions {
  /** Face colour; one of PAD_COLOR. */
  color?: number;
  /** Radius of the button face, in design pixels. */
  radius?: number;
  /** Breathe in and out forever, to pull the eye. */
  pulse?: boolean;
}

/**
 * A glowing face button. Returns a container so callers can tween, hide or move
 * the whole thing as one object.
 */
export function makeButtonDot(
  scene: Phaser.Scene,
  x: number,
  y: number,
  { color = PAD_COLOR.a, radius = 20, pulse = false }: ButtonDotOptions = {},
): Phaser.GameObjects.Container {
  // Additive, so the glow adds its colour to the room instead of veiling it —
  // a translucent green disc over a dark floor just turns the floor grey.
  const halo = makeGlow(scene, 0, 0, radius * 3.4, color, 0.75);
  const bloom = makeGlow(scene, 0, 0, radius * 1.7, color, 0.9);

  const face = scene.add.circle(0, 0, radius, color).setStrokeStyle(radius * 0.16, 0xffffff, 0.9);

  // A highlight up and left reads as "this is a physical thing you can push".
  const shine = scene.add.circle(-radius * 0.3, -radius * 0.34, radius * 0.3, 0xffffff, 0.55);

  const dot = scene.add.container(x, y, [halo, bloom, face, shine]);

  if (pulse) {
    scene.tweens.add({
      targets: [halo, bloom],
      scaleX: { from: 0.82, to: 1.18 },
      scaleY: { from: 0.82, to: 1.18 },
      alpha: { from: 0.55, to: 1 },
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: face,
      scale: { from: 1, to: 1.09 },
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return dot;
}
