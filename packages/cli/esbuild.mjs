import * as esbuild from 'esbuild';

const production = !process.argv.includes('--dev');

await esbuild.build({
  entryPoints: ['src/bin/cli.ts'],
  bundle: true,
  outfile: 'dist/bin/cli.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  keepNames: true,
  banner: { js: '#!/usr/bin/env node' },
  // Node builtins are not bundled (platform: node handles this)
  // Bundle all npm deps into single file for fast startup
  // gRPC/protobuf are externalized since the CLI doesn't use gRPC
  external: ['@grpc/grpc-js', '@grpc/proto-loader', 'protobufjs', 'protobufjs/ext/descriptor'],
});

console.log(production ? 'CLI built (production)' : 'CLI built (development)');
