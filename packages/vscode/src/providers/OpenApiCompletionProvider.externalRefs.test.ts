import * as vscode from 'vscode';
import type { FileResolver, OpenApiFormat } from '@nouto/core/services';
import { OpenApiCompletionProvider } from './OpenApiCompletionProvider';
import {
  clearExternalRefCompletionCache,
  clearOpenApiDocumentState,
} from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

const token = { isCancellationRequested: false } as vscode.CancellationToken;

function fakeContext(settings: Record<string, unknown> = {}): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'nouto.settings' ? settings : undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

function makeResolver(
  files: Record<string, { content: string; format: OpenApiFormat }>
): FileResolver {
  return {
    resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(),
    load: async (uri) => files[uri],
  };
}

const COMMON_YAML = [
  'components:',
  '  schemas:',
  '    Item:',
  '      type: string',
  '    Other:',
  '      type: number',
  '  responses:',
  '    NotFound:',
  '      description: nope',
  '',
].join('\n');

/** A schema-kind $ref whose value is the given text (cursor goes at its end). */
function specWithRefValue(value: string): string {
  return [
    'openapi: 3.1.0',
    'info:',
    '  title: T',
    '  version: 1.0.0',
    'paths: {}',
    'components:',
    '  schemas:',
    '    Local:',
    '      type: object',
    '      properties:',
    '        other:',
    `          $ref: ${value}`,
    '',
  ].join('\n');
}

