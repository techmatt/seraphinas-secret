import { test, expect } from '@playwright/test';
import {
  bootGame,
  closeUpOfHer,
  readHooks,
  shot,
  standAt,
  walk,
  walkAndRead,
  type Hooks,
} from './harness';

test('she is a drawn character, out of the side-loaded pack', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  const boot = await readHooks(page);

  // The art is a licensed pack that lives outside the repo and is copied in by
  // `npm run assets:sync`. A missing sheet is not an exception in Phaser — she
  // would animate away as a green square — so this is the assertion that fails
  // when the pipeline has not run.
  expect(boot.player.artLoaded, 'every layer of her sprite loaded').toBe(true);

  // Standing still is an animation of its own, not a held frame.
  expect(boot.player.anim, 'she idles the way the map spawns her').toBe('idle-down');
  expect(boot.player.facing).toBe('down');

  await canvas.screenshot({ path: shot('11-player.png') });

  // Close up, on the open green of the village lawn, which is the ground her
  // gold hair has to stay legible against. The blessed outfit's hair is the one
  // thing about her that changed and the one thing a 1280-wide frame cannot
  // show — she is seventy pixels tall in every other picture in this folder.
  await standAt(page, 'green');
  await closeUpOfHer(page, '13-player-hair.png');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('walking turns her to face the way she is going', async ({ page }) => {
  const { canvas, errors } = await bootGame(page);

  const down = await walkAndRead(page, 'ArrowDown', 250);
  expect(down.player.facing, 'down turns her towards the room').toBe('down');
  expect(down.player.anim).toBe('walk-down');

  const up = await walkAndRead(page, 'ArrowUp', 250);
  expect(up.player.facing, 'up turns her away').toBe('up');
  expect(up.player.anim).toBe('walk-up');

  const right = await walkAndRead(page, 'ArrowRight', 250);
  expect(right.player.facing).toBe('right');
  expect(right.player.anim).toBe('walk-right');

  // Mid-stride, frozen: the audit frame for the walk cycle.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.evaluate(() => (window as unknown as { __seraphina: Hooks }).__seraphina.pause());
  await canvas.screenshot({ path: shot('12-player-walk.png') });
  await page.keyboard.up('ArrowRight');

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('walking left plays the right-hand animation, mirrored', async ({ page }) => {
  const { errors } = await bootGame(page);

  const right = await walkAndRead(page, 'ArrowRight', 250);
  expect(right.player.anim).toBe('walk-right');
  expect(right.player.flipped, 'the sheet is drawn facing right').toBe(false);

  const left = await walkAndRead(page, 'ArrowLeft', 250);
  // The pack draws down, up and right only; left is the author's stated intent
  // for a flip, so there is no `walk-left` to find. If one ever appears here,
  // something has invented an animation the art does not have.
  expect(left.player.facing, 'she is facing left').toBe('left');
  expect(left.player.anim, 'and doing it with the right-hand row').toBe('walk-right');
  expect(left.player.flipped, 'mirrored').toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});

test('letting go idles her where she stands, still facing the way she went', async ({ page }) => {
  const { errors } = await bootGame(page);

  await walk(page, 'ArrowUp', 250);
  const stopped = await readHooks(page);
  expect(stopped.player.anim, 'the walk stops').toBe('idle-up');
  expect(stopped.player.facing, 'the facing does not').toBe('up');

  await walk(page, 'ArrowLeft', 250);
  const stoppedLeft = await readHooks(page);
  expect(stoppedLeft.player.anim).toBe('idle-right');
  expect(stoppedLeft.player.flipped).toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
