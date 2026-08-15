import * as vscode from 'vscode';
import type { FileResolver, OpenApiFormat } from '@nouto/core/services';
import { OpenApiDiagnosticsManager } from './OpenApiDiagnosticsManager';
import { buildPointerMap, clearOpenApiDocumentState } from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

const vscodeMock = vscode as typeof vscode & {
  __diagnosticCollections: Map<string, any>;
  __fireDidChangeTextDocument(document: vscode.TextDocument): void;
  __fireDidCloseTextDocument(document: vscode.TextDocument): void;
};

const VALID = `openapi: 3.1.0
info: { title: A, version: 1.0.0 }
paths: {}
`;

function fakeContext(settings: Record<string, unknown> = {}): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'nouto.settings' ? settings : undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

function makeResolver(
  files: Record<string, { content: string; format: OpenApiFormat }> = {}
): FileResolver {
  return {
    resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(),
    load: async (uri) => files[uri],
  };
}

/** Drains the microtask chain of an in-flight external-ref validation pass. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await Promise.resolve();
}

describe('OpenApiDiagnosticsManager', () => {
  let manager: OpenApiDiagnosticsManager;
  const documents: vscode.TextDocument[] = [];

  beforeEach(() => {
    (vscode.workspace.textDocuments as vscode.TextDocument[]).length = 0;
    manager = new OpenApiDiagnosticsManager(fakeContext(), makeResolver());
  });

  afterEach(() => {
    manager.dispose();
    for (const document of documents) clearOpenApiDocumentState(document.uri);
    documents.length = 0;
    (vscode.workspace.textDocuments as vscode.TextDocument[]).length = 0;
    jest.useRealTimers();
  });

  function doc(content: string, version = 1, path = '/diagnostics.yaml', languageId = 'yaml') {
    const document = createFakeTextDocument({ content, version, path, languageId });
    documents.push(document);
    return document;
  }

  function diagnostics(document: vscode.TextDocument): readonly vscode.Diagnostic[] {
    return vscodeMock.__diagnosticCollections.get('nouto-openapi')!.get(document.uri as any) ?? [];
  }

  it('combines schema, semantic, and reference diagnostics without host JSON syntax', () => {
    const document = doc(`openapi: 3.1.0
info: { title: Bad, version: 1 }
paths:
  /a:
    get:
      operationId: duplicate
      responses: { '200': { description: OK } }
  /b:
    get:
      operationId: duplicate
      responses: { '200': { $ref: '#/components/responses/Missing' } }
`);
    manager.runValidation(document);
    const codes = new Set(diagnostics(document).map((item) => item.code));
    // Meta-schema diagnostics carry no rule-specific code, so they fall back to
    // the source category; semantic/reference diagnostics now carry their id.
    expect(codes.has('schema')).toBe(true);
    expect(codes.has('duplicate-operation-id')).toBe(true);
    expect(codes.has('ref-not-found')).toBe(true);
    expect(codes.has('syntax')).toBe(false);
    expect(diagnostics(document).every((item) => item.source === 'nouto-openapi')).toBe(true);

    const json = doc('{"openapi":"3.1.0","info":{"title":"A","version":"1.0.0"},"paths":{}}', 1, '/spec.json', 'json');
    manager.runValidation(json);
    expect(diagnostics(json).some((item) => item.code === 'syntax')).toBe(false);
  });

  it('skips meta-schema validation and surfaces an info diagnostic for a future 3.x minor', () => {
    const document = doc(`openapi: 3.3.0
info: { title: Future, version: 1.0.0 }
paths: {}
`, 1, '/future.yaml');
    manager.runValidation(document);
    const produced = diagnostics(document);
    // No meta-schema noise: a 3.3 doc must not be validated against the 3.2 schema.
    expect(produced.some((item) => item.code === 'schema')).toBe(false);
    const fallback = produced.find((item) => item.code === 'unsupported-version-fallback');
    expect(fallback).toBeDefined();
    expect(fallback!.severity).toBe(vscode.DiagnosticSeverity.Information);
    expect(fallback!.message).toContain('treating this document as 3.2');
  });

  it('shows only YAML syntax diagnostics after a recognized document becomes malformed', () => {
    const valid = doc(VALID);
    manager.runValidation(valid);
    const malformed = doc('openapi: 3.1.0\ninfo: [broken\n', 2);
    manager.runValidation(malformed);
    expect([...new Set(diagnostics(malformed).map((item) => item.code))]).toEqual(['syntax']);
  });

  it('normalizes undefined and empty root pointers to the whole document', () => {
    const valid = doc(VALID, 1, '/root.yaml');
    manager.runValidation(valid);
    const missingRequiredFields = doc('{}', 2, '/root.yaml');
    manager.runValidation(missingRequiredFields);
    const rootDiagnostics = diagnostics(missingRequiredFields).filter((item) =>
      item.code === 'schema' || item.code === 'semantic'
    );
    expect(rootDiagnostics.length).toBeGreaterThan(1);
    for (const diagnostic of rootDiagnostics) {
      expect(missingRequiredFields.getText(diagnostic.range)).toBe('{}');
    }
  });

  it('anchors a missing-property diagnostic to one key, not the whole value', () => {
    // The parameter is missing its required `schema`. Every line of the object
    // is individually valid, so underlining the whole three-line body would
    // mark text that is not the defect; the squiggle belongs on `name`.
    const document = doc(`openapi: 3.0.0
info: { title: Test, version: 1.0.0 }
paths:
  /pets:
    get:
      parameters:
        - name: page
          in: query
          required: true
      responses:
        '200': { description: OK }
`, 1, '/anchor.yaml');
    manager.runValidation(document);
    const schema = diagnostics(document).filter((item) => item.code === 'schema');
    expect(schema).toHaveLength(1);
    expect(schema[0].message).toBe("Schema: Missing property 'schema'");
    expect(document.getText(schema[0].range)).toBe('name');
    expect(schema[0].range.start.line).toBe(schema[0].range.end.line);
  });

  it('anchors a missing property on a mapping value to its own key', () => {
    const document = doc(`openapi: 3.0.0
info: { title: Test, version: 1.0.0 }
paths:
  /pets:
    get:
      responses:
        '200':
          content: {}
`, 1, '/anchor-map.yaml');
    manager.runValidation(document);
    const schema = diagnostics(document).filter((item) => item.code === 'schema');
    expect(schema).toHaveLength(1);
    expect(schema[0].message).toBe("Schema: Missing property 'description'");
    expect(document.getText(schema[0].range)).toBe("'200'");
  });

  it('keeps the full value range for defects that do have offending text', () => {
    // `version` is present but the wrong type: here the value IS the defect, so
    // the anchor narrowing must not apply.
    const document = doc(`openapi: 3.0.0
info: { title: Test, version: 1 }
paths: {}
`, 1, '/anchor-type.yaml');
    manager.runValidation(document);
    const schema = diagnostics(document).filter((item) => item.code === 'schema');
    expect(schema.length).toBeGreaterThan(0);
    expect(document.getText(schema[0].range)).toBe('1');
  });

  it('falls back to the zero range for an unmappable pointer', () => {
    const document = doc(VALID, 1, '/fallback.yaml');
    const converted = (manager as any).toVSCodeDiagnostic(
      { source: 'semantic', severity: 'error', message: 'Unknown location', pointer: '/missing' },
      buildPointerMap(document),
      document
    ) as vscode.Diagnostic;
    expect(converted.range).toEqual(new vscode.Range(0, 0, 0, 0));
  });

  it('clears diagnostics and sticky state when the document closes', () => {
    const document = doc(VALID);
    manager.start();
    manager.runValidation(document);
    expect(vscodeMock.__diagnosticCollections.get('nouto-openapi')!.values.has(document.uri.toString())).toBe(true);
    vscodeMock.__fireDidCloseTextDocument(document);
    expect(vscodeMock.__diagnosticCollections.get('nouto-openapi')!.values.has(document.uri.toString())).toBe(false);
  });

  it('coalesces changes with a per-document 400ms debounce', () => {
    jest.useFakeTimers();
    const collection = vscodeMock.__diagnosticCollections.get('nouto-openapi')!;
    manager.start();
    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 1));
    vscodeMock.__fireDidChangeTextDocument(doc(VALID.replace('A', 'B'), 2));
    expect(collection.set).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(collection.set).toHaveBeenCalledTimes(1);
  });

  it('validates documents that were already open at activation', () => {
    const document = doc(VALID);
    (vscode.workspace.textDocuments as vscode.TextDocument[]).push(document);
    manager.start();
    expect(vscodeMock.__diagnosticCollections.get('nouto-openapi')!.values.has(document.uri.toString())).toBe(true);
  });

  it('ignores ordinary and unsupported-language documents', () => {
    const ordinary = doc('name: config\n', 1, '/config.yaml');
    const text = doc('openapi: 3.1.0', 1, '/text', 'plaintext');
    manager.runValidation(ordinary);
    manager.runValidation(text);
    expect(diagnostics(ordinary)).toEqual([]);
    expect(diagnostics(text)).toEqual([]);
  });

  // A tagless operation trips the `operation-missing-tags` lint rule (default
  // 'warning'), a convenient probe for lint on/off behavior.
  const LINTABLE = `openapi: 3.1.0
info: { title: A, description: An API, version: 1.0.0 }
paths:
  /a:
    get:
      operationId: getA
      responses: { '200': { description: OK } }
`;

  it('emits lint diagnostics by default', () => {
    const document = doc(LINTABLE, 1, '/lint.yaml');
    manager.runValidation(document);
    expect(diagnostics(document).some((item) => item.code === 'operation-missing-tags')).toBe(true);
  });

  it('omits lint diagnostics when openApiLintEnabled is false', () => {
    manager.dispose();
    manager = new OpenApiDiagnosticsManager(fakeContext({ openApiLintEnabled: false }), makeResolver());
    const document = doc(LINTABLE, 1, '/lint-off.yaml');
    manager.runValidation(document);
    expect(diagnostics(document).some((item) => item.code === 'operation-missing-tags')).toBe(false);
  });

  it('respects a per-rule off override in openApiLintRules', () => {
    manager.dispose();
    manager = new OpenApiDiagnosticsManager(
      fakeContext({ openApiLintRules: { 'operation-missing-tags': 'off' } }),
      makeResolver()
    );
    const document = doc(LINTABLE, 1, '/lint-rule-off.yaml');
    manager.runValidation(document);
    expect(diagnostics(document).some((item) => item.code === 'operation-missing-tags')).toBe(false);
  });

  const WITH_BAD_EXAMPLE = `openapi: 3.1.0
info: { title: A, version: 1.0.0 }
paths:
  /a:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { type: integer }
              example: not-a-number
`;

  it('validates examples against their schemas (host-side) as lint diagnostics', () => {
    const document = doc(WITH_BAD_EXAMPLE, 1, '/examples.yaml');
    manager.runValidation(document);
    const found = diagnostics(document).find((item) => item.code === 'example-invalid-media');
    expect(found).toBeDefined();
    expect(found!.severity).toBe(vscode.DiagnosticSeverity.Warning);
    // Anchored at the example value's line.
    expect(document.getText(found!.range)).toContain('not-a-number');
  });

  it('honours the per-rule setting for host-validated example rules', () => {
    manager.dispose();
    manager = new OpenApiDiagnosticsManager(
      fakeContext({ openApiLintRules: { 'example-invalid-media': 'off' } }),
      makeResolver()
    );
    const document = doc(WITH_BAD_EXAMPLE, 1, '/examples-off.yaml');
    manager.runValidation(document);
    expect(diagnostics(document).some((item) => item.code === 'example-invalid-media')).toBe(false);
  });

  describe('external $refs (two-pass validation)', () => {
    const EXTERNAL_SPEC = `openapi: 3.1.0
info: { title: A, version: 1.0.0 }
paths: {}
components:
  schemas:
    Item:
      $ref: './common.yaml#/Item'
`;
    const COMMON = { content: 'Item:\n  type: string\n', format: 'yaml' as OpenApiFormat };

    function useResolver(files: Record<string, { content: string; format: OpenApiFormat }>) {
      manager.dispose();
      manager = new OpenApiDiagnosticsManager(fakeContext(), makeResolver(files));
    }

    it('replaces the sync "unsupported" warning once the ref resolves', async () => {
      useResolver({ 'file:///external/api.yaml': COMMON, 'file:///external/common.yaml': COMMON });
      const document = doc(EXTERNAL_SPEC, 1, '/external/api.yaml');

      manager.runValidation(document);
      expect(
        diagnostics(document).some((item) => item.code === 'external-ref-unsupported')
      ).toBe(true);

      await flushAsync();
      const after = diagnostics(document);
      expect(after.some((item) => item.code === 'external-ref-unsupported')).toBe(false);
      expect(after.some((item) => item.code === 'external-file-not-found')).toBe(false);
    });

    it('reports external-file-not-found for a missing referenced file', async () => {
      useResolver({});
      const document = doc(EXTERNAL_SPEC, 1, '/external-missing/api.yaml');

      manager.runValidation(document);
      await flushAsync();

      const after = diagnostics(document);
      expect(after.some((item) => item.code === 'external-file-not-found')).toBe(true);
      expect(after.some((item) => item.code === 'external-ref-unsupported')).toBe(false);
    });

    it('keeps the sync warning when external resolution is disabled', async () => {
      manager.dispose();
      manager = new OpenApiDiagnosticsManager(
        fakeContext({ openApiExternalRefsEnabled: false }),
        makeResolver({ 'file:///external-off/common.yaml': COMMON })
      );
      const document = doc(EXTERNAL_SPEC, 1, '/external-off/api.yaml');

      manager.runValidation(document);
      await flushAsync();

      expect(
        diagnostics(document).some((item) => item.code === 'external-ref-unsupported')
      ).toBe(true);
    });

    it('never publishes a superseded async pass over newer diagnostics', async () => {
      let releaseLoad: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        releaseLoad = resolve;
      });
      manager.dispose();
      manager = new OpenApiDiagnosticsManager(fakeContext(), {
        resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(),
        load: async () => {
          await gate;
          return undefined; // file "not found" once released
        },
      });

      const v1 = doc(EXTERNAL_SPEC, 1, '/external-race/api.yaml');
      manager.runValidation(v1);
      // Supersede v1 before its async pass can finish.
      const v2 = doc(EXTERNAL_SPEC.replace('title: A', 'title: B'), 2, '/external-race/api.yaml');
      manager.runValidation(v2);

      releaseLoad();
      await flushAsync();

      const collection = vscodeMock.__diagnosticCollections.get('nouto-openapi')!;
      // Sets: v1 sync, v2 sync, v2 async — the superseded v1 async pass bailed.
      expect(collection.set).toHaveBeenCalledTimes(3);
      expect(diagnostics(v2).some((item) => item.code === 'external-file-not-found')).toBe(true);
    });

    it('re-validates open referrers when the referenced document changes', async () => {
      useResolver({ 'file:///external-dep/common.yaml': COMMON });
      const root = doc(EXTERNAL_SPEC, 1, '/external-dep/api.yaml');
      const common = doc(COMMON.content, 1, '/external-dep/common.yaml');
      (vscode.workspace.textDocuments as vscode.TextDocument[]).push(root, common);

      manager.start();
      await flushAsync(); // populate the referencedBy reverse index

      const collection = vscodeMock.__diagnosticCollections.get('nouto-openapi')!;
      const setsForRoot = () =>
        (collection.set as jest.Mock).mock.calls.filter(
          ([uri]: [vscode.Uri]) => uri.toString() === root.uri.toString()
        ).length;
      const before = setsForRoot();

      jest.useFakeTimers();
      vscodeMock.__fireDidChangeTextDocument(common);
      jest.advanceTimersByTime(400);
      jest.useRealTimers();
      await flushAsync();

      expect(setsForRoot()).toBeGreaterThan(before);
    });
  });
});
