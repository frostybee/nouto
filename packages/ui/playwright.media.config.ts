import { defineConfig } from '@playwright/test';

/**
 * Records README GIFs of the real request panel in a browser harness
 * (tests/media). Separate from the security suite in playwright.config.ts.
 */
export default defineConfig({
  testDir: './tests/media',
  testMatch: /(^|[\\/])gifs\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5198',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npx vite --port 5198 --strictPort',
    url: 'http://localhost:5198/tests/media/harness.html',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
