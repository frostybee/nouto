import type { OpenApiPreviewRenderer } from '@nouto/ui/lib/openapi-preview/renderers';

export interface StandaloneDocsOptions {
  title: string;
  renderer: OpenApiPreviewRenderer;
  js: string;
  css: string;
  spec: object;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bootSource(renderer: OpenApiPreviewRenderer): string {
  if (renderer === 'swagger-ui') {
    return `function (spec, mount) {
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  var container = document.createElement('div');
  mount.appendChild(container);
  SwaggerUIBundle({
    spec: spec,
    domNode: container,
    supportedSubmitMethods: [],
    validatorUrl: null,
    tryItOutEnabled: false,
    deepLinking: false
  });
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
  const specJson = JSON.stringify(options.spec).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>html,body{margin:0;padding:0}#mount{min-height:100vh}</style>
<style>${options.css}</style>
</head>
<body>
<div id="mount"></div>
<script>${options.js}</script>
<script>
(function () {
  var boot = ${bootSource(options.renderer)};
  var mount = document.getElementById('mount');
  var spec = ${specJson};
  if (spec && typeof spec === 'object') {
    try { boot(spec, mount); } catch (e) { console.error(e); }
  }
})();
</script>
</body>
</html>`;
}
