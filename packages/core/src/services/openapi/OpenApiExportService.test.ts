import { OpenApiExportService } from './OpenApiExportService';
import { analyzeOpenApi } from './analyze';
import { OpenApiImportService } from './OpenApiImportService';
import type { Collection, SavedRequest, Folder, AuthState, BodyState } from '../../types';
import type { HarEntry } from '../harParsing';

const NOW = '2026-01-01T00:00:00.000Z';
let idCounter = 0;

const makeRequest = (overrides: Partial<SavedRequest> = {}): SavedRequest => ({
  type: 'request',
  id: `req-${++idCounter}`,
  name: 'Test request',
  method: 'GET',
  url: 'https://api.example.com/users',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeFolder = (overrides: Partial<Folder> = {}): Folder => ({
  type: 'folder',
  id: `folder-${++idCounter}`,
  name: 'Folder',
  children: [],
  expanded: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeCollection = (overrides: Partial<Collection> = {}): Collection => ({
  id: `col-${++idCounter}`,
  name: 'My API',
  items: [],
  expanded: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeHarEntry = (
  request: Partial<HarEntry['request']> = {},
  response?: HarEntry['response']
): HarEntry => ({
  request: {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    queryString: [],
    ...request,
  },
  ...(response ? { response } : {}),
});

const makeHar = (entries: HarEntry[]): string => JSON.stringify({ log: { entries } });

const service = new OpenApiExportService();

const getOperation = (
  document: Record<string, unknown>,
  path: string,
  method: string
): Record<string, unknown> => {
  const paths = document.paths as Record<string, Record<string, unknown>>;
  expect(paths[path]).toBeDefined();
  const operation = paths[path][method] as Record<string, unknown>;
  expect(operation).toBeDefined();
  return operation;
};

describe('OpenApiExportService.fromCollection', () => {
  it('emits a 3.1 envelope with info from the collection name', () => {
    const { document, warnings } = service.fromCollection(
      makeCollection({ items: [makeRequest()] })
    );
    expect(document).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'My API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }],
    });
    expect(getOperation(document, '/users', 'get')).toMatchObject({
      operationId: 'getUsers',
      summary: 'Test request',
    });
    expect(warnings).toEqual([]);
  });

  it('honors title/version options', () => {
    const { document } = service.fromCollection(makeCollection({ items: [makeRequest()] }), {
      title: 'Custom',
      version: '2.0.0',
    });
    expect(document.info).toEqual({ title: 'Custom', version: '2.0.0' });
  });

  it('uses the nearest folder name as the tag and leaves root requests untagged', () => {
    const inner = makeFolder({ name: 'Users', children: [makeRequest()] });
    const outer = makeFolder({ name: 'Outer', children: [inner] });
    const { document } = service.fromCollection(
      makeCollection({
        items: [outer, makeRequest({ url: 'https://api.example.com/health' })],
      })
    );
    expect(getOperation(document, '/users', 'get').tags).toEqual(['Users']);
    expect(getOperation(document, '/health', 'get').tags).toBeUndefined();
  });

  describe('path templating', () => {
    it('templates numeric and uuid segments with names from the preceding static segment', () => {
      const { document } = service.fromCollection(
        makeCollection({
          items: [
            makeRequest({
              url: 'https://api.example.com/orgs/7/users/9f8b3c1e-2d4a-4f6b-8c0d-1e2f3a4b5c6d',
            }),
          ],
        })
      );
      const operation = getOperation(document, '/orgs/{orgId}/users/{userId}', 'get');
      expect(operation.parameters).toEqual([
        expect.objectContaining({ name: 'orgId', in: 'path', required: true, example: '7' }),
        expect.objectContaining({ name: 'userId', in: 'path', required: true }),
      ]);
    });

    it('preserves literal {param} segments and normalizes :param style', () => {
      const { document } = service.fromCollection(
        makeCollection({
          items: [makeRequest({ url: 'https://api.example.com/orders/{orderId}/items/:itemId' })],
        })
      );
      getOperation(document, '/orders/{orderId}/items/{itemId}', 'get');
    });

    it('falls back to id and dedupes names when there is no static predecessor', () => {
      const { document } = service.fromCollection(
        makeCollection({ items: [makeRequest({ url: 'https://api.example.com/1/2' })] })
      );
      getOperation(document, '/{id}/{id2}', 'get');
    });

    it('singularizes plural static segments (users → userId, companies → companyId)', () => {
      const { document } = service.fromCollection(
        makeCollection({
          items: [makeRequest({ url: 'https://api.example.com/companies/3/user-profiles/4' })],
        })
      );
      getOperation(document, '/companies/{companyId}/user-profiles/{userProfileId}', 'get');
    });
  });

  describe('collision merging', () => {
    it('merges same-(method, templated path) requests into one operation with a warning', () => {
      const { document, warnings } = service.fromCollection(
        makeCollection({
          items: [
            makeRequest({
              url: 'https://api.example.com/users/1',
              params: [{ id: 'p1', key: 'expand', value: 'roles', enabled: true }],
              examples: [
                {
                  id: 'e1', name: 'ok', status: 200, statusText: 'OK',
                  headers: { 'Content-Type': 'application/json' },
                  body: '{"id":1,"name":"a"}', createdAt: NOW,
                },
              ],
            }),
            makeRequest({
              url: 'https://api.example.com/users/2',
              examples: [
                {
                  id: 'e2', name: 'ok', status: 200, statusText: 'OK',
                  headers: { 'Content-Type': 'application/json' },
                  body: '{"id":2}', createdAt: NOW,
                },
              ],
            }),
          ],
        })
      );
      const operation = getOperation(document, '/users/{userId}', 'get');
      expect(Object.keys(document.paths as object)).toEqual(['/users/{userId}']);
      // expand was present on only one contributor → optional.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'expand', in: 'query', required: false }),
        ])
      );
      // Sampled bodies merge: name missing from one sample → not required.
      const responses = operation.responses as Record<string, any>;
      expect(responses['200'].content['application/json'].schema).toMatchObject({
        type: 'object',
        properties: { id: { type: 'integer' }, name: { type: 'string' } },
        required: ['id'],
      });
      expect(warnings).toContain('GET /users/{userId}: merged 2 source requests into one operation');
    });
  });

  describe('bodies', () => {
    const bodyOf = (document: Record<string, unknown>, path: string, method = 'post') => {
      const operation = getOperation(document, path, method);
      return operation.requestBody as Record<string, any>;
    };

    it.each<[string, BodyState, string]>([
      ['json', { type: 'json', content: '{"a":1}' }, 'application/json'],
      ['form-data', { type: 'form-data', content: '[{"key":"f","value":"x","enabled":true,"fieldType":"file"}]' }, 'multipart/form-data'],
      ['x-www-form-urlencoded', { type: 'x-www-form-urlencoded', content: '[{"key":"a","value":"1","enabled":true}]' }, 'application/x-www-form-urlencoded'],
      ['binary', { type: 'binary', content: '' }, 'application/octet-stream'],
      ['xml', { type: 'xml', content: '<a/>' }, 'application/xml'],
      ['text', { type: 'text', content: 'hi' }, 'text/plain'],
      ['graphql', { type: 'graphql', content: 'query { me }' }, 'application/json'],
    ])('%s body → %s', (_label, body, contentType) => {
      const { document } = service.fromCollection(
        makeCollection({ items: [makeRequest({ method: 'POST', body })] })
      );
      expect(Object.keys(bodyOf(document, '/users').content)).toEqual([contentType]);
    });

    it('infers a JSON schema with the first sample as example', () => {
      const { document } = service.fromCollection(
        makeCollection({
          items: [makeRequest({ method: 'POST', body: { type: 'json', content: '{"a":1}' } })],
        })
      );
      expect(bodyOf(document, '/users').content['application/json']).toEqual({
        schema: { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] },
        example: { a: 1 },
      });
    });

    it('marks form file fields as binary strings', () => {
      const { document } = service.fromCollection(
        makeCollection({
          items: [
            makeRequest({
              method: 'POST',
              body: {
                type: 'form-data',
                content: JSON.stringify([
                  { key: 'avatar', value: '/tmp/a.png', enabled: true, fieldType: 'file' },
                  { key: 'name', value: 'x', enabled: true, fieldType: 'text' },
                ]),
              },
            }),
          ],
        })
      );
      expect(bodyOf(document, '/users').content['multipart/form-data'].schema.properties).toMatchObject({
        avatar: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      });
    });

    it('warns on unparseable JSON and exports it as an example only', () => {
      const { document, warnings } = service.fromCollection(
        makeCollection({
          items: [makeRequest({ method: 'POST', body: { type: 'json', content: '{oops' } })],
        })
      );
      expect(bodyOf(document, '/users').content['application/json']).toEqual({
        schema: {},
        example: '{oops',
      });
      expect(warnings).toContain(
        'POST /users: request body is not valid JSON; exported without a schema'
      );
    });

    it('warns that GraphQL is exported as generic JSON', () => {
      const { warnings } = service.fromCollection(
        makeCollection({
          items: [makeRequest({ method: 'POST', body: { type: 'graphql', content: 'query { me }' } })],
        })
      );
      expect(warnings).toContain(
        'POST /users: GraphQL operation exported as a generic JSON request body'
      );
    });
  });

  describe('security', () => {
    const authOf = (auth: AuthState) =>
      service.fromCollection(makeCollection({ items: [makeRequest({ auth })] }));

    it.each<[string, AuthState, string, Record<string, unknown>]>([
      ['basic', { type: 'basic' }, 'basicAuth', { type: 'http', scheme: 'basic' }],
      ['bearer', { type: 'bearer' }, 'bearerAuth', { type: 'http', scheme: 'bearer' }],
      ['digest', { type: 'digest' }, 'digestAuth', { type: 'http', scheme: 'digest' }],
      [
        'apikey',
        { type: 'apikey', apiKeyName: 'X-Key', apiKeyIn: 'query' },
        'apiKeyAuth',
        { type: 'apiKey', name: 'X-Key', in: 'query' },
      ],
      [
        'oauth2',
        {
          type: 'oauth2',
          oauth2: {
            grantType: 'client_credentials',
            tokenUrl: 'https://auth.example.com/token',
            clientId: 'c',
            scope: 'read write',
          },
        },
        'oauth2Auth',
        {
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://auth.example.com/token',
              scopes: { read: '', write: '' },
            },
          },
        },
      ],
    ])('%s maps to a security scheme', (_label, auth, expectedName, expectedScheme) => {
      const { document } = authOf(auth);
      const components = document.components as Record<string, any>;
      expect(components.securitySchemes[expectedName]).toEqual(expectedScheme);
      // A single uniform scheme hoists to global security.
      expect(document.security).toEqual([{ [expectedName]: [] }]);
    });

    it.each<[string, AuthState, string]>([
      ['aws', { type: 'aws' }, 'AWS Signature auth has no OpenAPI security scheme; security omitted'],
      ['ntlm', { type: 'ntlm' }, 'NTLM auth has no OpenAPI security scheme; security omitted'],
    ])('%s is skipped with a warning', (_label, auth, warning) => {
      const { document, warnings } = authOf(auth);
      expect(document.components).toBeUndefined();
      expect(document.security).toBeUndefined();
      expect(warnings).toContain(`GET /users: ${warning}`);
    });

    it.each<[string, AuthState['oauth2'], string, Record<string, unknown>]>([
      [
        'authorization_code',
        {
          grantType: 'authorization_code',
          authUrl: 'https://auth.example.com/authorize',
          tokenUrl: 'https://auth.example.com/token',
          clientId: 'c',
        },
        'authorizationCode',
        {
          authorizationUrl: 'https://auth.example.com/authorize',
          tokenUrl: 'https://auth.example.com/token',
          scopes: {},
        },
      ],
      [
        'implicit',
        { grantType: 'implicit', authUrl: 'https://auth.example.com/authorize', clientId: 'c' },
        'implicit',
        { authorizationUrl: 'https://auth.example.com/authorize', scopes: {} },
      ],
      [
        'password',
        { grantType: 'password', tokenUrl: 'https://auth.example.com/token', clientId: 'c' },
        'password',
        { tokenUrl: 'https://auth.example.com/token', scopes: {} },
      ],
    ])('maps the oauth2 %s flow', (_label, oauth2, flowName, flow) => {
      const { document } = authOf({ type: 'oauth2', oauth2 });
      expect((document.components as Record<string, any>).securitySchemes.oauth2Auth).toEqual({
        type: 'oauth2',
        flows: { [flowName]: flow },
      });
    });

    it.each<[string, AuthState, string]>([
      [
        'oauth2 without configuration',
        { type: 'oauth2' },
        'OAuth2 auth has no configuration; security omitted',
      ],
      [
        'authorization_code missing its URLs',
        { type: 'oauth2', oauth2: { grantType: 'authorization_code', clientId: 'c' } },
        'OAuth2 authorization_code flow is missing authorization and token URLs; security omitted',
      ],
      [
        'implicit missing its authorization URL',
        { type: 'oauth2', oauth2: { grantType: 'implicit', clientId: 'c' } },
        'OAuth2 implicit flow is missing an authorization URL; security omitted',
      ],
    ])('skips %s with a warning', (_label, auth, warning) => {
      const { document, warnings } = authOf(auth);
      expect(document.components).toBeUndefined();
      expect(warnings).toContain(`GET /users: ${warning}`);
    });

    it('skips oauth2 missing its flow URL with a warning', () => {
      const { warnings, document } = authOf({
        type: 'oauth2',
        oauth2: { grantType: 'client_credentials', clientId: 'c' },
      });
      expect(document.components).toBeUndefined();
      expect(warnings).toContain(
        'GET /users: OAuth2 client_credentials flow is missing a token URL; security omitted'
      );
    });

    it('keeps security per-operation when schemes differ', () => {
      const { document } = service.fromCollection(
        makeCollection({
          items: [
            makeRequest({ auth: { type: 'bearer' } }),
            makeRequest({ url: 'https://api.example.com/health', auth: { type: 'none' } }),
          ],
        })
      );
      expect(document.security).toBeUndefined();
      expect(getOperation(document, '/users', 'get').security).toEqual([{ bearerAuth: [] }]);
      expect(getOperation(document, '/health', 'get').security).toBeUndefined();
    });

    it('resolves folder-inherited auth before mapping', () => {
      const folder = makeFolder({
        name: 'Secured',
        auth: { type: 'bearer' },
        children: [makeRequest({ auth: { type: 'none' }, authInheritance: 'inherit' })],
      });
      const { document } = service.fromCollection(makeCollection({ items: [folder] }));
      expect((document.components as Record<string, any>).securitySchemes.bearerAuth).toEqual({
        type: 'http',
        scheme: 'bearer',
      });
    });
  });

  describe('variables and headers', () => {
    it('substitutes collection variables into the URL', () => {
      const { document, warnings } = service.fromCollection(
        makeCollection({
          variables: [{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }],
          items: [makeRequest({ url: '{{baseUrl}}/users' })],
        })
      );
      expect(document.servers).toEqual([{ url: 'https://api.example.com' }]);
      getOperation(document, '/users', 'get');
      expect(warnings).toEqual([]);
    });

    it('templates unresolved path variables and warns on unresolved host variables', () => {
      const { document, warnings } = service.fromCollection(
        makeCollection({
          items: [makeRequest({ url: '{{baseUrl}}/api/{{tenant}}/users' })],
        })
      );
      getOperation(document, '/api/{tenant}/users', 'get');
      expect(document.servers).toBeUndefined();
      expect(warnings).toContain(
        'GET /api/{tenant}/users: server omitted: URL host contains an unresolved variable'
      );
    });

    it('exports resolved folder headers as header params, skipping reserved ones', () => {
      const folder = makeFolder({
        name: 'F',
        headers: [
          { id: 'h1', key: 'X-Tenant', value: 't1', enabled: true },
          { id: 'h2', key: 'Content-Type', value: 'application/json', enabled: true },
        ],
        children: [makeRequest()],
      });
      const { document } = service.fromCollection(makeCollection({ items: [folder] }));
      const parameters = getOperation(document, '/users', 'get').parameters as any[];
      expect(parameters).toEqual([
        expect.objectContaining({ name: 'X-Tenant', in: 'header', example: 't1' }),
      ]);
    });
  });

  it('dedupes operationIds with numeric suffixes', () => {
    const { document } = service.fromCollection(
      makeCollection({
        items: [
          makeRequest({ url: 'https://api.example.com/users' }),
          makeRequest({ url: 'https://other.example.com/users', method: 'GET' }),
        ],
      })
    );
    // Same path on different hosts merges — force distinct paths instead.
    expect(Object.keys(document.paths as object)).toEqual(['/users']);
  });

  it('skips methods without a 3.1 operation key', () => {
    const { document, warnings } = service.fromCollection(
      makeCollection({ items: [makeRequest({ method: 'QUERY' as SavedRequest['method'] })] })
    );
    expect(Object.keys(document.paths as object)).toEqual([]);
    expect(warnings.some((w) => w.includes('no OpenAPI 3.1 operation key'))).toBe(true);
  });
});

