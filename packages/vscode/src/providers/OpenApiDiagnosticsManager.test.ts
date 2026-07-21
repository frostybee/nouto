import * as vscode from 'vscode';
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

describe('OpenApiDiagnosticsManager', () => {
  let manager: OpenApiDiagnosticsManager;
  const documents: vscode.TextDocument[] = [];

  beforeEach(() => {
    (vscode.workspace.textDocuments as vscode.TextDocument[]).length = 0;
    manager = new OpenApiDiagnosticsManager();
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
    expect(codes.has('schema')).toBe(true);
    expect(codes.has('semantic')).toBe(true);
    expect(codes.has('reference')).toBe(true);
    expect(codes.has('syntax')).toBe(false);

    const json = doc('{"openapi":"3.1.0","info":{"title":"A","version":"1.0.0"},"paths":{}}', 1, '/spec.json', 'json');
    manager.runValidation(json);
    expect(diagnostics(json).some((item) => item.code === 'syntax')).toBe(false);
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
});
