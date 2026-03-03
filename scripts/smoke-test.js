#!/usr/bin/env node
/**
 * Post-compile smoke test: require() each compiled module to catch
 * TDZ crashes from circular dependencies or bundler-level issues.
 *
 * Provides a minimal vscode stub so modules that import 'vscode' can load.
 */

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

// Intercept require('vscode') - return a proxy that won't crash on any access
const vscodeStub = new Proxy({}, {
  get(_, prop) {
    if (prop === '__esModule') return false;
    if (prop === 'default') return vscodeStub;
    // Return a callable proxy for any property access
    const noop = function () { return noop; };
    return new Proxy(noop, {
      get() { return noop; },
      apply() { return noop; },
      construct() { return {}; },
    });
  },
});

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return 'vscode'; // Return a fake path; we'll intercept the load too
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

// --- Run smoke tests ---

const modules = [
  '../out/extension',
  '../out/services/StorageService',
  '../out/services/DraftService',
  '../out/services/HttpClient',
  '../out/services/OAuthService',
  '../out/services/EnvFileService',
  '../out/services/FileService',
  '../out/services/ImportExportService',
  '../out/services/TimingInterceptor',
  '../out/services/types',
  '../out/providers/RequestPanelManager',
  '../out/providers/SidebarViewProvider',
  '../out/commands/index',
];

let failed = 0;

for (const mod of modules) {
  try {
    require(mod);
    console.log(`  OK  ${mod}`);
  } catch (err) {
    console.error(`  FAIL  ${mod}: ${err.message}`);
    failed++;
  }
}

// Verify key exports
try {
  const types = require('../out/services/types');
  if (typeof types.isFolder !== 'function') throw new Error('isFolder not a function');
  if (typeof types.isRequest !== 'function') throw new Error('isRequest not a function');
  console.log('  OK  types exports (isFolder, isRequest)');
} catch (err) {
  console.error(`  FAIL  types exports: ${err.message}`);
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed} module(s) failed to load.`);
  process.exit(1);
} else {
  console.log(`\nAll ${modules.length} modules loaded successfully.`);
}
