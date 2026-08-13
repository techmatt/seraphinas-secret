/**
 * Where the bought art lives, and which of it the game is allowed to use.
 *
 * The Cute Fantasy RPG pack is licensed but not redistributable, so it is
 * side-loaded outside the repo and never committed. This file is the one place
 * that knows both halves of that arrangement: the path to the side-load, and
 * the list of categories `npm run assets:sync` mirrors into `public/assets/`.
 * Wanting a new category — tiles, trees, NPCs — is a one-line change here.
 */

import path from 'node:path';

/**
 * The extracted pack. Overridable so a second machine does not have to edit a
 * tracked file to build.
 */
export const PACK_DIR = process.env.SERAPHINA_ASSETS ?? 'C:\\Code\\seraphinas-assets';

/** Mirror destination. Gitignored and disposable — delete it and re-sync. */
export const PUBLIC_DIR = path.join('public', 'assets');

/**
 * Pack-relative folders the game actually loads. Paths under `public/assets/`
 * keep this shape exactly, so a texture's URL is readable straight off this
 * list: `assets/Cute_Fantasy/Player/Player_Base/Player_Base_animations.png`.
 *
 * These are whole folders rather than individual files because the tile world
 * is composed from them: `tools/world/catalog.ts` names the exact PNGs and the
 * exact rectangles inside them, and a folder here is what makes those PNGs
 * reachable at all. Widening this list is how a future prompt gets at animals,
 * NPCs or the desert pack.
 */
export const CATEGORIES = [
  'Cute_Fantasy/Player',
  'Cute_Fantasy/Tiles',
  'Cute_Fantasy/Trees',
  'Cute_Fantasy/Buildings',
  'Cute_Fantasy/Outdoor decoration',
  'Cute_Fantasy/Crops',
  // The item icons, for the tool row. The only folder here the tile world does
  // not draw from: `src/ui/toolIcons.ts` names the rectangles instead of
  // `tools/world/catalog.ts`, because the HUD is not a place in the world and
  // the generator has no business knowing what an axe looks like in a box.
  'Cute_Fantasy/Icons',
  // The UI pack's icon sheet, for the coin. A separate download from the base
  // pack and the first folder here that is not `Cute_Fantasy/` — the coin is the
  // one thing in the game the base pack has no picture of at all. Only `UI/` is
  // mirrored; the sibling `Fonts/` is a TTF nothing loads.
  'Cute_Fantasy_UI/UI',
];

/** For the failure message and the README attribution. */
export const PACK_NAME = 'Cute Fantasy RPG by Kenmi';
export const PACK_URL = 'https://kenmi-art.itch.io/cute-fantasy-rpg';
