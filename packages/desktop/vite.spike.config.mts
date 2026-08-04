/**
 * Phase 0a spike build config (dev-only, never shipped): builds
 * spike-monaco.html standalone so the Monaco + monaco-yaml evaluation runs
 * against production chunks — the artifact that matters for the CSP and
 * lazy-load-size criteria. Delete together with spike-monaco.html and
 * src/spike/ when the spike concludes.
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@nouto/core': resolve(__dirname, '../core/src'),
    },
  },
  build: {
    outDir: 'dist-spike',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'spike-monaco.html'),
    },
  },
  preview: {
    port: 5176,
    strictPort: true,
  },
});
