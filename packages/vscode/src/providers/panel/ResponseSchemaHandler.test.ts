import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { getByJsonPointer } from '@nouto/core/services';
import { ResponseSchemaHandler } from './ResponseSchemaHandler';
import type { OutlineRevealTarget } from '../../services/openapi';
import { clearOpenApiDocumentState } from '../../services/openapi';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

const SPEC_31 = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths: {}
`;

const SPEC_30 = `openapi: 3.0.3
info:
  title: Test
  version: 1.0.0
paths: {}
`;

const SPEC_31_WITH_SCHEMA = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths: {}
components:
  schemas:
    UsersResponse:
      type: object
`;

const BROKEN_SPEC = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: dup
      responses:
        '200':
          description: OK
    post:
      operationId: dup
      responses:
        '200':
          description: OK
`;

/** Applies the WorkspaceEdit captured by the applyEdit spy to the document. */
function appliedText(document: vscode.TextDocument): string {
  const applyEdit = vscode.workspace.applyEdit as jest.Mock;
  expect(applyEdit).toHaveBeenCalledTimes(1);
  const edit = applyEdit.mock.calls[0][0] as {
    get(uri: unknown): Array<{ range: vscode.Range; newText: string }>;
  };
  const changes = edit.get(document.uri)
    .map((change) => ({
      start: document.offsetAt(change.range.start),
      end: document.offsetAt(change.range.end),
      newText: change.newText,
    }))
    .sort((a, b) => b.start - a.start);
  let result = document.getText();
  for (const change of changes) {
    result = result.slice(0, change.start) + change.newText + result.slice(change.end);
  }
  return result;
}

function parseAt(content: string, pointer: string): unknown {
  const resolved = getByJsonPointer(yaml.load(content), pointer);
  expect(resolved.found).toBe(true);
  return resolved.value;
}

describe('ResponseSchemaHandler', () => {
  const handler = new ResponseSchemaHandler();
  const uris: vscode.Uri[] = [];
  let outlineTarget: OutlineRevealTarget;

  function openDocument(content: string, path: string): vscode.TextDocument {
    const document = createFakeTextDocument({ content, path });
    uris.push(document.uri);
    (vscode.workspace.textDocuments as vscode.TextDocument[]).push(document);
    return document;
  }

  beforeEach(() => {
    outlineTarget = {
      revealPointerOnce: jest.fn().mockResolvedValue(undefined),
      suppressSelectionSyncOnce: jest.fn(),
    };
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({
      selection: undefined,
      revealRange: jest.fn(),
    });
  });

  afterEach(() => {
    for (const uri of uris) clearOpenApiDocumentState(uri);
    uris.length = 0;
    (vscode.workspace.textDocuments as vscode.TextDocument[]).length = 0;
    jest.clearAllMocks();
  });

  it('errors when the outline provider is not bound yet', async () => {
    await handler.addResponseSchemaToSpec(undefined, { body: { a: 1 } });
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'The OpenAPI outline is not ready yet. Try again in a moment.'
    );
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('errors when no OpenAPI document is open', async () => {
    openDocument('just some text', '/notes.yaml');
    await handler.addResponseSchemaToSpec(outlineTarget, { body: { a: 1 } });
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Open an OpenAPI document first.');
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('refuses a document with error diagnostics', async () => {
    openDocument(BROKEN_SPEC, '/broken.yaml');
    await handler.addResponseSchemaToSpec(outlineTarget, { body: { a: 1 } });
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'The OpenAPI document has errors. Fix them before adding a schema.'
    );
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('inserts an inferred schema named from the request URL (3.1 type arrays)', async () => {
    const document = openDocument(SPEC_31, '/spec-31.yaml');
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);

    await handler.addResponseSchemaToSpec(outlineTarget, {
      body: { id: 7, tags: ['a', null] },
      requestUrl: 'https://api.example.com/api/v1/users/42',
    });

    const text = appliedText(document);
    expect(parseAt(text, '/components/schemas/UsersResponse')).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        tags: { type: 'array', items: { type: ['string', 'null'] } },
      },
      required: ['id', 'tags'],
    });
    expect(outlineTarget.revealPointerOnce).toHaveBeenCalledWith('/components/schemas/UsersResponse');
  });

  it('renders 3.0-safe nullability for a 3.0 target document', async () => {
    const document = openDocument(SPEC_30, '/spec-30.yaml');
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);

    await handler.addResponseSchemaToSpec(outlineTarget, {
      body: { tags: ['a', null] },
      requestUrl: '/users',
    });

    expect(parseAt(appliedText(document), '/components/schemas/UsersResponse/properties/tags')).toEqual({
      type: 'array',
      items: { type: 'string', nullable: true },
    });
  });

  it('uniquifies the name against existing component schemas', async () => {
    const document = openDocument(SPEC_31_WITH_SCHEMA, '/spec-existing.yaml');
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);

    await handler.addResponseSchemaToSpec(outlineTarget, {
      body: { a: 1 },
      requestUrl: '/users',
    });

    expect(parseAt(appliedText(document), '/components/schemas/UsersResponse-2')).toBeDefined();
  });

  it('falls back to the schemas placeholder when the URL yields no name', async () => {
    const document = openDocument(SPEC_31, '/spec-31.yaml');
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);

    await handler.addResponseSchemaToSpec(outlineTarget, { body: { a: 1 } });

    expect(parseAt(appliedText(document), '/components/schemas/NewSchema')).toBeDefined();
  });

  it('parses a stringified JSON body', async () => {
    const document = openDocument(SPEC_31, '/spec-31.yaml');
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);

    await handler.addResponseSchemaToSpec(outlineTarget, {
      body: '{"a": 1}',
      requestUrl: '/users',
    });

    expect(parseAt(appliedText(document), '/components/schemas/UsersResponse')).toMatchObject({
      properties: { a: { type: 'integer' } },
    });
  });

  it('inserts a top-level array body as an array schema', async () => {
    const document = openDocument(SPEC_31, '/spec-31.yaml');
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);

    await handler.addResponseSchemaToSpec(outlineTarget, {
      body: [{ a: 1 }],
      requestUrl: '/users',
    });

    expect(parseAt(appliedText(document), '/components/schemas/UsersResponse')).toMatchObject({
      type: 'array',
      items: { type: 'object' },
    });
  });

  it('offers a QuickPick when several OpenAPI documents are open and honors cancel', async () => {
    openDocument(SPEC_31, '/one.yaml');
    openDocument(SPEC_30, '/two.yaml');
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await handler.addResponseSchemaToSpec(outlineTarget, { body: { a: 1 } });

    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
    const items = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{ label: string }>;
    expect(items.map((item) => item.label)).toEqual(['one.yaml', 'two.yaml']);
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('inserts into the QuickPick-chosen document', async () => {
    openDocument(SPEC_31, '/one.yaml');
    const chosen = openDocument(SPEC_31, '/two.yaml');
    (vscode.window.showQuickPick as jest.Mock).mockImplementation(
      async (items: Array<{ label: string; doc: vscode.TextDocument }>) =>
        items.find((item) => item.label === 'two.yaml')
    );
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(chosen);

    await handler.addResponseSchemaToSpec(outlineTarget, { body: { a: 1 }, requestUrl: '/users' });

    expect(parseAt(appliedText(chosen), '/components/schemas/UsersResponse')).toBeDefined();
  });
});
