import * as vscode from 'vscode';
import { OpenApiDiagnosticsManager } from './OpenApiDiagnosticsManager';
import { OpenApiCodeActionProvider } from './OpenApiCodeActionProvider';
import { clearOpenApiDocumentState } from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

const vscodeMock = vscode as typeof vscode & { __diagnosticCollections: Map<string, any> };

const context = {
  globalState: { get: () => undefined },
} as unknown as vscode.ExtensionContext;
const resolver = { resolve: (from: string, ref: string) => new URL(ref, from).toString(), load: async () => undefined };

const SPEC = `openapi: 3.2.0
info: { title: T, version: 1.0.0, description: d }
security: [{ key: [] }]
paths:
  /pet:
    post:
      tags: [pet]
      summary: Add a pet
      operationId: addPet
      responses:
        '200':
          description: Successful operation
        '400':
          description: Invalid input
components:
  securitySchemes:
    key: { type: apiKey, in: header, name: X-Key }
`;

describe('lint quick fix, manager -> provider round trip', () => {
  it('offers "Add default response" for the diagnostics VS Code passes at the responses key', async () => {
    const document = createFakeTextDocument({ content: SPEC, path: '/pet.yaml', languageId: 'yaml' });
    const manager = new OpenApiDiagnosticsManager(context, resolver);
    manager.runValidation(document);
    const published: readonly vscode.Diagnostic[] =
      vscodeMock.__diagnosticCollections.get('nouto-openapi')!.get(document.uri as any) ?? [];
    expect(published.map((d) => d.code)).toContain('operation-missing-5xx');

    // Cursor on `responses:` — VS Code hands over every diagnostic whose range
    // intersects the cursor position.
    const line = SPEC.split('\n').findIndex((l) => l.trim() === 'responses:');
    const cursor = new vscode.Range(line, 8, line, 8);
    const atCursor = published.filter((d) => d.range.contains(cursor.start) || d.range.intersection(cursor));
    expect(atCursor.map((d) => d.code)).toContain('operation-missing-5xx');

    const provider = new OpenApiCodeActionProvider(context, resolver);
    const actions = await provider.provideCodeActions(document, cursor, {
      diagnostics: atCursor,
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext);
    expect(actions.map((a) => a.title)).toContain('Add "default" response');
    manager.dispose();
    clearOpenApiDocumentState(document.uri);
  });
});
