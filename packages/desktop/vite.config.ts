import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

// Node.js built-in modules referenced by @nouto/core services (HttpClient, ScriptEngine, etc.)
// These services are backend-only and never called from the Svelte frontend,
// but get pulled in transitively via barrel exports. We replace them with
// empty stubs so they don't break the browser bundle.
const nodeBuiltins = [
  'url', 'http', 'http2', 'https', 'tls', 'zlib', 'net', 'dns', 'stream',
  'crypto', 'fs', 'fs/promises', 'path', 'vm', 'buffer', 'events',
  'child_process', 'os', 'util', 'assert', 'querystring',
];

// Node-only npm packages that are pulled in transitively by @nouto/core
// but are never used in the browser frontend. Stub them out like builtins.
const nodeOnlyPackages = [
  'ws',
  'agent-base', 'http-proxy-agent', 'https-proxy-agent',
  'socks', 'socks-proxy-agent',
  'axios', 'follow-redirects', 'form-data', 'combined-stream', 'delayed-stream', 'mime-types',
];

// Rollup plugin that resolves Node.js builtins and node-only packages to stub modules.
// Using `external` would leave bare `import "http"` in the bundle which
// browsers cannot resolve. This plugin replaces them with inert stubs.
//
// Some deps (ws, proxy agents, streams) subclass Node.js base classes
// with `class X extends EventEmitter` etc. Plain objects/functions cannot
// be extended, so we provide minimal constructor stubs for key modules.
function nodeBuiltinStubs(): Plugin {
  const PREFIX = '\0node-stub:';
  const allStubbed = new Set([...nodeBuiltins, ...nodeOnlyPackages]);
  return {
    name: 'node-builtin-stubs',
    enforce: 'pre',
    resolveId(id) {
      if (allStubbed.has(id)) return PREFIX + id;
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const mod = id.slice(PREFIX.length);

      // Node.js HTTP proxy/agent packages: stub with a no-op constructor
      if (mod === 'agent-base' || mod === 'http-proxy-agent' || mod === 'https-proxy-agent' || mod === 'socks-proxy-agent' || mod === 'socks') {
        return `
          function Agent() {}
          Agent.prototype.destroy = function() {};
          export default Agent;
          export { Agent };
          export const HttpProxyAgent = Agent;
          export const HttpsProxyAgent = Agent;
          export const SocksProxyAgent = Agent;
          export const SocksClient = Agent;
          export const SocksClientError = Agent;
        `;
      }

      // ws: stub with browser-native WebSocket (Tauri runs in a real browser)
      if (mod === 'ws') {
        return `
          export default globalThis.WebSocket;
          export const WebSocket = globalThis.WebSocket;
        `;
      }

      // events: ws and others extend EventEmitter
      if (mod === 'events') {
        return `
          function EventEmitter() {}
          EventEmitter.prototype.on = function() { return this; };
          EventEmitter.prototype.once = function() { return this; };
          EventEmitter.prototype.off = function() { return this; };
          EventEmitter.prototype.emit = function() { return false; };
          EventEmitter.prototype.addListener = function() { return this; };
          EventEmitter.prototype.removeListener = function() { return this; };
          EventEmitter.prototype.removeAllListeners = function() { return this; };
          EventEmitter.prototype.listeners = function() { return []; };
          EventEmitter.prototype.setMaxListeners = function() { return this; };
          export default EventEmitter;
          export { EventEmitter };
        `;
      }

      // http/https/http2: proxy agents extend http.Agent
      if (mod === 'http' || mod === 'https' || mod === 'http2') {
        return `
          const noop = () => {};
          function Agent() {}
          Agent.prototype.destroy = noop;
          function Server() {}
          Server.prototype.listen = noop;
          Server.prototype.close = noop;
          export default { Agent, Server, request: noop, get: noop, createServer: () => new Server(), globalAgent: new Agent() };
          export { Agent, Server };
          export const request = noop;
          export const get = noop;
          export const createServer = () => new Server();
          export const globalAgent = new Agent();
          export const constants = {};
          export const connect = noop;
        `;
      }

      // stream: some deps extend Stream/Readable/Writable/Transform
      if (mod === 'stream') {
        return `
          function Stream() {}
          Stream.prototype.pipe = function() { return this; };
          function Readable() { Stream.call(this); }
          Readable.prototype = Object.create(Stream.prototype);
          function Writable() { Stream.call(this); }
          Writable.prototype = Object.create(Stream.prototype);
          function Transform() { Stream.call(this); }
          Transform.prototype = Object.create(Stream.prototype);
          function PassThrough() { Stream.call(this); }
          PassThrough.prototype = Object.create(Stream.prototype);
          export default { Stream, Readable, Writable, Transform, PassThrough };
          export { Stream, Readable, Writable, Transform, PassThrough };
        `;
      }

      return `
        const noop = () => {};
        const empty = {};
        const stub = new Proxy(empty, { get: (_, k) => k === '__esModule' ? true : noop });
        export default stub;
        export const URL = globalThis.URL;
        export const URLSearchParams = globalThis.URLSearchParams;
        export const constants = {};
        export const connect = noop;
        export const createServer = noop;
        export const request = noop;
        export const get = noop;
        export const createContext = noop;
        export const runInNewContext = noop;
        export const createHash = noop;
        export const createHmac = noop;
        export const randomBytes = noop;
        export const randomUUID = () => crypto.randomUUID();
        export const resolve = noop;
        export const join = noop;
        export const dirname = noop;
        export const basename = noop;
        export const readFileSync = noop;
        export const writeFileSync = noop;
        export const existsSync = () => false;
        export const readFile = noop;
        export const writeFile = noop;
        export const mkdir = noop;
        export const readdir = noop;
        export const stat = noop;
        export const unlink = noop;
        export const promises = { readFile: noop, writeFile: noop, mkdir: noop, readdir: noop, stat: noop, unlink: noop };
        export const createReadStream = noop;
        export const createWriteStream = noop;
        export const createGunzip = noop;
        export const createInflate = noop;
        export const createBrotliDecompress = noop;
        export const gunzip = noop;
        export const inflate = noop;
        export const inflateRaw = noop;
        export const brotliDecompress = noop;
        export const pipeline = noop;
        export const Script = noop;
        export const Buffer = globalThis.Buffer || { from: noop, alloc: noop, isBuffer: () => false };
      `;
    },
  };
}