describe('OpenApiCompletionProvider — cross-file $refs', () => {
  let docId = 0;
  const documents: vscode.TextDocument[] = [];

  afterEach(() => {
    for (const document of documents) clearOpenApiDocumentState(document.uri);
    documents.length = 0;
    clearExternalRefCompletionCache();
    (vscode.workspace.textDocuments as vscode.TextDocument[]).length = 0;
  });

  function makeDocument(content: string, languageId = 'yaml'): vscode.TextDocument {
    docId += 1;
    const ext = languageId === 'yaml' ? 'yaml' : 'json';
    const document = createFakeTextDocument({
      content,
      languageId,
      path: `/completion-ext-${docId}/api.${ext}`,
    });
    documents.push(document);
    return document;
  }

  function commonUri(ext = 'yaml'): string {
    return `file:///completion-ext-${docId}/common.${ext}`;
  }

  async function complete(
    document: vscode.TextDocument,
    offset: number,
    resolver: FileResolver,
    settings: Record<string, unknown> = {}
  ): Promise<vscode.CompletionItem[]> {
    const provider = new OpenApiCompletionProvider(fakeContext(settings), resolver);
    return provider.provideCompletionItems(document, document.positionAt(offset), token);
  }

  const labels = (items: vscode.CompletionItem[]) => items.map((item) => item.label as string);

  it('suggests the target file\'s pointers after `file#/`, section-restricted', async () => {
    const content = specWithRefValue("'./common.yaml#/'");
    const document = makeDocument(content);
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_YAML, format: 'yaml' } });
    const offset = content.indexOf("#/'") + 2; // inside quotes, after `#/`

    const items = await complete(document, offset, resolver);

    const crossFile = labels(items).filter((label) => label.startsWith('./common.yaml#'));
    expect(crossFile.sort()).toEqual([
      './common.yaml#/components/schemas/Item',
      './common.yaml#/components/schemas/Other',
    ]);
    // Section-restricted: the responses bucket is not offered in a Schema slot.
    expect(labels(items)).not.toContain('./common.yaml#/components/responses/NotFound');
  });

  it('sets an explicit replace range spanning the typed value', async () => {
    const content = specWithRefValue("'./common.yaml#/'");
    const document = makeDocument(content);
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_YAML, format: 'yaml' } });
    const offset = content.indexOf("#/'") + 2;

    const items = await complete(document, offset, resolver);

    const item = items.find((entry) => entry.label === './common.yaml#/components/schemas/Item')!;
    const range = item.range as vscode.Range;
    const position = document.positionAt(offset);
    expect(range.end.line).toBe(position.line);
    expect(range.end.character).toBe(position.character);
    const line = content.split('\n')[position.line];
    expect(range.start.character).toBe(line.indexOf('./common.yaml'));
    // Cursor sits inside quotes, so the inserted text carries none.
    expect(item.insertText).toBe('./common.yaml#/components/schemas/Item');
  });

  it('quotes inserted refs when the value is not yet quoted', async () => {
    const content = specWithRefValue('./common.yaml#/');
    const document = makeDocument(content);
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_YAML, format: 'yaml' } });
    const offset = content.indexOf('#/\n') + 2;

    const items = await complete(document, offset, resolver);

    const item = items.find((entry) => entry.label === './common.yaml#/components/schemas/Item')!;
    expect(item.insertText).toBe("'./common.yaml#/components/schemas/Item'");
  });

  it('completes cross-file refs in JSON documents', async () => {
    const json = JSON.stringify(
      {
        openapi: '3.1.0',
        info: { title: 'T', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Local: { type: 'object', properties: { other: { $ref: './common.json#/' } } },
          },
        },
      },
      null,
      2
    );
    const document = makeDocument(json, 'json');
    const resolver = makeResolver({
      [commonUri('json')]: {
        content: JSON.stringify({ components: { schemas: { Item: {} } } }),
        format: 'json',
      },
    });
    const offset = json.indexOf('./common.json#/') + './common.json#/'.length;

    const items = await complete(document, offset, resolver);

    const item = items.find((entry) => entry.label === './common.json#/components/schemas/Item')!;
    expect(item).toBeDefined();
    // Inside the JSON string literal: no added quotes.
    expect(item.insertText).toBe('./common.json#/components/schemas/Item');
  });

  it('falls back to top-level keys for files without a components bucket', async () => {
    const content = specWithRefValue("'./common.yaml#/'");
    const document = makeDocument(content);
    const resolver = makeResolver({
      [commonUri()]: { content: 'Item:\n  type: string\n', format: 'yaml' },
    });
    const offset = content.indexOf("#/'") + 2;

    const items = await complete(document, offset, resolver);

    expect(labels(items)).toContain('./common.yaml#/Item');
  });

  it('offers whole-ref suggestions for already-referenced files on an empty value', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths: {}',
      'components:',
      '  schemas:',
      '    Existing:',
      "      $ref: './common.yaml#/components/schemas/Item'",
      '    Fresh:',
      '      type: object',
      '      properties:',
      '        next:',
      '          $ref: ',
      '',
    ].join('\n');
    const document = makeDocument(content);
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_YAML, format: 'yaml' } });
    const offset = content.lastIndexOf('$ref: ') + '$ref: '.length;

    const items = await complete(document, offset, resolver);

    expect(labels(items)).toEqual(
      expect.arrayContaining([
        './common.yaml#/components/schemas/Item',
        './common.yaml#/components/schemas/Other',
      ])
    );
  });

  it('offers only in-document targets when the file part cannot be resolved', async () => {
    const content = specWithRefValue("'./missing.yaml#/'");
    const document = makeDocument(content);
    const resolver = makeResolver({});
    const offset = content.indexOf("#/'") + 2;

    const items = await complete(document, offset, resolver);

    expect(labels(items).some((label) => label.startsWith('./missing.yaml#'))).toBe(false);
  });

  it('offers no cross-file items when externalRefsEnabled is off', async () => {
    const content = specWithRefValue("'./common.yaml#/'");
    const document = makeDocument(content);
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_YAML, format: 'yaml' } });
    const offset = content.indexOf("#/'") + 2;

    const items = await complete(document, offset, resolver, {
      openApiExternalRefsEnabled: false,
    });

    expect(labels(items).some((label) => label.startsWith('./common.yaml#'))).toBe(false);
  });
});
