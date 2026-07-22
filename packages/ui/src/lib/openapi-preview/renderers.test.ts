import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('swagger-ui-dist/swagger-ui-bundle.js?raw', () => ({ default: 'SWAGGER_JS' }));
vi.mock('swagger-ui-dist/swagger-ui.css?raw', () => ({ default: 'SWAGGER_CSS' }));
vi.mock('redoc/bundles/redoc.standalone.js?raw', () => ({ default: 'REDOC_JS' }));
vi.mock('rapidoc/dist/rapidoc-min.js?raw', () => ({ default: 'RAPIDOC_JS' }));

const {
  RENDERERS,
  DEFAULT_RENDERER,
  getRenderer,
  __clearRendererCache,
} = await import('./renderers');

describe('renderer registry', () => {
  beforeEach(() => { __clearRendererCache(); });

  it('defaults to Swagger UI, the only renderer documenting 3.2 support', () => {
    expect(DEFAULT_RENDERER).toBe('swagger-ui');
    expect(getRenderer('swagger-ui').supportsOpenApi32).toBe(true);
  });

  it('registers all three renderers', () => {
    expect(RENDERERS.map((entry) => entry.id)).toEqual(['swagger-ui', 'redoc', 'rapidoc']);
  });

  it('flags ReDoc and RapiDoc as lacking documented 3.2 support', () => {
    expect(getRenderer('redoc').supportsOpenApi32).toBe(false);
    expect(getRenderer('rapidoc').supportsOpenApi32).toBe(false);
  });

  it('falls back to the first renderer for an unknown id', () => {
    expect(getRenderer('unknown' as never).id).toBe('swagger-ui');
  });

  it('loads RapiDoc via an absolute dummy URL answered by the frame fetch shim', async () => {
    // RapiDoc's parser needs a base URL the blob frame cannot provide; the
    // boot loads a dummy absolute URL and stages the spec for the frame-level
    // fetch shim (frame.ts) to answer locally, never hitting the network.
    const assets = await getRenderer('rapidoc').load();
    expect(assets.js).toBe('RAPIDOC_JS');
    expect(assets.boot).toContain("loadSpec('https://nouto.invalid/openapi.json')");
    expect(assets.boot).toContain('window.__noutoSpecJson = JSON.stringify(spec)');
    expect(assets.boot).toContain("setAttribute('load-fonts', 'false')");
    expect(assets.boot).toContain("setAttribute('update-route', 'false')");
  });

  it('loads Swagger UI assets with the dark override appended', async () => {
    const assets = await getRenderer('swagger-ui').load();
    expect(assets.js).toBe('SWAGGER_JS');
    expect(assets.css).toContain('SWAGGER_CSS');
    expect(assets.css).toContain('[data-nouto-theme="dark"]');
    expect(assets.boot).toContain('tryItOutEnabled: allowTry');
    expect(assets.boot).toContain('validatorUrl: null');
  });

  it('gates Try It behind the allowTry boot option for Swagger UI and RapiDoc', async () => {
    // Both renderers read options.allowTry (delivered per-render from the
    // enableTryIt setting) so the shell can toggle Try It without a rebuild.
    const swagger = await getRenderer('swagger-ui').load();
    expect(swagger.boot).toContain('var allowTry = !!(options && options.allowTry)');
    expect(swagger.boot).toContain('supportedSubmitMethods: allowTry');
    expect(swagger.boot).toContain('tryItOutEnabled: allowTry');

    const rapidoc = await getRenderer('rapidoc').load();
    expect(rapidoc.boot).toContain('var allowTry = !!(options && options.allowTry)');
    expect(rapidoc.boot).toContain("setAttribute('allow-try', allowTry ? 'true' : 'false')");
    expect(rapidoc.boot).toContain("setAttribute('allow-authentication', allowTry ? 'true' : 'false')");
  });

  it('disables ReDoc search so it never constructs a blocked Worker', async () => {
    const assets = await getRenderer('redoc').load();
    expect(assets.js).toBe('REDOC_JS');
    expect(assets.boot).toContain('disableSearch: true');
    expect(assets.boot).toContain('hideDownloadButton: true');
  });

  it('caches each renderer so switching back does not re-import', async () => {
    const descriptor = getRenderer('swagger-ui');
    const first = await descriptor.load();
    const second = await descriptor.load();
    expect(second).toBe(first);
  });
});
