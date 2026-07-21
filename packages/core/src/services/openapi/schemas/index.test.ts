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

  describe('host-side meta-schema validation (Ajv spike)', () => {
    it('accepts a valid 3.1 document (Ajv2020 compiles $dynamicRef/$dynamicAnchor)', () => {
      expect(validateOpenApiMetaSchema(validDoc31, '3.1')).toEqual([]);
    });

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
});
