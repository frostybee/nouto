import {
  getOpenApiMetaSchema,
  openapi30MetaSchema,
  openapi31MetaSchema,
  openapi31MetaSchemaEditor,
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
  });

  it('getOpenApiMetaSchema selects version and variant', () => {
    expect(getOpenApiMetaSchema('3.0')).toBe(openapi30MetaSchema);
    expect(getOpenApiMetaSchema('3.0', 'full')).toBe(openapi30MetaSchema);
    expect(getOpenApiMetaSchema('3.1')).toBe(openapi31MetaSchemaEditor);
    expect(getOpenApiMetaSchema('3.1', 'editor')).toBe(openapi31MetaSchemaEditor);
    expect(getOpenApiMetaSchema('3.1', 'full')).toBe(openapi31MetaSchema);
  });

  it('editor variant contains no dynamic references', () => {
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
    walk(openapi31MetaSchemaEditor);
    expect(dynamicKeys).toEqual([]);
    // The four $dynamicRef occurrences must have been rewritten to static refs
    expect(staticSchemaRefs).toBeGreaterThanOrEqual(4);
    expect((openapi31MetaSchemaEditor as any).$defs.schema).toBeDefined();
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
