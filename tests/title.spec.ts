import { test, expect } from '@playwright/test';
import { GREETING_LINE, freeze, openTitle, pressStart, readHooks, snap, type Hooks } from './harness';

test('the game opens on the title screen, not in the room', async ({ page }) => {
  const { errors } = await openTitle(page);

  const idle = await readHooks(page);
  expect(idle.scene, 'the title screen is the entry point').toBe('title');
  expect(idle.ready, 'the room is not playable yet').toBe(false);
  expect(idle.voice.lineId, 'nobody is talking yet').toBeNull();

  await snap(page, '01-title.png');

  // A click focuses the page; it must not be mistaken for the press. If this
  // ever starts the game, a stray mouse click skips the front door.
  await page.waitForTimeout(250);
  expect((await readHooks(page)).scene, 'a click alone does not start the game').toBe('title');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the press unlocks audio, speaks a greeting, then opens the room', async ({ page }) => {
  const { errors } = await openTitle(page);

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

  // Let the burst spread, then freeze it — particles outlive neither the
  // screenshot round trip nor the transition.
  await page.waitForTimeout(140);
  await freeze(page);
  await snap(page, '02-title-greeting.png');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the room is playable once the title screen hands over', async ({ page }) => {
  const { errors } = await openTitle(page);
  await pressStart(page);

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
