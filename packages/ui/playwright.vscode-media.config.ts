import { defineConfig } from '@playwright/test';

/**
 * Records README GIFs in real VS Code served by `code serve-web`
 * (tests/media/README.md). The server is started separately by the user.
 */
export default defineConfig({
  testDir: './tests/media',
  testMatch: /vscode-gifs\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  reporter: [['list']],
});
