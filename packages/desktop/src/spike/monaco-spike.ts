/**
 * Phase 0a spike (dev-only, never shipped): evaluates Monaco + monaco-yaml as
 * the desktop OpenAPI editor widget against the four roadmap criteria:
 *  1. completion/hover/validation quality against the vendored meta-schemas
 *  2. workers under the Tauri CSP (mirrored via the page's <meta> CSP)
 *  3. theme + rem font-size synchronization
 *  4. lazy-load size / startup cost (measured on the built chunks)
 *
 * Instrumented via `window.__spike` so the evaluation can be driven from a
 * browser automation session. Delete src/spike/ and spike-monaco.html when the
 * spike concludes (record the outcome in the desktop parity roadmap first).
 */
import * as monaco from 'monaco-editor';
import { configureMonacoYaml } from 'monaco-yaml';
// Vite `?worker` imports emit same-origin worker chunks (no blob: bootstrap),
// which is exactly what the Tauri CSP (`script-src 'self'`, no worker-src)
// requires. If either worker fails to boot, criterion 2 fails.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import YamlWorker from 'monaco-yaml/yaml.worker.js?worker';
// Deep import, proven Ajv-free by the Phase 0b bundle audit.
import { getOpenApiMetaSchema } from '@nouto/core/services/openapi/schemas';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
    __spike?: {
      getMarkers(): { message: string; line: number; severity: number }[];
      setContent(text: string): void;
      getContent(): string;
      bootTimeMs: number;
    };
  }
}

const bootStart = performance.now();

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'yaml') return new YamlWorker();
    return new EditorWorker();
  },
};

const SAMPLE = `openapi: 3.1.0
info:
  title: Spike API
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List pets
      operationId: listPets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
components:
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        status:
          type: strings
`;

const SCHEMA_URI = 'https://nouto.invalid/openapi-meta-schema.json';
const MODEL_URI = monaco.Uri.parse('file:///spike/openapi.yaml');

function schemaFor(selection: string): Record<string, unknown> {
  switch (selection) {
    case '3.1-editor': return getOpenApiMetaSchema('3.1', 'editor');
    case '3.0-full': return getOpenApiMetaSchema('3.0', 'full');
    case '3.2-full': return getOpenApiMetaSchema('3.2', 'full');
    default: return getOpenApiMetaSchema('3.1', 'full');
  }
}

const yaml = configureMonacoYaml(monaco, {
  enableSchemaRequest: false,
  hover: true,
  completion: true,
  validate: true,
  format: false,
  schemas: [{ uri: SCHEMA_URI, fileMatch: ['**/*.yaml'], schema: schemaFor('3.1-full') }],
});

/**
 * Criterion 3 bridge: Monaco themes are JS objects, the app themes via CSS
 * custom properties. A real implementation derives colors from computed
 * styles; the spike proves the mechanism with two fixed derivations.
 */
function applyTheme(kind: 'dark' | 'light'): void {
  document.body.classList.toggle('dark', kind === 'dark');
  monaco.editor.setTheme(kind === 'dark' ? 'vs-dark' : 'vs');
}

/** Criterion 3 bridge: px font size derived from the rem root, like the app. */
function editorFontPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize);
}

const model = monaco.editor.createModel(SAMPLE, 'yaml', MODEL_URI);
const editor = monaco.editor.create(document.getElementById('editor')!, {
  model,
  automaticLayout: true,
  fontSize: editorFontPx(),
  minimap: { enabled: false },
  theme: 'vs-dark',
});

const statusEl = document.getElementById('status')!;
function renderMarkers(): void {
  const markers = monaco.editor.getModelMarkers({ resource: MODEL_URI });
  statusEl.textContent = markers.length
    ? markers.map((m) => `[${m.severity}] ${m.startLineNumber}:${m.startColumn} ${m.message}`).join('\n')
    : '(no markers)';
}
monaco.editor.onDidChangeMarkers(renderMarkers);
renderMarkers();

document.getElementById('schema-select')!.addEventListener('change', (event) => {
  const value = (event.target as HTMLSelectElement).value;
  yaml.update({
    enableSchemaRequest: false,
    schemas: [{ uri: SCHEMA_URI + '?' + value, fileMatch: ['**/*.yaml'], schema: schemaFor(value) }],
  });
});

document.getElementById('theme-select')!.addEventListener('change', (event) => {
  applyTheme((event.target as HTMLSelectElement).value as 'dark' | 'light');
});

const fontInput = document.getElementById('font-size') as HTMLInputElement;
fontInput.addEventListener('input', () => {
  document.documentElement.style.fontSize = `${fontInput.value}px`;
  document.getElementById('font-size-value')!.textContent = fontInput.value;
  editor.updateOptions({ fontSize: editorFontPx() });
});

const bootTimeMs = performance.now() - bootStart;
document.getElementById('boot-status')!.textContent = `booted in ${bootTimeMs.toFixed(0)}ms`;
applyTheme('dark');

window.__spike = {
  getMarkers: () => monaco.editor
    .getModelMarkers({ resource: MODEL_URI })
    .map((m) => ({ message: m.message, line: m.startLineNumber, severity: m.severity })),
  setContent: (text) => model.setValue(text),
  getContent: () => model.getValue(),
  bootTimeMs,
};
