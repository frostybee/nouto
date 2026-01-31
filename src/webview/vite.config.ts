import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'HiveFetch',
      formats: ['iife'],
      fileName: () => 'bundle.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'bundle[extname]',
      },
    },
    // Generate a single bundle file
    cssCodeSplit: false,
    // Don't minify for easier debugging during development
    minify: false,
    sourcemap: true,
  },
});
