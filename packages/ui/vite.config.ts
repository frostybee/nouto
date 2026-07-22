import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';

/**
 * Copies the raw renderer bundles into webview-dist/renderer-assets/ so the
 * extension HOST can build the standalone "open docs in browser" snapshot at
 * runtime. webview-dist/** is whitelisted in packages/vscode/.vscodeignore,
 * so these ship in the .vsix automatically. closeBundle runs after the build
 * output is written, surviving emptyOutDir.
 */
function copyRendererAssets(): Plugin {
  return {
    name: 'nouto-copy-renderer-assets',
    closeBundle() {
      const require = createRequire(import.meta.url);
      const outDir = resolve(__dirname, '../vscode/webview-dist/renderer-assets');
      mkdirSync(outDir, { recursive: true });
      const assets: Array<[string, string]> = [
        ['swagger-ui-dist/swagger-ui-bundle.js', 'swagger-ui-bundle.js'],
        ['swagger-ui-dist/swagger-ui.css', 'swagger-ui.css'],
        ['rapidoc/dist/rapidoc-min.js', 'rapidoc-min.js'],
      ];
      for (const [source, target] of assets) {
        copyFileSync(require.resolve(source), resolve(outDir, target));
      }
    },
  };
}

export default defineConfig({
  plugins: [svelte(), copyRendererAssets()],
  base: './',
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.svelte.ts', '.svelte.js', '.svelte'],
    alias: {
      '@nouto/core': resolve(__dirname, '../core/src'),
      '@nouto/transport': resolve(__dirname, '../transport/src'),
      '@nouto/json-explorer': resolve(__dirname, '../json-explorer/src'),
      '@nouto/ui': resolve(__dirname, 'src'),
    },
    dedupe: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/lint',
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/lang-json',
      '@codemirror/lang-yaml',
      '@lezer/common',
    ],
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
        'app-settings': resolve(__dirname, 'src/app-settings-main.ts'),
        palette: resolve(__dirname, 'src/palette-main.ts'),
        environments: resolve(__dirname, 'src/environments-main.ts'),
        'json-explorer': resolve(__dirname, 'src/json-explorer-main.ts'),
        'openapi-preview': resolve(__dirname, 'src/openapi-preview-main.ts'),
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
    minify: true,
    sourcemap: true,
  },
});
