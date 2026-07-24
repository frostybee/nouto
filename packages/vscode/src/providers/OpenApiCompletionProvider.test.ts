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

function complete(
  document: vscode.TextDocument,
  offset: number,
  context = fakeContext()
): vscode.CompletionItem[] {
  const provider = new OpenApiCompletionProvider(context);
  return provider.provideCompletionItems(document, document.positionAt(offset), token) as vscode.CompletionItem[];
}

function labels(items: vscode.CompletionItem[]): string[] {
  return items.map((item) => item.label as string);
}

describe('OpenApiCompletionProvider — key completion', () => {
  it('suggests Operation properties on a blank line under a method', () => {
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
    const items = complete(document, content.length);
    expect(labels(items)).toEqual(expect.arrayContaining(['operationId', 'summary', 'responses', 'parameters']));
  });

  it('suggests root-level properties and gates them by version', () => {
    const base = ['openapi: 3.0.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const document = makeDocument(base);
    const items = complete(document, base.length);
    expect(labels(items)).toEqual(expect.arrayContaining(['paths', 'components', 'servers']));
    expect(labels(items)).not.toContain('webhooks'); // 3.1+ only
  });

  it('suggests webhooks at the root of a 3.1 document', () => {
    const base = ['openapi: 3.1.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const document = makeDocument(base);
    expect(labels(complete(document, base.length))).toContain('webhooks');
  });

  it('scaffolds the required child key when completing a container property', () => {
    const base = ['openapi: 3.1.0', 'info:', '  title: T', '  version: 1.0.0', ''].join('\n');
    const document = makeDocument(base);
    const servers = complete(document, base.length).find((item) => item.label === 'servers');
    const snippet = servers?.insertText as vscode.SnippetString;
    expect(snippet.value).toBe('servers:\n  - url: $1');
  });

  it('completes keys in JSON documents', () => {
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
    expect(labels(complete(document, offset))).toEqual(expect.arrayContaining(['operationId', 'responses']));
  });
});

describe('OpenApiCompletionProvider — value completion', () => {
  it('suggests parameter locations after `in:`', () => {
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
    expect(labels(complete(document, offset))).toEqual(['query', 'header', 'path', 'cookie']);
  });

  it('suggests existing component schemas for a $ref, section-restricted', () => {
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
    const items = complete(document, offset);
    expect(labels(items).sort()).toEqual(['#/components/schemas/Owner', '#/components/schemas/Pet']);
  });
});

describe('OpenApiCompletionProvider — gating', () => {
  const yaml = ['openapi: 3.1.0', 'info:', '  title: T', '  version: 1.0.0', 'paths:', '  /pets:', '    get:', '      '].join('\n');

  it('returns nothing when IntelliSense is disabled', () => {
    const document = makeDocument(yaml);
    const disabled = fakeContext({ openApiIntelliSenseEnabled: false });
    expect(complete(document, yaml.length, disabled)).toEqual([]);
  });

  it('returns nothing for non-OpenAPI documents', () => {
    const document = makeDocument('name: just a yaml file\nvalue: 1\n');
    expect(complete(document, 5)).toEqual([]);
  });
});
