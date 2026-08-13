/**
 * What used to be the room table.
 *
 * There were two vector rooms and a table describing everything in them. There
 * are now two *zones* — one scrolling exterior and one scrolling house — and
 * everything in them lives in generated map data under `public/world/`, because
 * a wood is four hundred trees and nobody is typing those into a table.
 *
 * So all that is left here is the list of zones that exist and which one the
 * front door opens onto. Adding a zone is a layout in `content/world/`, a
 * `world:build`, and a name in this list. It is still never a new scene.
 *
 * `SpawnDef.facing` used to be -1 / 0 / 1, from before the character had four
 * directions drawn. It is now a plain Direction in the map data — the fold the
 * last prompt deferred — and the translation it needed has gone with it.
 */

export type ZoneId = 'outside' | 'house' | 'cave';

export const ZONE_IDS: readonly ZoneId[] = ['outside', 'house', 'cave'];

/** Where the title screen opens the door onto. */
export const STARTING_ZONE: ZoneId = 'outside';

export function isZoneId(id: string): id is ZoneId {
  return (ZONE_IDS as readonly string[]).includes(id);
}

/**
 * The zones with a sky over them.
 *
 * The day cycle runs everywhere — it is a clock, and a clock does not stop
 * because she went indoors — but only these have an *evening*: the tint, the
 * lamps coming on and the fireflies are all things that happen outside. Matt's
 * rule for the rest is that the house stays warm and the cave keeps its own
 * light, which is exactly the same thing as not being in this list.
 */
export const OUTDOOR_ZONES: readonly ZoneId[] = ['outside'];

export function isOutdoors(id: ZoneId): boolean {
  return OUTDOOR_ZONES.includes(id);
}
