import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyProtoFiles() {
  const src = path.resolve(__dirname, '../core/proto');
  const dest = path.resolve(__dirname, 'out/proto');
  fs.cpSync(src, dest, { recursive: true });
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'es2020',
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
    console.log(`[esbuild] Build complete${production ? ' (production)' : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
