import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { SoundDebugScene } from './debug/SoundDebugScene';
import { RoomScene } from './scenes/RoomScene';
import { TitleScene } from './scenes/TitleScene';
import { installTestHooks } from './testHooks';

installTestHooks();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#140d1c',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    gamepad: true,
  },
  // Only the first entry starts on its own. The title screen is the one door in.
  // The sound debug view is registered and never started: the room launches it
  // on a keyboard key, which is the whole of what makes it unreachable from the
  // pad — see `debug/SoundDebugScene.ts`.
  scene: [TitleScene, RoomScene, SoundDebugScene],
};

new Phaser.Game(config);
