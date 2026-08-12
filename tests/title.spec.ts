import { test, expect } from '@playwright/test';
import { GREETING_LINE, openTitle, readHooks, type Hooks } from './harness';

/**
 * The whole front door, in one page load.
 *
 * It used to be three tests — the title sits there, the press speaks, the room
 * opens — and they were three boots of the same sequence, because each one is
 * the next moment of the one before. The assertions are all still here; only the
 * two extra page loads have gone.
 */
test('the title screen speaks its greeting and hands over to the room', async ({ page }) => {
  const { errors } = await openTitle(page);

  const idle = await readHooks(page);
  expect(idle.scene, 'the title screen is the entry point').toBe('title');
  expect(idle.ready, 'the room is not playable yet').toBe(false);
  expect(idle.voice.lineId, 'nobody is talking yet').toBeNull();

  // `openTitle` clicks the canvas to focus the page; it must not be mistaken for
  // the press. If a stray mouse click ever starts the game, it skips the front
  // door.
  await page.waitForTimeout(250);
  expect((await readHooks(page)).scene, 'a click alone does not start the game').toBe('title');

  await page.keyboard.press('Enter');

  // The greeting is the reward for pressing, and it is spoken on the title
  // screen — the room does not exist yet at this point.
  await page.waitForFunction(
    (id) => (window as unknown as { __seraphina: Hooks }).__seraphina.voice.lineId === id,
    GREETING_LINE,
    { timeout: 20_000 },
  );

  const greeting = await readHooks(page);
  expect(greeting.scene, 'still on the title while she says hello').toBe('title');
  expect(greeting.audio, 'the press is what unlocks the AudioContext').toBe('running');
  expect(greeting.voice.words.join(' '), 'the greeting shows its words').toBe("Hi! Let's play!");

  await page.waitForFunction(
    () => (window as unknown as { __seraphina: Hooks }).__seraphina.ready === true,
    undefined,
    { timeout: 20_000 },
  );

  const playing = await readHooks(page);
  expect(playing.scene, 'the room is live').toBe('room');
  expect(playing.ready, 'and finished creating').toBe(true);
  expect(playing.audio, 'audio stays unlocked across the scene change').toBe('running');

  // The title screen loaded the manifest and handed the bank over, so the room
  // never waits on a second fetch.
  expect(playing.voice.loaded, 'voice arrives with the room').toBe(true);
  expect(playing.voice.ids, 'including the greeting').toContain(GREETING_LINE);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
