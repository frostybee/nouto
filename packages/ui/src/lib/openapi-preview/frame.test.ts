import { describe, it, expect } from 'vitest';
import { buildFrameDocument, createChannelToken } from './frame';

const assets = {
  js: 'window.__rendererLoaded = true;',
  css: '.swagger-ui { color: red; }',
  boot: 'function (spec, theme) { window.__spec = spec; }',
};

describe('createChannelToken', () => {
  it('produces distinct hex tokens', () => {
    const first = createChannelToken();
    const second = createChannelToken();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});

describe('buildFrameDocument', () => {
  const html = buildFrameDocument(assets, 'channel-token');

  it('locks the document down with default-src none and no network', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain('img-src data:');
    expect(html).toContain('font-src data:');
  });

  it('allows inline styles because renderers inject stylesheets at runtime', () => {
    expect(html).toContain("style-src 'unsafe-inline'");
  });

  it('restricts scripts to a generated nonce', () => {
    const match = html.match(/script-src 'nonce-([0-9a-f]{32})'/);
    expect(match).not.toBeNull();
    const nonce = match![1];
    // Every script tag in the document carries that nonce.
    const scriptTags = html.match(/<script[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) expect(tag).toContain(`nonce="${nonce}"`);
  });

  it('uses a fresh nonce per document', () => {
    const other = buildFrameDocument(assets, 'channel-token');
    const nonceOf = (doc: string) => doc.match(/script-src 'nonce-([0-9a-f]{32})'/)![1];
    expect(nonceOf(html)).not.toBe(nonceOf(other));
  });

  it('reuses the host nonce so scripts survive inherited-CSP enforcement', () => {
    // A blob: document inherits the CSP of the document that created the blob
    // URL. In a VS Code webview that policy is script-src 'nonce-<host nonce>',
    // so the frame's scripts must carry the SAME nonce or they are all blocked
    // (regression: preview stuck at "Loading renderer…" forever).
    const hostNonce = 'AbC123hostNonceValue';
    const doc = buildFrameDocument(assets, 'channel-token', hostNonce);
    expect(doc).toContain(`script-src 'nonce-${hostNonce}'`);
    const scriptTags = doc.match(/<script[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) expect(tag).toContain(`nonce="${hostNonce}"`);
  });

  it('inlines renderer assets rather than referencing blob subresources', () => {
    expect(html).toContain(assets.js);
    expect(html).toContain(assets.css);
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('blob:');
  });

  it('embeds the channel token and the boot function', () => {
    expect(html).toContain('"channel-token"');
    expect(html).toContain('window.__spec = spec;');
  });

  it('never contains specification data', () => {
    // The spec only ever arrives via postMessage, so nothing spec-shaped is
    // interpolated at build time.
    expect(html).not.toContain('openapi');
    expect(html).toContain("data.type !== 'render'");
  });

  it('suppresses link navigation and form submission', () => {
    expect(html).toContain("document.addEventListener('click'");
    expect(html).toContain("document.addEventListener('submit'");
    expect(html).toContain('event.preventDefault()');
  });

  it('validates the message source and shape inside the frame', () => {
    expect(html).toContain('data.channel !== CHANNEL');
    expect(html).toContain('event.source !== parent');
    expect(html).toContain("typeof data.spec !== 'object'");
  });

  it('passes the allowTry option through to the renderer boot', () => {
    expect(html).toContain('data.allowTry === true');
    expect(html).toContain('boot(data.spec, theme, options)');
  });

  it('installs a fetch shim that proxies Try-It requests over the channel', () => {
    // The renderer cannot reach the network (connect-src 'none'); its fetch is
    // rerouted to the parent, which proxies through the extension host.
    expect(html).toContain('window.fetch = function');
    expect(html).toContain("type: 'http-request'");
    expect(html).toContain("parent.postMessage(");
    // Responses are matched by channel + source and reconstructed into a Response.
    expect(html).toContain("data.type !== 'http-response'");
    expect(html).toContain('new Response(');
  });

  it('answers the RapiDoc dummy spec URL locally and rejects file uploads', () => {
    expect(html).toContain('https://nouto.invalid/');
    expect(html).toContain('window.__noutoSpecJson');
    // v1: text/JSON bodies only.
    expect(html).toContain('file uploads are not supported');
  });

  it('keeps connect-src none despite adding the fetch bridge', () => {
    // The shim uses postMessage, never the network, so the sandbox stays sealed.
    expect(html).toContain("connect-src 'none'");
  });
});