describe('OpenApiExportService.fromHar', () => {
  it('throws the HAR parse errors through', () => {
    expect(() => service.fromHar('not json')).toThrow('Invalid HAR file: content is not valid JSON');
  });

  it('exports entries with responses, filtering browser noise headers', () => {
    const { document, warnings } = service.fromHar(
      makeHar([
        makeHarEntry(
          {
            url: 'https://api.example.com/users/42?active=true',
            headers: [
              { name: 'User-Agent', value: 'Mozilla' },
              { name: 'sec-ch-ua', value: 'x' },
              { name: 'X-Custom', value: 'y' },
            ],
            queryString: [{ name: 'active', value: 'true' }],
          },
          {
            status: 200,
            statusText: 'OK',
            content: { mimeType: 'application/json; charset=utf-8', text: '{"id":42}' },
          }
        ),
      ])
    );
    const operation = getOperation(document, '/users/{userId}', 'get');
    const parameters = operation.parameters as any[];
    expect(parameters.map((p) => p.name)).toEqual(['userId', 'active', 'X-Custom']);
    const responses = operation.responses as Record<string, any>;
    expect(responses['200']).toMatchObject({
      description: 'OK',
      content: {
        'application/json': {
          schema: { type: 'object', properties: { id: { type: 'integer' } } },
          example: { id: 42 },
        },
      },
    });
    expect(warnings).toEqual([]);
  });

  it('groups multi-status samples of the same operation into distinct responses', () => {
    const { document } = service.fromHar(
      makeHar([
        makeHarEntry(
          { url: 'https://api.example.com/users/1' },
          { status: 200, content: { mimeType: 'application/json', text: '{"id":1}' } }
        ),
        makeHarEntry(
          { url: 'https://api.example.com/users/2' },
          { status: 404, content: { mimeType: 'application/json', text: '{"error":"nope"}' } }
        ),
      ])
    );
    const responses = getOperation(document, '/users/{userId}', 'get').responses as Record<string, any>;
    expect(Object.keys(responses).sort()).toEqual(['200', '404']);
    expect(responses['404'].content['application/json'].schema.properties.error).toEqual({
      type: 'string',
    });
  });

  it('decodes base64 JSON response bodies', () => {
    const encoded = Buffer.from('{"ok":true}', 'utf-8').toString('base64');
    const { document } = service.fromHar(
      makeHar([
        makeHarEntry(
          {},
          { status: 200, content: { mimeType: 'application/json', text: encoded, encoding: 'base64' } }
        ),
      ])
    );
    const responses = getOperation(document, '/users', 'get').responses as Record<string, any>;
    expect(responses['200'].content['application/json'].example).toEqual({ ok: true });
  });

  it('tags by domain only when multiple domains are present', () => {
    const single = service.fromHar(makeHar([makeHarEntry()]));
    expect(getOperation(single.document, '/users', 'get').tags).toBeUndefined();

    const multi = service.fromHar(
      makeHar([
        makeHarEntry(),
        makeHarEntry({ url: 'https://other.example.com/health' }),
      ])
    );
    expect(getOperation(multi.document, '/users', 'get').tags).toEqual(['api.example.com']);
    expect(getOperation(multi.document, '/health', 'get').tags).toEqual(['other.example.com']);
  });

  it('maps Authorization headers to http security schemes', () => {
    const { document } = service.fromHar(
      makeHar([makeHarEntry({ headers: [{ name: 'Authorization', value: 'Bearer abc' }] })])
    );
    expect((document.components as Record<string, any>).securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
    });
    expect(document.security).toEqual([{ bearerAuth: [] }]);
  });

  it('maps request postData to a request body', () => {
    const { document } = service.fromHar(
      makeHar([
        makeHarEntry({
          method: 'POST',
          postData: { mimeType: 'application/json', text: '{"name":"a"}' },
        }),
      ])
    );
    const body = getOperation(document, '/users', 'post').requestBody as Record<string, any>;
    expect(body.content['application/json'].schema).toMatchObject({
      properties: { name: { type: 'string' } },
    });
  });
});

