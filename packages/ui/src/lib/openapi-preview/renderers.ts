import type { FrameAssets } from './frame';

export type OpenApiPreviewRenderer = 'swagger-ui' | 'rapidoc';

export interface RendererDescriptor {
  id: OpenApiPreviewRenderer;
  label: string;
  /** Renderers that do not document OpenAPI 3.2 support warn, but stay usable. */
  supportsOpenApi32: boolean;
  load: () => Promise<FrameAssets>;
}

/**
 * Swagger UI has no built-in dark theme, so a scoped override rides along with
 * its stylesheet. Kept deliberately small: it recolors surfaces and text rather
 * than restyling every component.
 */
const SWAGGER_DARK_CSS = `
[data-nouto-theme="dark"] body,
[data-nouto-theme="dark"] .swagger-ui { color: #d4d4d4; }
[data-nouto-theme="dark"] .swagger-ui .info .title,
[data-nouto-theme="dark"] .swagger-ui .opblock-tag,
[data-nouto-theme="dark"] .swagger-ui .opblock .opblock-summary-path,
[data-nouto-theme="dark"] .swagger-ui .opblock .opblock-summary-description,
[data-nouto-theme="dark"] .swagger-ui .model-title,
[data-nouto-theme="dark"] .swagger-ui table thead tr th,
[data-nouto-theme="dark"] .swagger-ui .parameter__name,
[data-nouto-theme="dark"] .swagger-ui .response-col_status,
[data-nouto-theme="dark"] .swagger-ui .markdown p,
[data-nouto-theme="dark"] .swagger-ui p,
[data-nouto-theme="dark"] .swagger-ui label { color: #d4d4d4; }
[data-nouto-theme="dark"] .swagger-ui .scheme-container,
[data-nouto-theme="dark"] .swagger-ui section.models,
[data-nouto-theme="dark"] .swagger-ui .opblock .opblock-section-header { background: #252526; box-shadow: none; }
[data-nouto-theme="dark"] .swagger-ui .opblock { background: #1f1f1f; border-color: #3c3c3c; }
[data-nouto-theme="dark"] .swagger-ui .model-box,
[data-nouto-theme="dark"] .swagger-ui .highlight-code { background: #1e1e1e; }
[data-nouto-theme="dark"] { background: #1e1e1e; }
`;

const SWAGGER_BOOT = `function (spec, theme, options) {
  var dark = theme === 'dark';
  document.documentElement.setAttribute('data-nouto-theme', theme);
  // Swagger UI's light theme uses translucent surfaces that assume a white
  // page. The frame body is transparent, so without a solid background the
  // dark iframe backdrop bleeds through and Light mode reads as unchanged.
  // Paint the body for both themes, mirroring RapiDoc.
  document.body.style.background = dark ? '#1e1e1e' : '#ffffff';
  var allowTry = !!(options && options.allowTry);
  // "Try it out" fires standard window.fetch calls, which the frame shim proxies
  // to the extension host; nothing here touches the network directly.
  var ui = SwaggerUIBundle({
    spec: spec,
    domNode: document.getElementById('mount'),
    supportedSubmitMethods: allowTry
      ? ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']
      : [],
    validatorUrl: null,
    tryItOutEnabled: allowTry,
    deepLinking: false
  });
  // Expanding an operation triggers lazy $ref resolution, whose baseDoc is
  // String(new URL(specSelectors.url(), document.baseURI)). In this
  // blob-backed document the URL state is empty and blob: cannot act as a
  // URL base, so the constructor throws and the operation body spins
  // forever. An absolute dummy URL in the spec state sidesteps the broken
  // base; nothing is ever fetched from it (the spec object is already
  // loaded, and the frame's connect-src 'none' would block any attempt).
  ui.specActions.updateUrl('https://nouto.invalid/openapi.json');
}`;

