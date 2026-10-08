const fs = require('fs');
const Module = require('module');
const path = require('path');

const bundlePath = process.argv[2];
if (!bundlePath) throw new Error('Expected the extension bundle path.');

// The VSIX ships without node_modules (vsce --no-dependencies), so every
// runtime dependency must be inside the bundle. Loading the bundle below can't
// catch a dependency left external: Node still finds it in this package's
// node_modules, and lazy requires only run when a feature is used.
const { dependencies = {} } = require(path.resolve(path.dirname(bundlePath), '../package.json'));
const source = fs.readFileSync(bundlePath, 'utf8');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unbundled = Object.keys(dependencies).filter((name) =>
  new RegExp(`\\brequire\\(["']${escapeRegExp(name)}(?:/[^"']*)?["']\\)`).test(source)
);
if (unbundled.length) {
  throw new Error(`Dependencies left out of the bundle, so the packaged extension can't load them: ${unbundled.join(', ')}`);
}

const originalLoad = Module._load;
let callable;
callable = new Proxy(function vscodeStub() { return callable; }, {
  get(_target, property) {
    // Avoid making the universal stub look like a Promise.
    return property === 'then' ? undefined : callable;
  },
  construct() {
    return callable;
  },
});

const vscodeStub = {};
for (const name of [
  'commands',
  'ConfigurationTarget',
  'Diagnostic',
  'DiagnosticSeverity',
  'DocumentSymbol',
  'EventEmitter',
  'ExtensionMode',
  'languages',
  'Position',
  'QuickPickItemKind',
  'Range',
  'RelativePattern',
  'SymbolKind',
  'Uri',
  'ViewColumn',
  'window',
  'workspace',
]) {
  vscodeStub[name] = callable;
}

Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const extension = require(path.resolve(bundlePath));
  if (typeof extension.activate !== 'function') {
    throw new Error('Extension bundle does not export activate().');
  }
  console.log('[esbuild] Bundle smoke test passed');
} finally {
  Module._load = originalLoad;
}