// Injects a safe `require` shim into the bundle entry so that any CJS require()
// calls that survive esbuild/Rollup transformation (e.g., from ajv's compiled
// validators or TypeScript's `import X = require('Y')`) don't crash at runtime.
function requireShim(): Plugin {
  return {
    name: 'require-shim',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'text/javascript' },
          children: `
            if (typeof globalThis.require === 'undefined') {
              const modules = {};
              globalThis.require = function(id) {
                if (modules[id]) return modules[id];
                // Return a Proxy that returns no-ops for any property access
                return new Proxy({}, { get: (_, k) => k === '__esModule' ? true : () => {} });
              };
            }
          `,
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), nodeBuiltinStubs(), requireShim()],
  base: './',

  // Resolve aliases to use existing UI components and core packages
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.svelte.ts', '.svelte'],
    alias: {
      '@nouto/core': resolve(__dirname, '../core/src'),
      '@nouto/transport': resolve(__dirname, '../transport/src'),
      '@nouto/ui': resolve(__dirname, '../ui/src'),
      '@nouto/json-explorer': resolve(__dirname, '../json-explorer/src'),
    },
  },

  // Tauri expects the output in dist/ folder
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    commonjsOptions: {
      // Transform require() calls in mixed ESM/CJS modules
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },

  // Exclude Node-only packages from Vite's esbuild pre-bundling.
  // Without this, esbuild bundles them before our Rollup stub plugin can
  // intercept their imports (e.g., require('events') gets externalized
  // by Vite instead of being replaced by our EventEmitter stub).
  optimizeDeps: {
    exclude: [...nodeOnlyPackages],
  },

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
});
