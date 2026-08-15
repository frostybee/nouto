import * as vscode from 'vscode';
import { analyzeOpenApi, isAnchoredDiagnostic, runLintRules } from '@nouto/core/services';
import type { OpenApiDiagnostic, OpenApiFormat } from '@nouto/core/services';
import { OpenApiCodeActionProvider } from './OpenApiCodeActionProvider';
import { buildPointerMap, getOpenApiAnalysis, pointerToAnchorRange, pointerToRange } from '../services/openapi';
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

/** Diagnostic → range exactly as OpenApiDiagnosticsManager places it. */
function rangeFor(document: vscode.TextDocument, diagnostic: OpenApiDiagnostic): vscode.Range {
  const map = buildPointerMap(document);
  return (isAnchoredDiagnostic(diagnostic)
    ? pointerToAnchorRange(map, diagnostic.pointer ?? '')
    : pointerToRange(map, diagnostic.pointer ?? ''))!;
}

/**
 * Runs the provider against the first diagnostic carrying each of `codes`
 * (semantic/reference from the analysis, lint from a default lint pass),
 * mirroring how VS Code passes reported diagnostics in `context.diagnostics`.
 */
async function offerFixes(content: string, codes: string | string[], path: string, languageId = 'yaml') {
  const document = createFakeTextDocument({ content, languageId, path });
  const analysis = getOpenApiAnalysis(document);
  const all = [...analysis.diagnostics, ...runLintRules(analysis, { disabledRules: [] })];
  const wanted = Array.isArray(codes) ? codes : [codes];
  const reportedList: vscode.Diagnostic[] = [];
  for (const code of wanted) {
    const core = all.find((diagnostic) => diagnostic.code === code);
    if (!core) continue;
    const reported = new vscode.Diagnostic(rangeFor(document, core), core.message, vscode.DiagnosticSeverity.Error);
    reported.source = 'nouto-openapi';
    reported.code = code;
    reportedList.push(reported);
  }
  if (reportedList.length === 0) return { document, actions: [] as vscode.CodeAction[] };
  const context = {
    diagnostics: reportedList,
    triggerKind: 1,
    only: undefined,
  } as unknown as vscode.CodeActionContext;
  return { document, actions: await provider.provideCodeActions(document, reportedList[0].range, context) };
}

