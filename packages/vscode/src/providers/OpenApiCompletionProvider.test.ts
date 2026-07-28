import * as vscode from 'vscode';
import { OpenApiCompletionProvider } from './OpenApiCompletionProvider';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import { clearOpenApiDocumentState } from '../services/openapi';

const token = { isCancellationRequested: false } as vscode.CancellationToken;

function fakeContext(settings: Record<string, unknown> = {}): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'nouto.settings' ? settings : undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

let docId = 0;
function makeDocument(content: string, languageId = 'yaml'): vscode.TextDocument {
  docId += 1;
  const ext = languageId === 'yaml' ? 'yaml' : 'json';
  const document = createFakeTextDocument({ content, languageId, path: `/completion-${docId}.${ext}` });
  clearOpenApiDocumentState(document.uri);
  return document;
}

const fakeResolver = {
  resolve: (fromUri: string, refPath: string) => new URL(refPath, fromUri).toString(),
  load: async () => undefined as { content: string; format: 'yaml' | 'json' } | undefined,
};

function complete(
  document: vscode.TextDocument,
  offset: number,
  context = fakeContext()
): Promise<vscode.CompletionItem[]> {
  const provider = new OpenApiCompletionProvider(context, fakeResolver);
  return provider.provideCompletionItems(document, document.positionAt(offset), token);
}

function labels(items: vscode.CompletionItem[]): string[] {
  return items.map((item) => item.label as string);
}

describe('OpenApiCompletionProvider — key completion', () => {
  it('suggests Operation properties on a blank line under a method', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths:',
      '  /pets:',
      '    get:',
      '      ',
    ].join('\n');
    const document = makeDocument(content);
    const items = await complete(document, content.length);
    expect(labels(items)).toEqual(expect.arrayContaining(['operationId', 'summary', 'responses', 'parameters']));
  });

  it('suggests root-level properties and gates them by version', async () => {
    const base = ['openapi: 3.0.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const document = makeDocument(base);
    const items = await complete(document, base.length);
    expect(labels(items)).toEqual(expect.arrayContaining(['paths', 'components', 'servers']));
    expect(labels(items)).not.toContain('webhooks'); // 3.1+ only
  });

  it('keeps completion alive for an unknown future 3.x minor (treated as 3.2)', async () => {
    const base = ['openapi: 3.3.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const document = makeDocument(base);
    const items = await complete(document, base.length);
    expect(labels(items)).toEqual(expect.arrayContaining(['paths', 'components', 'webhooks', '$self']));
  });

  it('suggests webhooks at the root of a 3.1 document', async () => {
    const base = ['openapi: 3.1.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const document = makeDocument(base);
    expect(labels(await complete(document, base.length))).toContain('webhooks');
  });

  it('scaffolds the required child key when completing a container property', async () => {
    const base = ['openapi: 3.1.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const document = makeDocument(base);
    const servers = (await complete(document, base.length)).find((item) => item.label === 'servers');
    const snippet = servers?.insertText as vscode.SnippetString;
    expect(snippet.value).toBe('servers:\n  - url: $1');
  });

  it('completes keys in JSON documents', async () => {
    const content = [
      '{',
      '  "openapi": "3.1.0",',
      '  "info": { "title": "T", "version": "1.0.0" },',
      '  "paths": {',
      '    "/pets": {',
      '      "get": {',
      '        ',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const document = makeDocument(content, 'json');
    const offset = content.indexOf('        \n') + 8;
    expect(labels(await complete(document, offset))).toEqual(expect.arrayContaining(['operationId', 'responses']));
  });
});

describe('OpenApiCompletionProvider — value completion', () => {
  it('suggests parameter locations after `in:`', async () => {
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
      '          in: query',
      '          required: true',
    ].join('\n');
    const document = makeDocument(content);
    const offset = content.indexOf('in: query') + 'in: '.length;
    expect(labels(await complete(document, offset))).toEqual(['query', 'header', 'path', 'cookie']);
  });

  it('suggests existing component schemas for a $ref, section-restricted', async () => {
    const content = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths: {}',
      'components:',
      '  schemas:',
      '    Pet:',
      '      type: object',
      '    Owner:',
      '      properties:',
      '        pet:',
      "          $ref: '#/components/schemas/Pet'",
    ].join('\n');
    const document = makeDocument(content);
    const offset = content.lastIndexOf("$ref: '") + 'ref: '.length + 1;
    const items = await complete(document, offset);
    expect(labels(items).sort()).toEqual(['#/components/schemas/Owner', '#/components/schemas/Pet']);
  });
});

describe('OpenApiCompletionProvider — gating', () => {
  const yaml = ['openapi: 3.1.0', 'info:', '  title: T', '  version: 1.0.0', 'paths:', '  /pets:', '    get:', '      '].join('\n');

  it('returns nothing when IntelliSense is disabled', async () => {
    const document = makeDocument(yaml);
    const disabled = fakeContext({ openApiIntelliSenseEnabled: false });
    expect(await complete(document, yaml.length, disabled)).toEqual([]);
  });

  it('returns nothing for non-OpenAPI documents', async () => {
    const document = makeDocument('name: just a yaml file\nvalue: 1\n');
    expect(await complete(document, 5)).toEqual([]);
  });
});
