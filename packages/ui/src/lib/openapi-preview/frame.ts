/**
 * Builds the sandboxed renderer document.
 *
 * The document is loaded as a blob URL into an `allow-scripts`-only iframe, so
 * it has an opaque origin and cannot reach the parent webview. Renderer assets
 * are inlined rather than referenced as separate blob URLs: an opaque origin
 * fails the origin check when fetching a blob subresource, so `<script src>`
 * would never execute.
 *
 * The specification is NEVER interpolated into this HTML — it always arrives
 * over postMessage after the frame reports `ready`.
 */

export interface FrameAssets {
  /** Renderer bundle source, inlined verbatim. */
  js: string;
  /** Renderer stylesheet, inlined verbatim. */
  css: string;
  /**
   * Source of a `function (spec, theme) { ... }` expression that mounts the
   * renderer into `#mount`. Runs inside the sandbox with no closure over the
   * parent.
   */
  boot: string;
}

export type FrameInbound =
  | { channel: string; type: 'ready' }
  | { channel: string; type: 'rendered' }
  | { channel: string; type: 'error'; message: string };

export function createChannelToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * `style-src` must allow inline styles: every supported renderer injects
 * stylesheets at runtime, and ReDoc's styled-components throws outright under a
 * nonce-only style policy. CSS-based exfiltration stays blocked because no
 * directive permits a remote URL of any kind.
 */
function csp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/**
 * A `blob:` document inherits the CSP of the document that created the blob
 * URL. Inside a VS Code webview that inherited policy is
 * `script-src 'nonce-<host nonce>'`, so the frame's inline scripts execute
 * only when they carry the SAME nonce as the embedding webview. Callers in a
 * CSP-guarded host must pass that nonce (readable via `script.nonce` on any
 * of the host document's own script elements); standalone hosts (tests, the
 * security harness) may omit it and get a generated one.
 */
export function buildFrameDocument(assets: FrameAssets, channel: string, hostNonce?: string): string {
  const nonce = hostNonce || createChannelToken();
  const channelLiteral = JSON.stringify(channel);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp(nonce)}">
<style>html,body{margin:0;padding:0;background:transparent}#mount{min-height:100vh}</style>
<style>${assets.css}</style>
</head>
<body>
<div id="mount"></div>
<script nonce="${nonce}">
(function () {
  var CHANNEL = ${channelLiteral};
  function send(type, message) {
    parent.postMessage({ channel: CHANNEL, type: type, message: message }, '*');
  }
  window.__noutoSend = send;
  window.onerror = function (message) { send('error', String(message)); return true; };
  window.addEventListener('unhandledrejection', function (event) {
    send('error', String((event.reason && event.reason.message) || event.reason));
  });
  // Defeat any navigation a renderer or specification content might attempt.
  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node.tagName !== 'A') node = node.parentElement;
    if (node) event.preventDefault();
  }, true);
  document.addEventListener('submit', function (event) { event.preventDefault(); }, true);
})();
</script>
<script nonce="${nonce}">${assets.js}</script>
<script nonce="${nonce}">
(function () {
  var CHANNEL = ${channelLiteral};
  var send = window.__noutoSend;
  var boot = ${assets.boot};
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.channel !== CHANNEL || data.type !== 'render') return;
    if (event.source !== parent) return;
    if (!data.spec || typeof data.spec !== 'object') return;
    var theme = data.theme === 'dark' ? 'dark' : 'light';
    try {
      boot(data.spec, theme);
      send('rendered');
    } catch (error) {
      send('error', String((error && error.message) || error));
    }
  });
  send('ready');
})();
</script>
</body>
</html>`;
}
