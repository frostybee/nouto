import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('swagger-ui-dist/swagger-ui-bundle.js?raw', () => ({ default: 'SWAGGER_JS' }));
vi.mock('swagger-ui-dist/swagger-ui.css?raw', () => ({ default: 'SWAGGER_CSS' }));
vi.mock('redoc/bundles/redoc.standalone.js?raw', () => ({ default: 'REDOC_JS' }));

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

  it('excludes RapiDoc, which cannot load a spec in an opaque-origin frame', () => {
    expect(RENDERERS.map((entry) => entry.id)).toEqual(['swagger-ui', 'redoc']);
  });

  it('flags ReDoc as lacking documented 3.2 support', () => {
    expect(getRenderer('redoc').supportsOpenApi32).toBe(false);
  });

  it('falls back to the first renderer for an unknown id', () => {
    expect(getRenderer('rapidoc' as never).id).toBe('swagger-ui');
  });

  it('loads Swagger UI assets with the dark override appended', async () => {
    const assets = await getRenderer('swagger-ui').load();
    expect(assets.js).toBe('SWAGGER_JS');
    expect(assets.css).toContain('SWAGGER_CSS');
    expect(assets.css).toContain('[data-nouto-theme="dark"]');
    expect(assets.boot).toContain('supportedSubmitMethods: []');
    expect(assets.boot).toContain('validatorUrl: null');
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
