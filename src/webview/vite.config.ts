import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        bundle: resolve(__dirname, 'src/main.ts'),
        sidebar: resolve(__dirname, 'src/sidebar-main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Route CSS files to their corresponding bundles
          if (assetInfo.name?.endsWith('.css')) {
            return '[name][extname]';
          }
          return 'assets/[name][extname]';
        },
        format: 'es',
        // Keep each entry point self-contained
        manualChunks: undefined,
      },
    },
    // Don't minify for easier debugging during development
    minify: false,
    sourcemap: true,
  },
});
