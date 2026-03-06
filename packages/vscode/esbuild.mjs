import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'es2020',
  external: ['vscode'],
  sourcemap: true,
  minify: production,
  treeShaking: true,
  keepNames: !production,
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log(`[esbuild] Build complete${production ? ' (production)' : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
