import * as fs from 'fs';
import * as path from 'path';
import { OpenApiSymbolProvider } from './OpenApiSymbolProvider';
import { clearOpenApiDocumentState } from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

const fixture = (name: string) => fs.readFileSync(
  path.join(__dirname, '../services/openapi/__fixtures__', name),
  'utf8'
);
const token = { isCancellationRequested: false } as unknown as import('vscode').CancellationToken;

describe('OpenApiSymbolProvider', () => {
  const uris: import('vscode').Uri[] = [];
  afterEach(() => {
    for (const uri of uris) clearOpenApiDocumentState(uri);
    uris.length = 0;
  });

  function symbols(name: string) {
    const document = createFakeTextDocument({ content: fixture(name), path: `/${name}` });
    uris.push(document.uri);
    return new OpenApiSymbolProvider().provideDocumentSymbols(document, token);
  }

  it('builds info and path-ordered operation symbols', () => {
    const result = symbols('minimal-3.1.yaml');
    expect(result.map((item) => item.name)).toEqual(['info', 'paths']);
    expect(result[0].detail).toBe('Pets v1.0.0');
    expect(result[1].children[0].name).toBe('/pets');
    expect(result[1].children[0].detail).toBe('1 operation');
    expect(result[1].children[0].children[0]).toMatchObject({
      name: 'GET /pets', detail: 'List pets',
    });
  });

  it('includes fixed query and arbitrary additional operations', () => {
    const result = symbols('additional-operations-3.2.yaml');
    const paths = result.find((item) => item.name === 'paths')!;
    expect(paths.children[0].children.map((item) => item.name)).toEqual([
      'QUERY /search', 'PURGE /search',
    ]);
    const webhooks = result.find((item) => item.name === 'webhooks')!;
    expect(webhooks.children[0].children[0].name).toBe('NOTIFY refresh');
  });

  it('renders all present component sections and webhook operations', () => {
    const components = symbols('components-sections.yaml').find((item) => item.name === 'components')!;
    expect(components.children.map((item) => item.name)).toEqual([
      'schemas', 'responses', 'parameters', 'examples', 'requestBodies',
      'headers', 'securitySchemes', 'links', 'callbacks', 'pathItems',
    ]);

    const webhooks = symbols('webhooks-only.yaml').find((item) => item.name === 'webhooks')!;
    expect(webhooks.children[0].children[0]).toMatchObject({
      name: 'POST petAdded', detail: 'Pet added',
    });
  });

  it('returns no symbols for non-OpenAPI documents or empty sections', () => {
    expect(symbols('not-openapi.yaml')).toEqual([]);
    const result = symbols('webhooks-only.yaml');
    expect(result.some((item) => item.name === 'paths')).toBe(false);
    expect(result.some((item) => item.name === 'components')).toBe(false);
  });

  it('honors cancellation between root sections', () => {
    const document = createFakeTextDocument({ content: fixture('minimal-3.1.yaml'), path: '/cancel.yaml' });
    uris.push(document.uri);
    const result = new OpenApiSymbolProvider().provideDocumentSymbols(
      document,
      { isCancellationRequested: true } as unknown as import('vscode').CancellationToken
    );
    expect(result.map((item) => item.name)).toEqual(['info']);
  });
});
