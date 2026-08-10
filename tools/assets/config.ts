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
 */
export const CATEGORIES = ['Cute_Fantasy/Player'];

/** For the failure message and the README attribution. */
export const PACK_NAME = 'Cute Fantasy RPG by Kenmi';
export const PACK_URL = 'https://kenmi-art.itch.io/cute-fantasy-rpg';
