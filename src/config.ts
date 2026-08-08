/**
 * Design resolution. The canvas scales to fit whatever window it lands in, so
 * every scene can lay itself out against these numbers and forget about the
 * real window size.
 *
 * These live apart from main.ts on purpose: main.ts constructs the game as a
 * side effect, and scenes importing the entry point back would be a cycle.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
