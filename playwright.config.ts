import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
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
