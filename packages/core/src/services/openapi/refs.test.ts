import { isRefNode, resolveNode, scanReferences } from './refs';

describe('OpenAPI reference resolution', () => {
  describe('isRefNode', () => {
    it('detects reference objects', () => {
      expect(isRefNode({ $ref: '#/a' })).toBe(true);
      expect(isRefNode({ $ref: '#/a', description: 'x' })).toBe(true);
    });

    it('rejects non-references', () => {
      expect(isRefNode({})).toBe(false);
      expect(isRefNode({ $ref: 42 })).toBe(false);
      expect(isRefNode(null)).toBe(false);
      expect(isRefNode('x')).toBe(false);
      expect(isRefNode([{ $ref: '#/a' }])).toBe(false);
    });
  });

  describe('resolveNode', () => {
    const spec = {
      components: {
        schemas: {
          User: { type: 'object', properties: { name: { type: 'string' } } },
          Account: { $ref: '#/components/schemas/User' },
          Chain: { $ref: '#/components/schemas/Account' },
          SelfLoop: { $ref: '#/components/schemas/SelfLoop' },
          CycleA: { $ref: '#/components/schemas/CycleB' },
          CycleB: { $ref: '#/components/schemas/CycleA' },
          Long1: { $ref: '#/components/schemas/Long2' },
          Long2: { $ref: '#/components/schemas/Long3' },
          Long3: { $ref: '#/components/schemas/Long1' },
          'weird/name~x': { type: 'integer' },
        },
      },
    };

    it('passes through non-reference nodes without diagnostics', () => {
      const node = { type: 'string' };
      expect(resolveNode(node, spec)).toEqual({ value: node, diagnostics: [] });
      expect(resolveNode(null, spec)).toEqual({ value: null, diagnostics: [] });
    });

    it('resolves a direct internal reference', () => {
      const { value, diagnostics } = resolveNode({ $ref: '#/components/schemas/User' }, spec);
      expect(diagnostics).toEqual([]);
      expect(value).toBe(spec.components.schemas.User);
    });

    it('follows chains of references', () => {
      const { value, diagnostics } = resolveNode({ $ref: '#/components/schemas/Chain' }, spec);
      expect(diagnostics).toEqual([]);
      expect(value).toBe(spec.components.schemas.User);
    });

    it('resolves references whose target keys need RFC 6901 escaping', () => {
      const { value, diagnostics } = resolveNode(
        { $ref: '#/components/schemas/weird~1name~0x' },
        spec
      );
      expect(diagnostics).toEqual([]);
      expect(value).toEqual({ type: 'integer' });
    });

    it('reports missing targets and returns the original node', () => {
      const node = { $ref: '#/components/schemas/Nope' };
      const { value, diagnostics } = resolveNode(node, spec, '/paths/~1x/get/schema/$ref');
      expect(value).toBe(node);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        source: 'reference',
        severity: 'error',
        pointer: '/paths/~1x/get/schema/$ref',
      });
      expect(diagnostics[0].message).toContain('#/components/schemas/Nope');
    });

    it('reports external references as unsupported warnings', () => {
      const node = { $ref: './other.yaml#/components/schemas/User' };
      const { value, diagnostics } = resolveNode(node, spec);
      expect(value).toBe(node);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ source: 'reference', severity: 'warning' });
      expect(diagnostics[0].message).toContain('not supported');
    });

    it('detects self-references', () => {
      const node = { $ref: '#/components/schemas/SelfLoop' };
      const { value, diagnostics } = resolveNode(node, spec);
      expect(value).toBe(node);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Circular reference');
    });

    it('detects 2-node cycles', () => {
      const { value, diagnostics } = resolveNode({ $ref: '#/components/schemas/CycleA' }, spec);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ source: 'reference', severity: 'error' });
      expect((value as { $ref: string }).$ref).toBe('#/components/schemas/CycleA');
    });

    it('detects 3-node cycles', () => {
      const { diagnostics } = resolveNode({ $ref: '#/components/schemas/Long1' }, spec);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Circular reference');
    });
  });

  describe('scanReferences', () => {
    it('returns no diagnostics for a document with valid references', () => {
      const spec = {
        paths: {
          '/users': {
            get: {
              parameters: [{ $ref: '#/components/parameters/Limit' }],
            },
          },
        },
        components: {
          parameters: { Limit: { name: 'limit', in: 'query' } },
        },
      };
      const { diagnostics, resolvedRefs } = scanReferences(spec);
      expect(diagnostics).toEqual([]);
      expect(resolvedRefs.get('#/components/parameters/Limit')).toBe(
        spec.components.parameters.Limit
      );
    });

    it('anchors diagnostics at the $ref location with escaped path segments', () => {
      const spec = {
        paths: {
          '/users/{id}': {
            get: { requestBody: { $ref: '#/components/requestBodies/Nope' } },
          },
        },
      };
      const { diagnostics } = scanReferences(spec);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].pointer).toBe('/paths/~1users~1{id}/get/requestBody/$ref');
    });

    it('reports each distinct broken reference once', () => {
      const spec = {
        paths: {
          '/a': { get: { schema: { $ref: '#/missing' } } },
          '/b': { get: { schema: { $ref: '#/missing' } } },
          '/c': { get: { schema: { $ref: '#/alsoMissing' } } },
        },
      };
      const { diagnostics } = scanReferences(spec);
      expect(diagnostics).toHaveLength(2);
    });

    it('collects external and cyclic diagnostics from a mixed document', () => {
      const spec = {
        components: {
          schemas: {
            A: { $ref: '#/components/schemas/B' },
            B: { $ref: '#/components/schemas/A' },
            External: { $ref: 'https://example.com/schema.json' },
          },
        },
      };
      const { diagnostics, resolvedRefs } = scanReferences(spec);
      const severities = diagnostics.map((d) => d.severity).sort();
      expect(severities).toEqual(['error', 'error', 'warning']);
      expect(resolvedRefs.size).toBe(0);
    });

    it('does not descend into reference-object siblings', () => {
      const spec = {
        components: {
          schemas: {
            Target: { type: 'object' },
            Weird: { $ref: '#/components/schemas/Target', nested: { $ref: '#/missing' } },
          },
        },
      };
      // The nested broken ref sits inside a Reference Object; v1 deliberately
      // validates only the reference itself.
      const { diagnostics } = scanReferences(spec);
      expect(diagnostics).toEqual([]);
    });
  });
});
