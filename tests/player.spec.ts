import { test, expect } from '@playwright/test';
import { bootGame, readHooks, walk, walkAndRead } from './harness';

/**
 * Everything about how she is drawn and which way she faces, in one boot.
 *
 * Four tests once, one per direction and one for letting go, each of them paying
 * for its own page load to hold a key for a quarter of a second. The claims are
 * unchanged; the boots are not.
 */
test('she is a drawn character who faces the way she walks', async ({ page }) => {
  const { errors } = await bootGame(page);

  const boot = await readHooks(page);

  // The art is a licensed pack that lives outside the repo and is copied in by
  // `npm run assets:sync`. A missing sheet is not an exception in Phaser — she
  // would animate away as a green square — so this is the assertion that fails
  // when the pipeline has not run.
  expect(boot.player.artLoaded, 'every layer of her sprite loaded').toBe(true);

  // Standing still is an animation of its own, not a held frame.
  expect(boot.player.anim, 'she idles the way the map spawns her').toBe('idle-down');
  expect(boot.player.facing).toBe('down');

  const down = await walkAndRead(page, 'ArrowDown', 250);
  expect(down.player.facing, 'down turns her towards the room').toBe('down');
  expect(down.player.anim).toBe('walk-down');

  const up = await walkAndRead(page, 'ArrowUp', 250);
  expect(up.player.facing, 'up turns her away').toBe('up');
  expect(up.player.anim).toBe('walk-up');

  const right = await walkAndRead(page, 'ArrowRight', 250);
  expect(right.player.facing).toBe('right');
  expect(right.player.anim).toBe('walk-right');
  expect(right.player.flipped, 'the sheet is drawn facing right').toBe(false);

  // The pack draws down, up and right only; left is the author's stated intent
  // for a flip, so there is no `walk-left` to find. If one ever appears here,
  // something has invented an animation the art does not have.
  const left = await walkAndRead(page, 'ArrowLeft', 250);
  expect(left.player.facing, 'she is facing left').toBe('left');
  expect(left.player.anim, 'and doing it with the right-hand row').toBe('walk-right');
  expect(left.player.flipped, 'mirrored').toBe(true);

  // Letting go idles her where she stands, still facing the way she went.
  await walk(page, 'ArrowUp', 250);
  const stopped = await readHooks(page);
  expect(stopped.player.anim, 'the walk stops').toBe('idle-up');
  expect(stopped.player.facing, 'the facing does not').toBe('up');

  await walk(page, 'ArrowLeft', 250);
  const stoppedLeft = await readHooks(page);
  expect(stoppedLeft.player.anim, 'and an idle is mirrored the same way a walk is').toBe(
    'idle-right',
  );
  expect(stoppedLeft.player.flipped).toBe(true);

  expect(errors, 'no uncaught page errors').toEqual([]);
});
