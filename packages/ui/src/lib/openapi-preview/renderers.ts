import type { FrameAssets } from './frame';

export type OpenApiPreviewRenderer = 'swagger-ui' | 'redoc';

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

const SWAGGER_BOOT = `function (spec, theme) {
  document.documentElement.setAttribute('data-nouto-theme', theme);
  SwaggerUIBundle({
    spec: spec,
    domNode: document.getElementById('mount'),
    supportedSubmitMethods: [],
    validatorUrl: null,
    tryItOutEnabled: false,
    deepLinking: false
  });
}`;

const REDOC_BOOT = `function (spec, theme) {
  var dark = theme === 'dark';
  document.documentElement.setAttribute('data-nouto-theme', theme);
  if (dark) document.body.style.background = '#1e1e1e';
  Redoc.init(spec, {
    // Search builds a Worker, which this document's default-src 'none' blocks.
    disableSearch: true,
    hideDownloadButton: true,
    nativeScrollbars: true,
    theme: {
      spacing: { unit: 4 },
      colors: dark ? { text: { primary: '#d4d4d4', secondary: '#a0a0a0' } } : {},
      typography: {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        code: { fontFamily: 'Consolas, Monaco, monospace' }
      },
      sidebar: dark
        ? { backgroundColor: '#252526', textColor: '#d4d4d4' }
        : {},
      rightPanel: dark ? { backgroundColor: '#1b1b1b' } : {}
    }
  }, document.getElementById('mount'));
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
    id: 'redoc',
    label: 'ReDoc',
    supportsOpenApi32: false,
    load: () =>
      cached('redoc', async () => {
        const js = await import('redoc/bundles/redoc.standalone.js?raw');
        return { js: js.default, css: '', boot: REDOC_BOOT };
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
