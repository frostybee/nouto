import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@nouto/core': resolve(__dirname, '../core/src'),
      '@nouto/transport': resolve(__dirname, '../transport/src'),
      '@nouto/ui': resolve(__dirname, '../ui/src'),
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
    setupFiles: ['src/test/setup.ts'],
  },
});
