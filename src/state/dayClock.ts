/**
 * How long she has been awake.
 *
 * The whole of the day cycle, and it is deliberately one number: milliseconds
 * since she last woke up. Everything else in the evening — how blue the world
 * is, how bright the lamps are, whether there are fireflies out, whether Dad has
 * called yet — is read off that number, so there is exactly one thing that can
 * be wrong about what time of day it is.
 *
 * **It drives ambience and nothing else** (Matt, 2026-08-13). Nothing gates on
 * it, nothing is forced, and the day does not end on its own: dusk comes in and
 * then *stays*, for as long as she wants to keep playing. She sleeps when she
 * chooses, which is the bed and the green button, exactly as before. A clock
 * that could end the day would be a timer, and a timer is a fail state with a
 * friendly face — see CLAUDE.md, "No fail states".
 *
 * It lives beside the session store rather than in a scene because a scene is
 * rebuilt on every doorway and the afternoon is not. It is not *in* the store:
 * the store is what she has done, and this is what time it is.
 */

/**
 * The shape of a day, in milliseconds.
 *
 * Ten minutes end to end, which is about as long as a four-year-old plays in
 * one sitting — so an ordinary session sees the light go, and a long one plays
 * on in the evening rather than being turned out of it. Both halves are here
 * together because the only interesting thing about either number is the other
 * one: eight minutes of nothing happening is what makes the two minutes of
 * something happening land.
 */
export const DAY = {
  /** Full daylight, from the moment she wakes. */
  daylightMs: 8 * 60_000,
  /** How long the light then takes to get all the way down to the cozy floor. */
  duskMs: 2 * 60_000,
} as const;

/** A frame from a tab that was in the background is a stall, not an afternoon. */
const MAX_FRAME_MS = 250;

class DayClock {
  private awake = 0;
  private called = false;

  /** Called once a frame by whichever zone is on screen. */
  tick(deltaMs: number): void {
    this.awake += Math.min(deltaMs, MAX_FRAME_MS);
  }

  /**
   * Morning. Called by the night sweep — see `state/sleep.ts` — and true of a
   * fresh page load by construction, because a fresh page load is a fresh clock.
   */
  wake(): void {
    this.awake = 0;
    this.called = false;
  }

  /** Milliseconds since she woke. */
  get elapsedMs(): number {
    return this.awake;
  }

  /**
   * How far into the evening it is: 0 in full daylight, 1 once the light has
   * finished going down.
   *
   * It holds at 1 rather than carrying on into night, and that is the design:
   * the world gets cozy and then stays cozy. There is no hour at which it is
   * too dark to play.
   */
  get dusk(): number {
    if (this.awake <= DAY.daylightMs) return 0;
    return Math.min(1, (this.awake - DAY.daylightMs) / DAY.duskMs);
  }

  /** True from the first instant the light starts going. */
  get isDusk(): boolean {
    return this.dusk > 0;
  }

  /**
   * Has Dad called her in yet today?
   *
   * A latch rather than a time, because what it has to survive is *zones*: dusk
   * can arrive while she is down the cave, and the call belongs to the yard. So
   * the question is asked again in every zone she walks into, and this is what
   * stops it being asked twice. Once a day, and never a nag.
   */
  get dadCalled(): boolean {
    return this.called;
  }

  /** He is calling now. Returns false if he already has today. */
  dadCalls(): boolean {
    if (this.called) return false;
    this.called = true;
    return true;
  }

  /**
   * Push the clock forward. **Tests only.**
   *
   * The suite cannot wait eight minutes for the light to go, and a test that
   * shortened the constants would be testing a different day from the one she
   * plays. So it skips ahead in the same clock instead, which leaves every
   * threshold in the game exactly where it really is.
   */
  warp(ms: number): void {
    this.awake = Math.max(0, this.awake + ms);
  }
}

/** Hers, for as long as the page is open — the same deal `session` has. */
export const dayClock = new DayClock();