/** Applies the single offered fix and returns the codes still present after. */
async function codesAfterFix(content: string, code: string, path: string, format: OpenApiFormat = 'yaml') {
  const { document, actions } = await offerFixes(content, code, path, format === 'json' ? 'json' : 'yaml');
  expect(actions).toHaveLength(1);
  expect(actions[0].kind).toBe(vscode.CodeActionKind.QuickFix);
  expect(actions[0].edit).toBeDefined();
  const edited = applyEdit(document, actions[0].edit!);
  const reanalyzed = analyzeOpenApi(edited, format);
  const codes = [
    ...reanalyzed.diagnostics,
    ...runLintRules(reanalyzed, { disabledRules: [] }),
  ].map((diagnostic) => diagnostic.code);
  return { edited, codes, title: actions[0].title, action: actions[0] };
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

  describe('lint quick fixes', () => {
    const LINTABLE = [
      'openapi: 3.1.0',
      'info: { title: T, version: 1.0.0, description: d }',
      'security: [{ key: [] }]',
      'paths:',
      '  /store/order/{orderId}:',
      '    get:',
      '      parameters:',
      '        - name: tags',
      '          in: query',
      '          schema:',
      '            type: array',
      '            items: { type: string }',
      '      responses:',
      "        '200': { description: OK }",
      'components:',
      '  securitySchemes:',
      '    key: { type: apiKey, in: header, name: X-Key }',
      '  schemas:',
      '    Pet:',
      '      type: object',
      '',
    ].join('\n');

    it('offers one "default response" action for the 4xx and 5xx findings together', async () => {
      const { document, actions } = await offerFixes(
        LINTABLE, ['operation-missing-4xx', 'operation-missing-5xx'], '/lint.yaml'
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].title).toBe('Add "default" response');
      expect(actions[0].diagnostics).toHaveLength(2);
      const edited = applyEdit(document, actions[0].edit!);
      const codes = runLintRules(analyzeOpenApi(edited, 'yaml'), { disabledRules: [] }).map((d) => d.code);
      expect(codes).not.toContain('operation-missing-4xx');
      expect(codes).not.toContain('operation-missing-5xx');
    });

    it('bounds an array parameter', async () => {
      const { edited, codes, title } = await codesAfterFix(LINTABLE, 'parameter-unbounded', '/lint.yaml');
      expect(title).toBe('Add maxItems: 100');
      expect(edited).toContain('maxItems: 100');
      expect(codes).not.toContain('parameter-unbounded');
    });

    it('constrains additionalProperties on a component schema', async () => {
      const { edited, codes } = await codesAfterFix(
        LINTABLE, 'schema-unconstrained-additional-properties', '/lint.yaml'
      );
      expect(edited).toContain('additionalProperties: false');
      expect(codes).not.toContain('schema-unconstrained-additional-properties');
    });

    it('adds a tag and an operationId derived from the path', async () => {
      const tags = await codesAfterFix(LINTABLE, 'operation-missing-tags', '/lint.yaml');
      expect(tags.title).toBe('Add tag "store"');
      expect(tags.codes).not.toContain('operation-missing-tags');

      const id = await codesAfterFix(LINTABLE, 'operation-missing-operation-id', '/lint.yaml');
      expect(id.title).toBe('Add operationId "getStoreOrderByOrderId"');
      expect(id.codes).not.toContain('operation-missing-operation-id');
    });

    it('offers per-scheme security requirements and the global one clears every operation', async () => {
      const content = [
        'openapi: 3.0.4',
        'info: { title: T, version: 1.0.0, description: d }',
        'servers:',
        '  - url: http://petstore.example/api/v3',
        'paths:',
        '  /store/order:',
        '    post:',
        '      operationId: placeOrder',
        '      summary: Place',
        '      tags: [store]',
        '      responses:',
        "        '200': { description: OK }",
        "        '400': { description: Bad }",
        '        default: { description: Err }',
        '  /store/inventory:',
        '    get:',
        '      operationId: getInventory',
        '      summary: Inventory',
        '      tags: [store]',
        '      responses:',
        "        '200': { description: OK }",
        "        '400': { description: Bad }",
        '        default: { description: Err }',
        'components:',
        '  securitySchemes:',
        '    petstore_auth: { type: apiKey, in: header, name: X-A }',
        '    api_key: { type: apiKey, in: header, name: X-B }',
        '',
      ].join('\n');
      const { document, actions } = await offerFixes(content, 'operation-without-security', '/sec.yaml');
      expect(actions.map((a) => a.title)).toEqual([
        'Require "petstore_auth" for this operation',
        'Require "api_key" for this operation',
        'Require "petstore_auth" for all operations',
        'Require "api_key" for all operations',
      ]);
      const edited = applyEdit(document, actions[2].edit!);
      const codes = runLintRules(analyzeOpenApi(edited, 'yaml'), { disabledRules: [] }).map((d) => d.code);
      expect(codes).not.toContain('operation-without-security');
      expect(edited).toMatch(/servers:[\s\S]*security:\n\s+- petstore_auth: \[\]\npaths:/);

      const https = await codesAfterFix(content, 'server-uses-http', '/sec.yaml');
      expect(https.title).toBe('Use https://');
      expect(https.edited).toContain('url: https://petstore.example/api/v3');
      expect(https.codes).not.toContain('server-uses-http');
    });

    it('adds rate-limit headers to the 2xx responses of an operation', async () => {
      // Block-style response: the YAML planner does not splice into flow maps.
      const content = LINTABLE.replace("        '200': { description: OK }", "        '200':\n          description: OK");
      // The rule is opt-in: the provider only considers it when the user's
      // settings enable it, exactly like the diagnostics manager.
      const optedIn = new OpenApiCodeActionProvider(
        fakeContext({ openApiLintRules: { 'rate-limit-headers': 'warning' } }),
        fakeResolver
      );
      const document = createFakeTextDocument({ content, languageId: 'yaml', path: '/rl.yaml' });
      const analysis = getOpenApiAnalysis(document);
      const core = runLintRules(analysis, { disabledRules: [] }).find((d) => d.code === 'rate-limit-headers')!;
      const reported = new vscode.Diagnostic(rangeFor(document, core), core.message, vscode.DiagnosticSeverity.Warning);
      reported.source = 'nouto-openapi';
      reported.code = core.code;
      const context = { diagnostics: [reported], triggerKind: 1, only: undefined } as unknown as vscode.CodeActionContext;

      // Default settings (rule off): nothing offered, matching the absent squiggle.
      await expect(provider.provideCodeActions(document, reported.range, context)).resolves.toEqual([]);

      const actions = await optedIn.provideCodeActions(document, reported.range, context);
      expect(actions.map((a) => a.title)).toEqual(['Add rate-limit headers to 2xx responses']);
      const edited = applyEdit(document, actions[0].edit!);
      expect(edited).toContain('X-RateLimit-Limit:');
      const codes = runLintRules(analyzeOpenApi(edited, 'yaml'), { disabledRules: [] }).map((d) => d.code);
      expect(codes).not.toContain('rate-limit-headers');
    });

    it('adds a derived summary and an info description', async () => {
      const content = [
        'openapi: 3.1.0',
        'info:',
        '  title: Petstore',
        '  version: 1.0.0',
        'security: [{ key: [] }]',
        'paths:',
        '  /store/order/{orderId}:',
        '    get:',
        '      operationId: getOrderById',
        '      tags: [store]',
        '      responses:',
        "        '200': { description: OK }",
        "        '400': { description: Bad }",
        '        default: { description: Err }',
        'components:',
        '  securitySchemes:',
        '    key: { type: apiKey, in: header, name: X-Key }',
        '',
      ].join('\n');
      const summary = await codesAfterFix(content, 'operation-missing-description', '/desc.yaml');
      expect(summary.title).toBe('Add summary "Get order by id"');
      expect(summary.codes).not.toContain('operation-missing-description');

      const info = await codesAfterFix(content, 'missing-info-description', '/desc.yaml');
      expect(info.title).toBe('Add info description "Petstore API."');
      expect(info.codes).not.toContain('missing-info-description');
    });

    it('offers nothing for lint findings when linting is disabled', async () => {
      const disabled = new OpenApiCodeActionProvider(fakeContext({ openApiLintEnabled: false }), fakeResolver);
      const document = createFakeTextDocument({ content: LINTABLE, languageId: 'yaml', path: '/off.yaml' });
      const analysis = getOpenApiAnalysis(document);
      const core = runLintRules(analysis, { disabledRules: [] }).find((d) => d.code === 'operation-missing-5xx')!;
      const reported = new vscode.Diagnostic(rangeFor(document, core), core.message, vscode.DiagnosticSeverity.Warning);
      reported.source = 'nouto-openapi';
      reported.code = core.code;
      const context = { diagnostics: [reported], triggerKind: 1, only: undefined } as unknown as vscode.CodeActionContext;
      await expect(disabled.provideCodeActions(document, reported.range, context)).resolves.toEqual([]);
    });
  });
});
