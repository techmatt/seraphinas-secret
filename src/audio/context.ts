/**
 * One AudioContext for the whole game.
 *
 * Chimes and voice share it deliberately: it is the thing a browser gates
 * behind a user gesture, so one context means one unlock to get right, and
 * `currentTime` on it is the clock the word highlighting rides on.
 */

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * Browsers start an AudioContext suspended until a user gesture. Call this from
 * any input handler; it is cheap and safe to call repeatedly.
 */
export function unlockAudio(): void {
  const c = getAudioContext();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}
