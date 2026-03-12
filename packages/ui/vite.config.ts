import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.svelte.ts', '.svelte.js', '.svelte'],
    alias: {
      '@hivefetch/core': resolve(__dirname, '../core/src'),
      '@hivefetch/transport': resolve(__dirname, '../transport/src'),
    },
  },
  build: {
    outDir: '../vscode/webview-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        bundle: resolve(__dirname, 'src/main.ts'),
        sidebar: resolve(__dirname, 'src/sidebar-main.ts'),
        runner: resolve(__dirname, 'src/runner-main.ts'),
        mock: resolve(__dirname, 'src/mock-main.ts'),
        benchmark: resolve(__dirname, 'src/benchmark-main.ts'),
        settings: resolve(__dirname, 'src/settings-main.ts'),
        palette: resolve(__dirname, 'src/palette-main.ts'),
        environments: resolve(__dirname, 'src/environments-main.ts'),
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
    // Disable CSS code splitting so all styles for each entry point
    // are bundled into a single CSS file. VS Code webviews can't
    // dynamically load shared CSS chunks.
    cssCodeSplit: false,
    // Don't minify for easier debugging during development
    minify: false,
    sourcemap: true,
  },
});
