import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://maxtitan.me:3000';

export default defineConfig({
  testDir: './tests/e2e',

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  globalSetup: './tests/setup/global-setup.ts',

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ru-RU',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        storageState: 'tests/.auth/user.json',
      },
    },
  ],

  webServer: process.env.PLAYWRIGHT_SKIP_SERVER
    ? undefined
    : {
        command: 'npm run dev:https',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        ignoreHTTPSErrors: true,
      },
});
