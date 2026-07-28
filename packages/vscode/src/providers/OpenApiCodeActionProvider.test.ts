import * as vscode from 'vscode';
import { analyzeOpenApi } from '@nouto/core/services';
import type { OpenApiFormat } from '@nouto/core/services';
import { OpenApiCodeActionProvider } from './OpenApiCodeActionProvider';
import { buildPointerMap, getOpenApiAnalysis, pointerToRange } from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

/** Applies a WorkspaceEdit to the document text in-memory (right-to-left). */
function applyEdit(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): string {
  const text = document.getText();
  const changes = (edit as unknown as { get(uri: unknown): Array<{ range: vscode.Range; newText: string }> })
    .get(document.uri)
    .map((change) => ({
      start: document.offsetAt(change.range.start),
      end: document.offsetAt(change.range.end),
      newText: change.newText,
    }))
    .sort((a, b) => b.start - a.start);
  let result = text;
  for (const change of changes) {
    result = result.slice(0, change.start) + change.newText + result.slice(change.end);
  }
  return result;
}

function fakeContext(settings?: Record<string, unknown>): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'nouto.settings' ? settings : undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

const fakeResolver = {
  resolve: (fromUri: string, refPath: string) => new URL(refPath, fromUri).toString(),
  load: async () => undefined,
};

const provider = new OpenApiCodeActionProvider(fakeContext(), fakeResolver);

/**
 * Runs the provider against the first diagnostic carrying `code`, mirroring how
 * VS Code passes the reported diagnostic in `context.diagnostics`.
 */
async function offerFixes(content: string, code: string, path: string, languageId = 'yaml') {
  const document = createFakeTextDocument({ content, languageId, path });
  const analysis = getOpenApiAnalysis(document);
  const map = buildPointerMap(document);
  const core = analysis.diagnostics.find((diagnostic) => diagnostic.code === code);
  if (!core) return { document, actions: [] as vscode.CodeAction[] };
  const range = pointerToRange(map, core.pointer ?? '')!;
  const reported = new vscode.Diagnostic(range, core.message, vscode.DiagnosticSeverity.Error);
  reported.source = 'nouto-openapi';
  reported.code = code;
  const context = {
    diagnostics: [reported],
    triggerKind: 1,
    only: undefined,
  } as unknown as vscode.CodeActionContext;
  return { document, actions: await provider.provideCodeActions(document, range, context) };
}

/** Applies the single offered fix and returns the codes still present after. */
async function codesAfterFix(content: string, code: string, path: string, format: OpenApiFormat = 'yaml') {
  const { document, actions } = await offerFixes(content, code, path, format === 'json' ? 'json' : 'yaml');
  expect(actions).toHaveLength(1);
  expect(actions[0].kind).toBe(vscode.CodeActionKind.QuickFix);
  expect(actions[0].edit).toBeDefined();
  const edited = applyEdit(document, actions[0].edit!);
  const reanalyzed = analyzeOpenApi(edited, format);
  return { edited, codes: reanalyzed.diagnostics.map((diagnostic) => diagnostic.code), title: actions[0].title };
}

describe('OpenApiCodeActionProvider', () => {
  it('uniquifies a duplicate operationId', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths:',
      '  /a:',
      '    get:',
      '      operationId: dup',
      '      responses:',
      "        '200': { description: OK }",
      '  /b:',
      '    get:',
      '      operationId: dup',
      '      responses:',
      "        '200': { description: OK }",
      '',
    ].join('\n');
    const { edited, codes, title } = await codesAfterFix(content, 'duplicate-operation-id', '/dup.yaml');
    expect(title).toBe('Rename operationId to "dup-2"');
    expect(edited).toContain('operationId: dup-2');
    expect(codes).not.toContain('duplicate-operation-id');
  });

  it('adds a missing path parameter', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths:',
      '  /pets/{id}:',
      '    get:',
      '      responses:',
      "        '200': { description: OK }",
      '',
    ].join('\n');
    const { edited, codes, title } = await codesAfterFix(content, 'missing-path-param', '/missing-param.yaml');
    expect(title).toBe('Add path parameter "id"');
    expect(edited).toContain('name: id');
    expect(edited).toContain('in: path');
    expect(codes).not.toContain('missing-path-param');
  });

  it('removes an unused path parameter', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths:',
      '  /pets:',
      '    get:',
      '      parameters:',
      '        - name: id',
      '          in: path',
      '          required: true',
      '          schema:',
      '            type: string',
      '      responses:',
      "        '200': { description: OK }",
      '',
    ].join('\n');
    const { codes, title } = await codesAfterFix(content, 'unused-path-param', '/unused-param.yaml');
    expect(title).toBe('Remove unused path parameter');
    expect(codes).not.toContain('unused-path-param');
  });

  it('inserts an empty paths object for a spec with no root sections', async () => {
    const content = ['openapi: 3.1.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const { edited, codes, title } = await codesAfterFix(content, 'missing-root-sections', '/no-root.yaml');
    expect(title).toBe('Add empty "paths" object');
    expect(edited).toContain('paths:');
    expect(codes).not.toContain('missing-root-sections');
  });

  it('creates a missing internal component schema', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths:',
      '  /pets:',
      '    get:',
      '      responses:',
      "        '200':",
      '          description: OK',
      '          content:',
      '            application/json:',
      '              schema:',
      "                $ref: '#/components/schemas/Pet'",
      '',
    ].join('\n');
    const { edited, codes, title } = await codesAfterFix(content, 'ref-not-found', '/missing-ref.yaml');
    expect(title).toBe('Create missing component "Pet"');
    expect(edited).toContain('components:');
    expect(edited).toContain('Pet:');
    expect(codes).not.toContain('ref-not-found');
  });

  it('offers no fix for an unsupported external reference', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths:',
      '  /pets:',
      '    get:',
      '      responses:',
      "        '200':",
      '          description: OK',
      '          content:',
      '            application/json:',
      '              schema:',
      "                $ref: './other.yaml#/Pet'",
      '',
    ].join('\n');
    const document = createFakeTextDocument({ content, languageId: 'yaml', path: '/external-ref.yaml' });
    const analysis = getOpenApiAnalysis(document);
    const map = buildPointerMap(document);
    const external = analysis.diagnostics.find((diagnostic) => diagnostic.source === 'reference')!;
    const range = pointerToRange(map, external.pointer ?? '')!;
    const reported = new vscode.Diagnostic(range, external.message, vscode.DiagnosticSeverity.Warning);
    reported.source = 'nouto-openapi';
    reported.code = 'reference';
    const context = { diagnostics: [reported], triggerKind: 1, only: undefined } as unknown as vscode.CodeActionContext;
    await expect(provider.provideCodeActions(document, range, context)).resolves.toEqual([]);
  });

  it('offers nothing for a non-OpenAPI document', async () => {
    const document = createFakeTextDocument({ content: 'name: not-a-spec\n', languageId: 'yaml', path: '/plain.yaml' });
    const context = { diagnostics: [], triggerKind: 1, only: undefined } as unknown as vscode.CodeActionContext;
    await expect(provider.provideCodeActions(document, new vscode.Range(0, 0, 0, 0), context)).resolves.toEqual([]);
  });
});
