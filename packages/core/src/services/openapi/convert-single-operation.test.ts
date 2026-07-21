import { OpenApiImportService } from './OpenApiImportService';
import { OpenApiConversionError } from './types';

describe('convertSingleOperation', () => {
  let service: OpenApiImportService;

  beforeEach(() => {
    service = new OpenApiImportService();
  });

  const spec = {
    openapi: '3.1.0',
    info: { title: 'Try It API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/users/{id}': {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        get: {
          summary: 'Get user',
          operationId: 'getUser',
          parameters: [
            { name: 'verbose', in: 'query', schema: { type: 'boolean', default: false } },
          ],
          responses: { '200': { description: 'OK' } },
        },
        put: {
          summary: 'Update user',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', example: 'Ada' } },
                },
              },
            },
          },
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  };

  it('converts a complete request from path and method', () => {
    const { request, warnings } = service.convertSingleOperation(
      JSON.stringify(spec),
      'json',
      '/users/{id}',
      'GET'
    );

    expect(request.name).toBe('Get user');
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://api.example.com/users/{{id}}');
    expect(request.params).toEqual([
      expect.objectContaining({ key: 'verbose', value: 'false' }),
    ]);
    expect(request.body.type).toBe('none');
    expect(warnings).toEqual([]);
  });

  it('matches the method case-insensitively and converts bodies', () => {
    const { request } = service.convertSingleOperation(
      JSON.stringify(spec),
      'json',
      '/users/{id}',
      'Put'
    );
    expect(request.method).toBe('PUT');
    expect(request.body.type).toBe('json');
    expect(JSON.parse(request.body.content)).toEqual({ name: 'Ada' });
  });

  it('accepts YAML content', () => {
    const yamlSpec = [
      'openapi: "3.1.0"',
      'info: { title: Y, version: "1" }',
      'paths:',
      '  /ping:',
      '    get:',
      '      responses: {}',
    ].join('\n');
    const { request, warnings } = service.convertSingleOperation(yamlSpec, 'yaml', '/ping', 'get');
    expect(request.url).toBe('/ping');
    expect(warnings).toContain(
      'The document declares no servers; the request URL contains only the path.'
    );
  });

  it('throws OpenApiConversionError for unparseable content', () => {
    expect(() => service.convertSingleOperation('{ nope', 'json', '/x', 'get')).toThrow(
      OpenApiConversionError
    );
  });

  it('throws OpenApiConversionError for an unknown path', () => {
    expect(() =>
      service.convertSingleOperation(JSON.stringify(spec), 'json', '/missing', 'get')
    ).toThrow('path "/missing" not found');
  });

  it('throws OpenApiConversionError for an unknown method on a known path', () => {
    expect(() =>
      service.convertSingleOperation(JSON.stringify(spec), 'json', '/users/{id}', 'delete')
    ).toThrow('no "delete" operation');
  });

  it('throws OpenApiConversionError for non-method path item keys', () => {
    expect(() =>
      service.convertSingleOperation(JSON.stringify(spec), 'json', '/users/{id}', 'parameters')
    ).toThrow(OpenApiConversionError);
  });

  it('warns about cookie parameters', () => {
    const cookieSpec = {
      openapi: '3.1.0',
      info: { title: 'C', version: '1' },
      servers: [{ url: 'https://x.example' }],
      paths: {
        '/a': {
          get: {
            parameters: [{ name: 'session', in: 'cookie', schema: { type: 'string' } }],
            responses: {},
          },
        },
      },
    };
    const { warnings } = service.convertSingleOperation(JSON.stringify(cookieSpec), 'json', '/a', 'get');
    expect(warnings.some((w) => w.includes('Cookie parameter "session"'))).toBe(true);
  });

  it('warns about unresolved external references', () => {
    const externalSpec = {
      openapi: '3.1.0',
      info: { title: 'E', version: '1' },
      servers: [{ url: 'https://x.example' }],
      paths: {
        '/a': {
          get: {
            parameters: [{ $ref: './shared.yaml#/components/parameters/P' }],
            responses: {},
          },
        },
      },
    };
    const { warnings } = service.convertSingleOperation(JSON.stringify(externalSpec), 'json', '/a', 'get');
    expect(warnings.some((w) => w.includes('External reference'))).toBe(true);
  });

  it('warns about ambiguous security alternatives', () => {
    const securitySpec = {
      openapi: '3.1.0',
      info: { title: 'S', version: '1' },
      servers: [{ url: 'https://x.example' }],
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
          key: { type: 'apiKey', name: 'X-Key', in: 'header' },
        },
      },
      paths: {
        '/a': {
          get: {
            security: [{ bearer: [] }, { key: [] }],
            responses: {},
          },
        },
      },
    };
    const { request, warnings } = service.convertSingleOperation(
      JSON.stringify(securitySpec),
      'json',
      '/a',
      'get'
    );
    expect(request.auth.type).toBe('bearer');
    expect(warnings.some((w) => w.includes('multiple security alternatives'))).toBe(true);
  });

  it('converts trace operations', () => {
    const traceSpec = {
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://x.example' }],
      paths: { '/a': { trace: { responses: {} } } },
    };
    const { request } = service.convertSingleOperation(JSON.stringify(traceSpec), 'json', '/a', 'trace');
    expect(request.method).toBe('TRACE');
  });

  describe('OpenAPI 3.2', () => {
    const spec32 = {
      openapi: '3.2.0',
      info: { title: 'Q', version: '1' },
      servers: [{ url: 'https://x.example' }],
      paths: {
        '/items': {
          query: {
            summary: 'Query items',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { filter: { type: 'string', example: 'a' } } },
                },
              },
            },
            responses: {},
          },
          additionalOperations: {
            COPY: { summary: 'Copy items', responses: {} },
          },
        },
      },
    };

    it('converts query operations (fixed key in 3.2)', () => {
      const { request, warnings } = service.convertSingleOperation(
        JSON.stringify(spec32),
        'json',
        '/items',
        'query'
      );
      expect(request.method).toBe('QUERY');
      expect(request.name).toBe('Query items');
      expect(request.body.type).toBe('json');
      expect(warnings).toEqual([]);
    });

    it('converts additionalOperations entries by exact method name', () => {
      const { request } = service.convertSingleOperation(JSON.stringify(spec32), 'json', '/items', 'COPY');
      expect(request.method).toBe('COPY');
      expect(request.name).toBe('Copy items');
    });

    it('falls back to the uppercase additionalOperations key', () => {
      const { request } = service.convertSingleOperation(JSON.stringify(spec32), 'json', '/items', 'copy');
      expect(request.method).toBe('COPY');
    });

    it('still throws for methods that exist nowhere', () => {
      expect(() =>
        service.convertSingleOperation(JSON.stringify(spec32), 'json', '/items', 'PURGE')
      ).toThrow(OpenApiConversionError);
    });

    it('imports 3.2 documents including query and additionalOperations', () => {
      const { collection } = service.importFromString(JSON.stringify(spec32), 'json');
      const names = collection.items.map((item) => (item as { name: string }).name).sort();
      expect(names).toEqual(['Copy items', 'Query items']);
    });
  });
});
