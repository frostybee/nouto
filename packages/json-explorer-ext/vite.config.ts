import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.svelte.ts', '.svelte.js', '.svelte'],
    alias: {
      '@nouto/core': resolve(__dirname, '../core/src'),
      '@nouto/json-explorer': resolve(__dirname, '../json-explorer/src'),
      '@nouto/ui': resolve(__dirname, '../ui/src'),
    },
    dedupe: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/lint',
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/lang-json',
      '@lezer/common',
    ],
  },
  build: {
    outDir: 'webview-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'json-explorer': resolve(__dirname, 'webview/main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return '[name][extname]';
          }
          return 'assets/[name][extname]';
        },
        format: 'es',
        manualChunks: undefined,
      },
    },
    cssCodeSplit: false,
    minify: true,
    sourcemap: true,
  },
});
