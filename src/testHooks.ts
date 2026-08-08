/**
 * The only surface Playwright is allowed to touch.
 *
 * Automated tests need to know the game booted and where the character is
 * without reading pixels. Keeping that on one narrow object means gameplay code
 * never grows test-shaped hacks, and the test spec has exactly one contract to
 * break.
 */
export interface TestHooks {
  /** Flips true once the room scene has finished create(). */
  ready: boolean;
  /** Character position in world space. */
  player: { x: number; y: number };
  /** The interactable's position, so tests can steer instead of guessing. */
  stone: { x: number; y: number };
  /** How close the character must get before the interaction will fire. */
  interactRadius: number;
  /** How many times the juicy interaction has fired. */
  sparkles: number;
  /** Particles currently alive. */
  aliveParticles: number;
  /**
   * High-water mark of aliveParticles. A burst is gone within a second, which is
   * easily less than a screenshot round trip, so the instantaneous count cannot
   * tell "never emitted" from "read too late". This can.
   */
  peakParticles: number;
  /**
   * Freeze the scene so a screenshot catches the juice mid-flight. Paused scenes
   * still render, they just stop updating.
   */
  pause: () => void;
}

declare global {
  interface Window {
    __seraphina?: TestHooks;
  }
}

export const hooks: TestHooks = {
  ready: false,
  player: { x: 0, y: 0 },
  stone: { x: 0, y: 0 },
  interactRadius: 0,
  sparkles: 0,
  aliveParticles: 0,
  peakParticles: 0,
  pause: () => undefined,
};

export function installTestHooks(): void {
  window.__seraphina = hooks;
}
