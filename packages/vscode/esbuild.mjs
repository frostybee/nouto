import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyProtoFiles() {
  const src = path.resolve(__dirname, '../core/proto');
  const dest = path.resolve(__dirname, 'out/proto');
  fs.cpSync(src, dest, { recursive: true });
}

function smokeTestBundle() {
  const script = path.resolve(__dirname, 'scripts/smoke-bundle.cjs');
  const bundle = path.resolve(__dirname, 'out/extension.js');
  const result = spawnSync(process.execPath, [script, bundle], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Extension bundle smoke test failed with exit code ${result.status ?? 'unknown'}`);
  }
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'es2020',
  // jsonc-parser's CommonJS entry is wrapped in AMD-compatible dynamic
  // requires that esbuild cannot discover. Resolve its static ESM entry so
  // every parser module is included in our single-file extension bundle.
  alias: {
    'jsonc-parser': 'jsonc-parser/lib/esm/main.js',
  },
  external: ['vscode', '@grpc/grpc-js', '@grpc/proto-loader', 'protobufjs'],
  sourcemap: true,
  minify: production,
  treeShaking: true,
  keepNames: !production,
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    copyProtoFiles();
    console.log('[esbuild] Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    copyProtoFiles();
    smokeTestBundle();
    console.log(`[esbuild] Build complete${production ? ' (production)' : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
