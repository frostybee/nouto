import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: {
      '@nouto/core': resolve(__dirname, '../core/src'),
      '@nouto/transport': resolve(__dirname, '../transport/src'),
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.svelte.ts', '.svelte'],
    // Client-side Svelte in jsdom: without this, the 'node' condition picks
    // svelte's server entry, where mount() throws (component tests need it).
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: true,
    server: {
      deps: {
        // codemirror-json-schema's dist uses extensionless ESM imports that
        // Node's resolver rejects; inline it so Vite resolves them.
        inline: ['codemirror-json-schema'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/stores/**/*.{ts,svelte.ts}'],
      exclude: ['src/stores/index.ts', 'src/stores/index.svelte.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['src/test/setup.ts'],
  },
});
