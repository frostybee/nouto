import * as fs from 'fs';
import * as path from 'path';
import { OpenApiCodeLensProvider } from './OpenApiCodeLensProvider';
import { clearOpenApiDocumentState } from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

const fixture = (name: string) => fs.readFileSync(
  path.join(__dirname, '../services/openapi/__fixtures__', name),
  'utf8'
);
const token = { isCancellationRequested: false } as unknown as import('vscode').CancellationToken;

describe('OpenApiCodeLensProvider', () => {
  const uris: import('vscode').Uri[] = [];

  afterEach(() => {
    for (const uri of uris) clearOpenApiDocumentState(uri);
    uris.length = 0;
  });

  function lenses(
    name: string,
    { languageId = 'yaml', cancellationToken = token } = {}
  ) {
    const document = createFakeTextDocument({
      content: fixture(name),
      path: `/${name}`,
      languageId,
    });
    uris.push(document.uri);
    return new OpenApiCodeLensProvider().provideCodeLenses(document, cancellationToken);
  }

  function payloads(name: string, options?: Parameters<typeof lenses>[1]) {
    return lenses(name, options).map((lens) => lens.command?.arguments?.[0]);
  }

  it('contributes one Try It lens per operation', () => {
    const result = lenses('minimal-3.1.yaml');

    expect(result).toHaveLength(1);
    expect(result[0].command).toMatchObject({
      title: 'Nouto: Try It',
      command: 'nouto.tryOpenApiOperation',
    });
    expect(result[0].command?.arguments?.[0]).toMatchObject({ path: '/pets', method: 'get' });
  });

  it('anchors each lens on its own operation', () => {
    const result = lenses('minimal-3.1.yaml');
    const content = fixture('minimal-3.1.yaml');
    const line = content.split('\n')[result[0].range.start.line];

    expect(line).toContain('get:');
  });

  it('covers 3.2 query and additionalOperations with their declared method names', () => {
    expect(payloads('additional-operations-3.2.yaml')).toEqual([
      { uri: expect.any(String), path: '/search', method: 'query' },
      // Case preserved: additionalOperations keys are matched case-sensitively first.
      { uri: expect.any(String), path: '/search', method: 'PURGE' },
    ]);
  });

  it('excludes webhooks, which have no path to convert against', () => {
    expect(lenses('webhooks-only.yaml')).toEqual([]);
  });

  it('ignores documents that are not OpenAPI specifications', () => {
    expect(lenses('not-openapi.yaml')).toEqual([]);
    expect(lenses('not-openapi.json', { languageId: 'json' })).toEqual([]);
  });

  it('returns nothing for a malformed document', () => {
    expect(lenses('malformed.yaml')).toEqual([]);
  });

  it('stops early when cancelled', () => {
    const cancelled = { isCancellationRequested: true } as unknown as import('vscode').CancellationToken;
    expect(lenses('additional-operations-3.2.yaml', { cancellationToken: cancelled })).toEqual([]);
  });

  it('carries the document URI so the action targets the right document', () => {
    const [payload] = payloads('minimal-3.1.yaml');
    expect(payload.uri).toContain('minimal-3.1.yaml');
  });

  it('works on JSON documents', () => {
    expect(payloads('minimal-3.1.json', { languageId: 'json' })).toEqual([
      { uri: expect.any(String), path: '/pets', method: 'get' },
    ]);
  });
});