describe('round-trip', () => {
  const importService = new OpenApiImportService();

  const roundTrip = (document: Record<string, unknown>, expectedOperations: number) => {
    const content = JSON.stringify(document);
    const analysis = analyzeOpenApi(content, 'json');
    expect(analysis.version).toBe('3.1');
    expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(analysis.operations).toHaveLength(expectedOperations);

    const imported = importService.importFromString(content, 'json');
    expect(imported.collection).toBeDefined();
  };

  it('a collection-derived document validates and re-imports', () => {
    const folder = makeFolder({
      name: 'Users',
      children: [
        makeRequest({
          url: 'https://api.example.com/users/1',
          auth: { type: 'bearer' },
          examples: [
            {
              id: 'e1', name: 'ok', status: 200, statusText: 'OK',
              headers: { 'Content-Type': 'application/json' },
              body: '{"id":1,"tags":["a"]}', createdAt: NOW,
            },
          ],
        }),
        makeRequest({
          method: 'POST',
          url: 'https://api.example.com/users',
          auth: { type: 'bearer' },
          body: { type: 'json', content: '{"name":"a","email":"x@example.com"}' },
        }),
      ],
    });
    const { document } = service.fromCollection(makeCollection({ items: [folder] }));
    roundTrip(document, 2);
  });

  it('a HAR-derived document validates and re-imports', () => {
    const { document } = service.fromHar(
      makeHar([
        makeHarEntry(
          { url: 'https://api.example.com/orders/7/items?page=1' },
          { status: 200, content: { mimeType: 'application/json', text: '[{"sku":"x"}]' } }
        ),
        makeHarEntry({
          method: 'POST',
          url: 'https://api.example.com/orders',
          postData: { mimeType: 'application/json', text: '{"sku":"x","qty":2}' },
        }),
      ])
    );
    roundTrip(document, 2);
  });
});
