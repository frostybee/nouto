import * as vscode from 'vscode';
import { OpenApiHoverProvider } from './OpenApiHoverProvider';
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
function makeDocument(content: string): vscode.TextDocument {
  docId += 1;
  const document = createFakeTextDocument({ content, languageId: 'yaml', path: `/hover-${docId}.yaml` });
  clearOpenApiDocumentState(document.uri);
  return document;
}

const SPEC = [
  'openapi: 3.1.0',
  'info:',
  '  title: T',
  '  version: 1.0.0',
  'paths:',
  '  /pets:',
  '    get:',
  '      operationId: listPets',
  '      responses:',
  "        '200':",
  '          description: OK',
].join('\n');

function hover(document: vscode.TextDocument, offset: number, context = fakeContext()): vscode.Hover | undefined {
  const provider = new OpenApiHoverProvider(context);
  return provider.provideHover(document, document.positionAt(offset), token);
}

function text(result: vscode.Hover | undefined): string {
  const first = result?.contents[0];
  if (!first) return '';
  return typeof first === 'string' ? first : first.value;
}

describe('OpenApiHoverProvider', () => {
  it('documents a property key', () => {
    const document = makeDocument(SPEC);
    const offset = SPEC.indexOf('operationId') + 2;
    expect(text(hover(document, offset))).toMatch(/identify the operation/i);
  });

  it('returns nothing when hovering a value', () => {
    const document = makeDocument(SPEC);
    const offset = SPEC.indexOf('listPets') + 2;
    expect(hover(document, offset)).toBeUndefined();
  });

  it('returns nothing for an unknown property key', () => {
    const content = SPEC + '\n      x-internal: true';
    const document = makeDocument(content);
    const offset = content.indexOf('x-internal') + 2;
    expect(hover(document, offset)).toBeUndefined();
  });

  it('returns nothing when IntelliSense is disabled', () => {
    const document = makeDocument(SPEC);
    const offset = SPEC.indexOf('operationId') + 2;
    expect(hover(document, offset, fakeContext({ openApiIntelliSenseEnabled: false }))).toBeUndefined();
  });
});
