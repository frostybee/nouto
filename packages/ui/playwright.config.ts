import { defineConfig } from '@playwright/test';

/**
 * Security harness for the sandboxed OpenAPI documentation preview. Runs the
 * real preview shell in a browser against a Vite dev server; unrelated to the
 * Vitest unit suite and excluded from coverage thresholds.
 */
export default defineConfig({
  testDir: './tests/security',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/tests/security/fixture.html',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
