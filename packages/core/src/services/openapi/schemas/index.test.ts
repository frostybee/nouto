import {
  getOpenApiMetaSchema,
  openapi30MetaSchema,
  openapi31MetaSchema,
  openapi31MetaSchemaEditor,
  openapi32MetaSchema,
  openapi32MetaSchemaEditor,
  validateOpenApiMetaSchema,
} from './index';

const validDoc31 = {
  openapi: '3.1.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        responses: {
          '200': { description: 'OK' },
        },
      },
    },
  },
};

const validDoc30 = {
  openapi: '3.0.3',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {},
};

describe('vendored OpenAPI meta-schemas', () => {
  it('exposes the expected schema identities', () => {
    expect((openapi30MetaSchema as any).id).toBe('https://spec.openapis.org/oas/3.0/schema/2024-10-18');
    expect((openapi31MetaSchema as any).$id).toBe('https://spec.openapis.org/oas/3.1/schema/2025-09-15');
    expect((openapi32MetaSchema as any).$id).toBe('https://spec.openapis.org/oas/3.2/schema/2025-09-17');
  });

  it('getOpenApiMetaSchema selects version and variant', () => {
    expect(getOpenApiMetaSchema('3.0')).toBe(openapi30MetaSchema);
    expect(getOpenApiMetaSchema('3.0', 'full')).toBe(openapi30MetaSchema);
    expect(getOpenApiMetaSchema('3.1')).toBe(openapi31MetaSchemaEditor);
    expect(getOpenApiMetaSchema('3.1', 'editor')).toBe(openapi31MetaSchemaEditor);
    expect(getOpenApiMetaSchema('3.1', 'full')).toBe(openapi31MetaSchema);
    expect(getOpenApiMetaSchema('3.2')).toBe(openapi32MetaSchemaEditor);
    expect(getOpenApiMetaSchema('3.2', 'full')).toBe(openapi32MetaSchema);
  });

  it.each([
    ['3.1', openapi31MetaSchemaEditor, 4],
    ['3.2', openapi32MetaSchemaEditor, 5],
  ])('%s editor variant contains no dynamic references', (_version, editorSchema, minRefs) => {
    const dynamicKeys: string[] = [];
    let staticSchemaRefs = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === '$dynamicRef' || key === '$dynamicAnchor') dynamicKeys.push(key);
          if (key === '$ref' && value === '#/$defs/schema') staticSchemaRefs++;
          walk(value);
        }
      }
    };
    walk(editorSchema);
    expect(dynamicKeys).toEqual([]);
    // Every $dynamicRef occurrence must have been rewritten to a static ref
    expect(staticSchemaRefs).toBeGreaterThanOrEqual(minRefs);
    expect((editorSchema as any).$defs.schema).toBeDefined();
  });

  it.each([
    ['3.1', openapi31MetaSchema],
    ['3.2', openapi32MetaSchema],
  ])(
    '%s full schema declares exactly one $dynamicAnchor targeted by every $dynamicRef',
    (_version, fullSchema) => {
      // Precondition for the editor variants AND the host-side validator: with
      // a single `$dynamicAnchor: meta`, rewriting `$dynamicRef: "#meta"` to a
      // static `$ref: "#/$defs/schema"` is semantically identical. If a future
      // re-vendored schema adds another anchor or a differently-named ref,
      // that rewrite silently changes meaning — regenerate the editor variants
      // with proper dynamic-scope analysis before shipping it.
      const anchors: string[] = [];
      const refs: string[] = [];
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(walk);
        } else if (node && typeof node === 'object') {
          for (const [key, value] of Object.entries(node)) {
            if (key === '$dynamicAnchor') anchors.push(String(value));
            if (key === '$dynamicRef') refs.push(String(value));
            walk(value);
          }
        }
      };
      walk(fullSchema);
      expect(anchors).toEqual(['meta']);
      expect(refs.length).toBeGreaterThan(0);
      expect(new Set(refs)).toEqual(new Set(['#meta']));
    }
  );

  describe('host-side meta-schema validation (Ajv spike)', () => {
    it('accepts a valid 3.1 document', () => {
      expect(validateOpenApiMetaSchema(validDoc31, '3.1')).toEqual([]);
    });

    // Regression: Ajv (observed through 8.18) mis-evaluates `$dynamicRef: "#meta"`
    // under a parent with `unevaluatedProperties: false`, flagging every Schema
    // Object as "must NOT have unevaluated properties". The validator compiles
    // the static-ref editor variant to avoid this; these documents exercise the
    // media-type/parameter `schema` nodes that trigger the bug.
    it.each(['3.1', '3.2'] as const)(
      '%s accepts Schema Objects in media types, parameters, and components',
      (version) => {
        const doc = {
          openapi: `${version}.0`,
          info: { title: 'T', version: '1' },
          paths: {
            '/pets': {
              put: {
                parameters: [
                  { name: 'verbose', in: 'query', schema: { type: 'boolean' } },
                ],
                requestBody: {
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
                  },
                  required: true,
                },
                responses: {
                  '200': {
                    description: 'OK',
                    content: {
                      'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              Pet: { type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        };
        expect(validateOpenApiMetaSchema(doc, version)).toEqual([]);
      }
    );

    it('rejects an invalid 3.1 document', () => {
      const diagnostics = validateOpenApiMetaSchema({ openapi: '3.1.0' }, '3.1');
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].source).toBe('schema');
      expect(diagnostics[0].severity).toBe('error');
    });

    it('rejects a 3.1 document with a malformed nested object', () => {
      const doc = {
        ...validDoc31,
        paths: { '/users': { get: { responses: { '200': { notDescription: true } } } } },
      };
      expect(validateOpenApiMetaSchema(doc, '3.1').length).toBeGreaterThan(0);
    });

    it('accepts a valid 3.2 document with query and additionalOperations', () => {
      const doc = {
        openapi: '3.2.0',
        info: { title: 'T', version: '1' },
        paths: {
          '/items': {
            query: { responses: { '200': { description: 'OK' } } },
            additionalOperations: {
              COPY: { responses: { '200': { description: 'OK' } } },
            },
          },
        },
      };
      expect(validateOpenApiMetaSchema(doc, '3.2')).toEqual([]);
    });

    it('rejects a 3.2 additionalOperations entry duplicating a fixed method', () => {
      const doc = {
        openapi: '3.2.0',
        info: { title: 'T', version: '1' },
        paths: {
          '/items': {
            additionalOperations: { GET: { responses: { '200': { description: 'OK' } } } },
          },
        },
      };
      expect(validateOpenApiMetaSchema(doc, '3.2').length).toBeGreaterThan(0);
    });

    it('rejects an invalid 3.2 document', () => {
      expect(validateOpenApiMetaSchema({ openapi: '3.2.0' }, '3.2').length).toBeGreaterThan(0);
    });

    it('accepts a valid 3.0 document (ajv-draft-04 compiles the draft-04 schema)', () => {
      expect(validateOpenApiMetaSchema(validDoc30, '3.0')).toEqual([]);
    });

    it('rejects an invalid 3.0 document', () => {
      const diagnostics = validateOpenApiMetaSchema({ openapi: '3.0.0', info: { title: 'x' } }, '3.0');
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it('caches compiled validators across calls', () => {
      expect(validateOpenApiMetaSchema(validDoc31, '3.1')).toEqual([]);
      expect(validateOpenApiMetaSchema(validDoc31, '3.1')).toEqual([]);
    });
  });

  describe('golden documents (broad feature surface, zero diagnostics)', () => {
    // Guards against whole-document false-positive storms: a realistic spec
    // exercising the areas small synthetic docs skip — media-type schemas,
    // parameters in every location, response headers, callbacks, security,
    // components with references. The Ajv $dynamicRef bug hid here.
    const goldenBase = (version: string) => ({
      openapi: version,
      info: {
        title: 'Golden API',
        version: '2.0.0',
        description: 'Comprehensive fixture',
        termsOfService: 'https://example.com/terms',
        contact: { name: 'Team', email: 'team@example.com', url: 'https://example.com' },
        license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
      },
      externalDocs: { description: 'Docs', url: 'https://example.com/docs' },
      servers: [
        {
          url: 'https://{region}.example.com/{basePath}',
          description: 'Regional server',
          variables: {
            region: { default: 'eu', enum: ['eu', 'us'], description: 'Region' },
            basePath: { default: 'v2' },
          },
        },
      ],
      tags: [
        {
          name: 'pets',
          description: 'Pet operations',
          externalDocs: { url: 'https://example.com/pets' },
        },
      ],
      security: [{ apiKey: [] }],
      paths: {
        '/pets/{petId}': {
          summary: 'Single pet',
          parameters: [
            {
              name: 'petId',
              in: 'path',
              required: true,
              description: 'Pet id',
              schema: { type: 'integer', format: 'int64' },
            },
          ],
          get: {
            tags: ['pets'],
            operationId: 'getPet',
            parameters: [
              { name: 'verbose', in: 'query', schema: { type: 'boolean' }, example: true },
              { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
              { name: 'session', in: 'cookie', schema: { type: 'string' } },
              { $ref: '#/components/parameters/PageSize' },
            ],
            responses: {
              '200': {
                description: 'A pet',
                headers: {
                  'X-Rate-Limit': { $ref: '#/components/headers/RateLimit' },
                  'X-Request-Id': { description: 'Trace id', schema: { type: 'string' } },
                },
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Pet' },
                    examples: { sample: { $ref: '#/components/examples/PetExample' } },
                  },
                  'application/xml': { schema: { $ref: '#/components/schemas/Pet' } },
                },
                links: {
                  owner: { operationId: 'getPet', parameters: { petId: '$response.body#/id' } },
                },
              },
              '404': { $ref: '#/components/responses/NotFound' },
              default: { description: 'Unexpected error' },
            },
          },
          put: {
            operationId: 'updatePet',
            security: [{ oauth: ['write:pets'] }],
            requestBody: { $ref: '#/components/requestBodies/PetBody' },
            responses: { '200': { description: 'Updated' } },
          },
          delete: {
            operationId: 'deletePet',
            deprecated: true,
            responses: { '204': { description: 'Deleted' } },
          },
        },
        '/pets': {
          post: {
            operationId: 'createPet',
            requestBody: {
              description: 'New pet',
              required: true,
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: { file: { type: 'string', format: 'binary' } },
                  },
                  encoding: {
                    file: { contentType: 'image/png', headers: { 'X-Part': { schema: { type: 'string' } } } },
                  },
                },
              },
            },
            callbacks: {
              onCreated: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    requestBody: {
                      content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
                      },
                    },
                    responses: { '200': { description: 'Ack' } },
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
      components: {
        schemas: {
          Pet: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'integer', format: 'int64' },
              name: { type: 'string' },
              category: { $ref: '#/components/schemas/Category' },
              status: { type: 'string', enum: ['available', 'pending', 'sold'] },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          Category: { type: 'object', properties: { name: { type: 'string' } } },
        },
        parameters: {
          PageSize: { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
        },
        requestBodies: {
          PetBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
        },
        responses: {
          NotFound: { description: 'Not found' },
        },
        headers: {
          RateLimit: { description: 'Remaining calls', schema: { type: 'integer' } },
        },
        examples: {
          PetExample: { summary: 'A pet', value: { id: 1, name: 'Rex' } },
        },
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-Api-Key', in: 'header' },
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://example.com/auth',
                tokenUrl: 'https://example.com/token',
                scopes: { 'write:pets': 'Modify pets' },
              },
            },
          },
        },
      },
    });

    it('3.0 golden document yields zero diagnostics', () => {
      expect(validateOpenApiMetaSchema(goldenBase('3.0.4'), '3.0')).toEqual([]);
    });

    it('3.1 golden document (with webhooks and license identifier) yields zero diagnostics', () => {
      const doc: any = goldenBase('3.1.0');
      doc.info.license = { name: 'MIT', identifier: 'MIT' };
      doc.webhooks = {
        petUpdated: {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
            responses: { '200': { description: 'Ack' } },
          },
        },
      };
      expect(validateOpenApiMetaSchema(doc, '3.1')).toEqual([]);
    });

    it('3.2 golden document (with query, additionalOperations, itemSchema) yields zero diagnostics', () => {
      const doc: any = goldenBase('3.2.0');
      doc.paths['/pets'].query = {
        operationId: 'queryPets',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: { '200': { description: 'OK' } },
      };
      doc.paths['/pets'].additionalOperations = {
        COPY: { responses: { '200': { description: 'Copied' } } },
      };
      doc.paths['/pets/{petId}'].get.responses['200'].content['application/jsonl'] = {
        itemSchema: { $ref: '#/components/schemas/Pet' },
      };
      expect(validateOpenApiMetaSchema(doc, '3.2')).toEqual([]);
    });
  });
});
