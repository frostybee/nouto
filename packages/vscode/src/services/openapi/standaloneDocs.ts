/**
 * Builds the standalone "open documentation in browser" snapshot.
 *
 * The snapshot is a folder with two files:
 * - `index.html` — static shell with the renderer bundle inlined, written
 *   once per command run. It loads the spec via a classic
 *   `<script src="./spec.js">` (classic same-scheme scripts load fine on
 *   file://; fetch would be CORS-blocked there).
 * - `spec.js` — a tiny `window.__NOUTO_OPENAPI_SPEC = ...` payload the
 *   snapshot updater rewrites on document changes, so a browser reload (F5)
 *   shows the current schema. The shell also polls this file by injecting
 *   fresh script tags, so an open tab updates by itself where the browser
 *   allows the file-scheme poll (it degrades silently to F5 elsewhere).
 *
 * Unlike the webview preview there is no sandbox here: the file runs in the
 * user's own browser with the same trust as the spec document itself. The
 * renderers stay offline-friendly and their native request execution stays
 * disabled — Nouto owns request execution.
 */

export type StandaloneDocsRenderer = 'swagger-ui' | 'redoc' | 'rapidoc';

export interface StandaloneDocsOptions {
  title: string;
  renderer: StandaloneDocsRenderer;
  /** Renderer bundle source, inlined verbatim. */
  js: string;
  /** Renderer stylesheet, inlined verbatim (may be empty). */
  css: string;
}

/** Poll interval for the zero-server auto-refresh loop. */
const POLL_INTERVAL_MS = 2000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The spec payload file. Angle brackets in the JSON are replaced with their
 * unicode escapes (u003c/u003e) so spec strings containing a closing script
 * tag can never terminate the script element that loads this file's content.
 */
export function buildSpecJs(spec: object): string {
  const json = JSON.stringify(spec).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `window.__NOUTO_OPENAPI_SPEC = ${json};\n`;
}

/**
 * Per-renderer boot: `function (spec, mount) { ... }` rendering into a fresh
 * child of `mount`. Mirrors the sandbox boots in
 * packages/ui/src/lib/openapi-preview/renderers.ts minus the sandbox
 * plumbing. On file:// the document has a real hierarchical base URL, so the
 * blob-frame workarounds are unnecessary — but Swagger keeps `updateUrl` for
 * resolver robustness, and ReDoc keeps `disableSearch` because workers are
 * still blocked on file://.
 */
function bootSource(renderer: StandaloneDocsRenderer): string {
  if (renderer === 'swagger-ui') {
    return `function (spec, mount) {
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  var container = document.createElement('div');
  mount.appendChild(container);
  var ui = SwaggerUIBundle({
    spec: spec,
    domNode: container,
    supportedSubmitMethods: [],
    validatorUrl: null,
    tryItOutEnabled: false,
    deepLinking: false
  });
  ui.specActions.updateUrl('https://nouto.invalid/openapi.json');
}`;
  }
  if (renderer === 'redoc') {
    return `function (spec, mount) {
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  var container = document.createElement('div');
  mount.appendChild(container);
  Redoc.init(spec, {
    disableSearch: true,
    hideDownloadButton: true,
    nativeScrollbars: true
  }, container);
}`;
  }
  return `function (spec, mount) {
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  var el = document.createElement('rapi-doc');
  el.setAttribute('render-style', 'read');
  el.setAttribute('show-header', 'false');
  el.setAttribute('allow-try', 'false');
  el.setAttribute('allow-authentication', 'false');
  el.setAttribute('allow-server-selection', 'false');
  el.setAttribute('allow-spec-file-download', 'false');
  el.setAttribute('update-route', 'false');
  el.setAttribute('load-fonts', 'false');
  el.setAttribute('regular-font', 'system-ui, -apple-system, "Segoe UI", sans-serif');
  el.setAttribute('mono-font', 'Consolas, Monaco, monospace');
  el.setAttribute('theme', 'light');
  el.style.height = '100vh';
  mount.appendChild(el);
  el.loadSpec(spec);
}`;
}

export function buildStandaloneDocsHtml(options: StandaloneDocsOptions): string {
  const title = escapeHtml(options.title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>html,body{margin:0;padding:0}#mount{min-height:100vh}#nouto-missing{display:none;padding:24px;font-family:system-ui,sans-serif}</style>
<style>${options.css}</style>
</head>
<body>
<div id="mount"></div>
<div id="nouto-missing">The specification payload (spec.js) is missing. Re-run
"Open OpenAPI Documentation in Browser" in VS Code to regenerate it.</div>
<script src="./spec.js"></script>
<script>${options.js}</script>
<script>
(function () {
  var boot = ${bootSource(options.renderer)};
  var mount = document.getElementById('mount');
  var rendered = '';

  function render(spec) {
    try {
      rendered = JSON.stringify(spec);
      boot(spec, mount);
    } catch (e) { /* renderer failure leaves the last good render in place */ }
  }

  function start() {
    var spec = window.__NOUTO_OPENAPI_SPEC;
    if (!spec || typeof spec !== 'object') {
      document.getElementById('nouto-missing').style.display = 'block';
      return;
    }
    render(spec);
    poll(1);
  }

  // Zero-server auto-refresh: re-read spec.js from disk by injecting a fresh
  // classic script tag (the query defeats memory caching), and re-render only
  // when the content actually changed. Any failure is inert — a manual
  // browser reload always shows the current snapshot.
  function poll(n) {
    setTimeout(function () {
      var tag = document.createElement('script');
      tag.src = './spec.js?' + n;
      tag.onload = tag.onerror = function () {
        tag.remove();
        var next = window.__NOUTO_OPENAPI_SPEC;
        if (next && typeof next === 'object' && JSON.stringify(next) !== rendered) {
          render(next);
        }
        poll(n + 1);
      };
      document.head.appendChild(tag);
    }, ${POLL_INTERVAL_MS});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
</script>
</body>
</html>`;
}
