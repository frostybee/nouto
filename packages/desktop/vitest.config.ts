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
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: true,
    setupFiles: ['src/test/setup.ts'],
  },
});
