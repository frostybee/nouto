// Root ESLint flat config. Scoped to packages/desktop for now (see `lint`
// script in package.json); widen the target paths once other packages are
// clean.
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteConfig from './packages/desktop/svelte.config.js';

// Modules that talk to Rust directly. Everything else must go through
// TauriMessageBus (packages/desktop/src/lib/tauri.ts) so the shared UI keeps
// a single IPC seam. Add a path here only when a raw invoke is unavoidable.
const RAW_INVOKE_ALLOWLIST = [
  'packages/desktop/src/lib/tauri.ts',
  'packages/desktop/src/lib/lifecycle.ts',
  'packages/desktop/src/lib/updater.svelte.ts',
  'packages/desktop/src/lib/global-shortcut.ts',
  'packages/desktop/src/lib/recovery.ts',
  'packages/desktop/src/lib/handlers/environment-handler.ts',
  'packages/desktop/src/lib/handlers/runner-handler.ts',
  'packages/desktop/src/lib/handlers/ws-session-handler.ts',
  'packages/desktop/src/lib/openapi/diagnostics.ts',
  'packages/desktop/src/lib/openapi/externalQuickFixes.ts',
  'packages/desktop/src/lib/openapi/previewAdapter.svelte.ts',
  'packages/desktop/src/lib/openapi/tauriFileResolver.ts',
];

export default ts.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      'packages/desktop/src-tauri/**',
      'packages/desktop/dist-spike/**',
      'packages/desktop/vite.config.ts.timestamp-*',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.svelte'],
        // Pass the real config so eslint-plugin-svelte sees runes mode.
        svelteConfig,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Flags every `new Map/Set/Date/URL` inside .svelte.ts modules, including
      // plain non-reactive helpers, so it is mostly noise here. Off; genuine
      // reactive-collection cases are covered by review.
      'svelte/prefer-svelte-reactivity': 'off',
      // All logging goes through packages/desktop/src/lib/logger.ts.
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tauri-apps/api/core',
              importNames: ['invoke'],
              message:
                'Route IPC through TauriMessageBus in packages/desktop/src/lib/tauri.ts, or add this file to RAW_INVOKE_ALLOWLIST in eslint.config.js.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/desktop/src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: RAW_INVOKE_ALLOWLIST,
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '**/*.config.{js,mjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
  prettier,
);
