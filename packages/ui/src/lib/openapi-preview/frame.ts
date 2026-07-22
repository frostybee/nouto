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

import type { ProxyHttpRequest } from '@nouto/transport';

export interface FrameAssets {
  /** Renderer bundle source, inlined verbatim. */
  js: string;
  /** Renderer stylesheet, inlined verbatim. */
  css: string;
  /**
   * Source of a `function (spec, theme, options) { ... }` expression that mounts
   * the renderer into `#mount`. Runs inside the sandbox with no closure over the
   * parent. `options.allowTry` enables the renderer's built-in "Try it out".
   */
  boot: string;
}

export type FrameInbound =
  | { channel: string; type: 'ready' }
  | { channel: string; type: 'rendered' }
  | { channel: string; type: 'error'; message: string }
  // Renderer "Try it out" request: the frame's fetch shim cannot reach the
  // network (connect-src 'none'), so it asks the shell to proxy through the host.
  | { channel: string; type: 'http-request'; id: string; request: ProxyHttpRequest };

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
<script nonce="${nonce}">
(function () {
  // Renderer "Try it out" bridge. The renderer (Swagger UI / RapiDoc) calls the
  // standard window.fetch; the frame has connect-src 'none' so it cannot open a
  // socket. Instead every request is forwarded to the shell over postMessage and
  // executed by the extension host, and the response is reconstructed here. The
  // spec is never fetched: the RapiDoc dummy URL is answered locally.
  var CHANNEL = ${channelLiteral};
  var pending = {};
  var seq = 0;
  var DUMMY = 'https://nouto.invalid/';

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.channel !== CHANNEL || event.source !== parent) return;
    if (data.type !== 'http-response') return;
    var entry = pending[data.id];
    if (!entry) return;
    delete pending[data.id];
    if (data.error) { entry.reject(new TypeError(String(data.error))); return; }
    var res = data.response || {};
    var bodyInit;
    if (res.bodyEncoding === 'base64') {
      var bin = atob(res.body || '');
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      bodyInit = bytes;
    } else {
      bodyInit = res.body || '';
    }
    var response = new Response(bodyInit, {
      status: res.status || 200,
      statusText: res.statusText || '',
      headers: res.headers || {}
    });
    // Response.url is read-only and empty for a constructed Response; some
    // clients (swagger-client) read it, so surface the real final URL.
    if (res.url) { try { Object.defineProperty(response, 'url', { value: res.url }); } catch (e) {} }
    entry.resolve(response);
  });

  function toHeaderObject(headers) {
    var out = {};
    if (!headers) return out;
    if (Array.isArray(headers)) {
      headers.forEach(function (pair) { if (pair && pair.length === 2) out[pair[0]] = pair[1]; });
    } else if (typeof headers.forEach === 'function') {
      headers.forEach(function (value, key) { out[key] = value; });
    } else {
      for (var k in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, k)) out[k] = String(headers[k]);
      }
    }
    return out;
  }

  window.fetch = function (input, init) {
    init = init || {};
    var isRequest = input && typeof input === 'object' && typeof input.url === 'string';
    var url = isRequest ? input.url : String(input);
    var method = String(init.method || (isRequest ? input.method : 'GET') || 'GET').toUpperCase();
    var headers = init.headers || (isRequest ? input.headers : null);
    var body = init.body != null ? init.body : (isRequest ? undefined : null);

    // The renderer's own spec load (RapiDoc) never leaves the frame.
    if (url.indexOf(DUMMY) === 0) {
      if (window.__noutoSpecJson) {
        return Promise.resolve(new Response(window.__noutoSpecJson, {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }));
      }
      return Promise.reject(new TypeError('Specification not available.'));
    }

    // v1 supports text bodies only; multipart/file uploads are rejected clearly.
    var bodyText;
    if (body == null) {
      bodyText = undefined;
    } else if (typeof body === 'string') {
      bodyText = body;
    } else if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      bodyText = body.toString();
    } else {
      return Promise.reject(new TypeError('Try It supports text and JSON bodies only; file uploads are not supported in the preview.'));
    }

    var id = 'p' + (++seq);
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({
        channel: CHANNEL,
        type: 'http-request',
        id: id,
        request: { method: method, url: url, headers: toHeaderObject(headers), body: bodyText }
      }, '*');
    });
  };
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
    var options = { allowTry: data.allowTry === true };
    try {
      boot(data.spec, theme, options);
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
