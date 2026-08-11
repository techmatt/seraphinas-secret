import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // One at a time, deliberately, and measured rather than assumed. Headless
  // Chromium draws this game in software, and the harness steers by holding a
  // key for a wall-clock interval — so a second browser does not halve the run,
  // it slows the frame rate of both. Two workers: 24% off world.spec's wall
  // clock and a walking test dropped. Four: individual tests went from ten
  // seconds to five minutes and most of them timed out. The suite is
  // latency-bound, not throughput-bound, and there is nothing here to spread.
  fullyParallel: false,
  workers: 1,
  // A failure is worth a trace; twenty-six passes are not. `retain-on-failure`
  // records every test and then throws the recording away, and recording means
  // a DOM snapshot per action — of which walking across the world is hundreds.
  // That was 44% of world.spec: 2.9 min with tracing against 1.7 min without.
  // So the trace is bought on the retry, which only a failing test ever takes.
  // For a trace of a run that passed, ask for one: `npm test -- --trace on`.
  retries: 1,
  reporter: [['list']],
  // The world is several screens across now and the harness steers by walking,
  // one round trip per hop, at the fifteen frames a second headless Chromium
  // manages. Crossing it honestly takes most of a minute.
  timeout: 150_000,

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    launchOptions: {
      // The chime is synthesised on a keypress, but headless Chromium is
      // stricter than a real browser about what counts as a gesture.
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