/**
 * RapiDoc's spec parser resolves references against a base document URL. In
 * the blob-backed opaque-origin frame there is no usable base, so
 * `loadSpec(object)` dies with "Unable to load the Spec" (the Phase 2 spike's
 * "network fetch" was the same failure observed from an http-based harness).
 * The cure: load via an absolute dummy URL — which gives the parser its base.
 * The frame's fetch shim (see frame.ts) answers that one URL locally from
 * `window.__noutoSpecJson`; every OTHER request RapiDoc makes ("Try it out")
 * is proxied through the extension host. Nothing touches the network directly,
 * and the frame's `connect-src 'none'` blocks any attempt regardless.
 */
const RAPIDOC_BOOT = `function (spec, theme, options) {
  var dark = theme === 'dark';
  var allowTry = !!(options && options.allowTry);
  document.documentElement.setAttribute('data-nouto-theme', theme);
  document.body.style.background = dark ? '#1e1e1e' : '#ffffff';
  // Staged for the frame's fetch shim to answer the dummy spec URL below.
  window.__noutoSpecJson = JSON.stringify(spec);
  // Fresh element per render: never re-init into a node the previous
  // web-component instance still owns.
  var mount = document.getElementById('mount');
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  var el = document.createElement('rapi-doc');
  el.setAttribute('render-style', 'read');
  el.setAttribute('show-header', 'false');
  el.setAttribute('allow-try', allowTry ? 'true' : 'false');
  el.setAttribute('allow-authentication', allowTry ? 'true' : 'false');
  el.setAttribute('allow-server-selection', 'false');
  el.setAttribute('allow-spec-file-download', 'false');
  el.setAttribute('update-route', 'false');
  el.setAttribute('load-fonts', 'false');
  el.setAttribute('regular-font', 'system-ui, -apple-system, "Segoe UI", sans-serif');
  el.setAttribute('mono-font', 'Consolas, Monaco, monospace');
  el.setAttribute('theme', dark ? 'dark' : 'light');
  if (dark) {
    el.setAttribute('bg-color', '#1e1e1e');
    el.setAttribute('text-color', '#d4d4d4');
  }
  el.style.height = '100vh';
  mount.appendChild(el);
  el.loadSpec('https://nouto.invalid/openapi.json');
}`;

/** Cached per renderer: a bundle is fetched and inlined at most once per session. */
const cache = new Map<OpenApiPreviewRenderer, Promise<FrameAssets>>();

function cached(
  id: OpenApiPreviewRenderer,
  loader: () => Promise<FrameAssets>
): Promise<FrameAssets> {
  let entry = cache.get(id);
  if (!entry) {
    entry = loader().catch((error) => {
      // A failed load must not poison the cache; the user can retry.
      cache.delete(id);
      throw error;
    });
    cache.set(id, entry);
  }
  return entry;
}

export const RENDERERS: RendererDescriptor[] = [
  {
    id: 'swagger-ui',
    label: 'Swagger UI',
    supportsOpenApi32: true,
    load: () =>
      cached('swagger-ui', async () => {
        const [js, css] = await Promise.all([
          import('swagger-ui-dist/swagger-ui-bundle.js?raw'),
          import('swagger-ui-dist/swagger-ui.css?raw'),
        ]);
        return {
          js: js.default,
          css: css.default + SWAGGER_DARK_CSS,
          boot: SWAGGER_BOOT,
        };
      }),
  },
  {
    id: 'rapidoc',
    label: 'RapiDoc',
    supportsOpenApi32: false,
    load: () =>
      cached('rapidoc', async () => {
        const js = await import('rapidoc/dist/rapidoc-min.js?raw');
        return { js: js.default, css: '', boot: RAPIDOC_BOOT };
      }),
  },
];

export const DEFAULT_RENDERER: OpenApiPreviewRenderer = 'swagger-ui';

export function getRenderer(id: OpenApiPreviewRenderer): RendererDescriptor {
  return RENDERERS.find((renderer) => renderer.id === id) ?? RENDERERS[0];
}

/** Test seam: lets suites assert that switching renderers reuses the cache. */
export function __clearRendererCache(): void {
  cache.clear();
}
