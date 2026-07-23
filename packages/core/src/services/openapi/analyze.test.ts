import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeOpenApi, detectOpenApiVersion, listOpenApiOperations } from './analyze';
import type { OpenApiDiagnostic } from './types';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
}

function bySource(diagnostics: OpenApiDiagnostic[], source: OpenApiDiagnostic['source']) {
  return diagnostics.filter((d) => d.source === source);
}

describe('detectOpenApiVersion', () => {
  it('recognizes 3.0.x, 3.1.x, and 3.2.x patch versions', () => {
    expect(detectOpenApiVersion('3.0.0')).toBe('3.0');
    expect(detectOpenApiVersion('3.0.3')).toBe('3.0');
    expect(detectOpenApiVersion('3.0.17')).toBe('3.0');
    expect(detectOpenApiVersion('3.1.0')).toBe('3.1');
    expect(detectOpenApiVersion('3.1.12')).toBe('3.1');
    expect(detectOpenApiVersion('3.1.0-rc1')).toBe('3.1');
    expect(detectOpenApiVersion('3.2.0')).toBe('3.2');
    expect(detectOpenApiVersion('3.2.5')).toBe('3.2');
  });

  it('rejects everything else', () => {
    expect(detectOpenApiVersion('2.0')).toBeUndefined();
    expect(detectOpenApiVersion('3.3.0')).toBeUndefined();
    expect(detectOpenApiVersion('3.0')).toBeUndefined();
    expect(detectOpenApiVersion(3.1)).toBeUndefined();
    expect(detectOpenApiVersion(undefined)).toBeUndefined();
  });
});

describe('analyzeOpenApi', () => {
  it('analyzes minimal 3.0 YAML and JSON fixtures identically', () => {
    const fromYaml = analyzeOpenApi(fixture('minimal-3.0.yaml'), 'yaml');
    const fromJson = analyzeOpenApi(fixture('minimal-3.0.json'), 'json');

    for (const analysis of [fromYaml, fromJson]) {
      expect(analysis.version).toBe('3.0');
      expect(analysis.parsedSpec).toBeDefined();
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.operations).toHaveLength(2);
    }
    expect(fromYaml.operations).toEqual(fromJson.operations);
  });

  it('analyzes minimal 3.1 YAML and JSON fixtures', () => {
    const fromYaml = analyzeOpenApi(fixture('minimal-3.1.yaml'), 'yaml');
    const fromJson = analyzeOpenApi(fixture('minimal-3.1.json'), 'json');
    for (const analysis of [fromYaml, fromJson]) {
      expect(analysis.version).toBe('3.1');
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.operations).toEqual([
        expect.objectContaining({ path: '/ping', method: 'get', operationId: 'ping' }),
      ]);
    }
  });

  it('analyzes a 3.2 document with query and additionalOperations', () => {
    const analysis = analyzeOpenApi(fixture('minimal-3.2.yaml'), 'yaml');
    expect(analysis.version).toBe('3.2');
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.operations).toEqual([
      expect.objectContaining({ path: '/items', method: 'get', operationId: 'listItems', pointer: '/paths/~1items/get' }),
      expect.objectContaining({ path: '/items', method: 'query', operationId: 'queryItems', pointer: '/paths/~1items/query' }),
      expect.objectContaining({
        path: '/items',
        method: 'COPY',
        operationId: 'copyItems',
        pointer: '/paths/~1items/additionalOperations/COPY',
      }),
    ]);
  });

  it('diagnoses additionalOperations entries that duplicate fixed methods', () => {
    const analysis = analyzeOpenApi(
      JSON.stringify({
        openapi: '3.2.0',
        info: { title: 'X', version: '1' },
        paths: {
          '/a': {
            additionalOperations: {
              GET: { responses: {} },
              QUERY: { responses: {} },
              COPY: { responses: {} },
            },
          },
        },
      }),
      'json'
    );
    const collisions = analysis.diagnostics.filter((d) =>
      d.message.includes('must not duplicate')
    );
    expect(collisions).toHaveLength(2);
    expect(collisions.map((d) => d.pointer).sort()).toEqual([
      '/paths/~1a/additionalOperations/GET',
      '/paths/~1a/additionalOperations/QUERY',
    ]);
  });

  it('runs duplicate-operationId checks across additionalOperations', () => {
    const analysis = analyzeOpenApi(
      JSON.stringify({
        openapi: '3.2.0',
        info: { title: 'X', version: '1' },
        paths: {
          '/a': {
            get: { operationId: 'dup', responses: {} },
            additionalOperations: { COPY: { operationId: 'dup', responses: {} } },
          },
        },
      }),
      'json'
    );
    const duplicates = analysis.diagnostics.filter((d) => d.message.includes('Duplicate operationId'));
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].pointer).toBe('/paths/~1a/additionalOperations/COPY/operationId');
  });

  it('accepts components-only and webhooks-only 3.1 documents', () => {
    for (const name of ['components-only-3.1.yaml', 'webhooks-only-3.1.yaml']) {
      const analysis = analyzeOpenApi(fixture(name), 'yaml');
      expect(analysis.version).toBe('3.1');
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.operations).toEqual([]);
    }
  });

  it('never throws on malformed content and retains the previous version', () => {
    const analysis = analyzeOpenApi(fixture('malformed.yaml'), 'yaml', '3.1');
    expect(analysis.parsedSpec).toBeUndefined();
    expect(analysis.version).toBe('3.1');
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.operations).toEqual([]);
  });

  it('returns undefined version for malformed content without a previous version', () => {
    const analysis = analyzeOpenApi('{ not json', 'json');
    expect(analysis.version).toBeUndefined();
    expect(analysis.parsedSpec).toBeUndefined();
  });

  it('diagnoses a non-object root', () => {
    const analysis = analyzeOpenApi('"just a string"', 'json', '3.0');
    expect(analysis.parsedSpec).toBeUndefined();
    expect(analysis.version).toBe('3.0');
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({ source: 'semantic', severity: 'error' }),
    ]);
  });

  it('diagnoses an unrecognized version and retains the previous one', () => {
    const analysis = analyzeOpenApi(
      JSON.stringify({ openapi: '2.0', paths: {} }),
      'json',
      '3.0'
    );
    expect(analysis.version).toBe('3.0');
    const semantic = bySource(analysis.diagnostics, 'semantic');
    expect(semantic.some((d) => d.message.includes('"openapi" version'))).toBe(true);
    expect(semantic.find((d) => d.message.includes('"openapi" version'))?.pointer).toBe('/openapi');
  });

  it('diagnoses a missing version field', () => {
    const analysis = analyzeOpenApi(JSON.stringify({ paths: {} }), 'json');
    expect(analysis.version).toBeUndefined();
    expect(
      analysis.diagnostics.some(
        (d) => d.source === 'semantic' && d.message.includes('missing')
      )
    ).toBe(true);
  });

  it('diagnoses an invalid root lacking paths, components, and webhooks', () => {
    const analysis = analyzeOpenApi(
      JSON.stringify({ openapi: '3.1.0', info: { title: 'x', version: '1' } }),
      'json'
    );
    expect(
      analysis.diagnostics.some(
        (d) => d.source === 'semantic' && d.message.includes('at least one of')
      )
    ).toBe(true);
  });

  it('reports missing references from the fixture', () => {
    const analysis = analyzeOpenApi(fixture('missing-ref.yaml'), 'yaml');
    const refs = bySource(analysis.diagnostics, 'reference');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ severity: 'error' });
    expect(refs[0].message).toContain('#/components/parameters/DoesNotExist');
  });

  it('reports cyclic references from the fixture', () => {
    const analysis = analyzeOpenApi(fixture('cyclic-refs.yaml'), 'yaml');
    const refs = bySource(analysis.diagnostics, 'reference');
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs.every((d) => d.message.includes('Circular reference'))).toBe(true);
  });

  it('reports external references as unsupported warnings', () => {
    const analysis = analyzeOpenApi(fixture('external-ref.yaml'), 'yaml');
    const refs = bySource(analysis.diagnostics, 'reference');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ severity: 'warning' });
  });

  it('reports duplicate operationIds from the fixture', () => {
    const analysis = analyzeOpenApi(fixture('duplicate-operation-id.yaml'), 'yaml');
    const semantic = bySource(analysis.diagnostics, 'semantic');
    expect(semantic).toHaveLength(1);
    expect(semantic[0]).toMatchObject({
      severity: 'error',
      pointer: '/paths/~1b/post/operationId',
    });
    expect(semantic[0].message).toContain('sameId');
  });

  it('reports missing path parameters from the fixture', () => {
    const analysis = analyzeOpenApi(fixture('missing-path-param.yaml'), 'yaml');
    const semantic = bySource(analysis.diagnostics, 'semantic');
    expect(semantic).toHaveLength(1);
    expect(semantic[0]).toMatchObject({
      severity: 'error',
      pointer: '/paths/~1users~1{id}/get',
    });
    expect(semantic[0].message).toContain('{id}');
  });

  it('reports unused path parameters from the fixture', () => {
    const analysis = analyzeOpenApi(fixture('unused-path-param.yaml'), 'yaml');
    const semantic = bySource(analysis.diagnostics, 'semantic');
    expect(semantic).toHaveLength(1);
    expect(semantic[0]).toMatchObject({
      severity: 'warning',
      pointer: '/paths/~1users/get/parameters/0',
    });
  });

  it('does not double-diagnose broken refs through semantic checks', () => {
    // The broken parameter ref should yield exactly ONE reference diagnostic
    // and no semantic diagnostics about the unresolvable parameter.
    const analysis = analyzeOpenApi(fixture('missing-ref.yaml'), 'yaml');
    expect(analysis.diagnostics).toHaveLength(1);
  });
});

describe('listOpenApiOperations', () => {
  it('lists one summary per (path, method) with all declared tags', () => {
    const spec = JSON.parse(fixture('minimal-3.0.json'));
    const operations = listOpenApiOperations(spec);
    expect(operations).toEqual([
      {
        path: '/users',
        method: 'get',
        summary: 'List users',
        operationId: 'listUsers',
        tags: ['users'],
        pointer: '/paths/~1users/get',
      },
      {
        path: '/users/{id}',
        method: 'get',
        summary: 'Get a user',
        operationId: 'getUser',
        tags: ['users', 'admin'],
        pointer: '/paths/~1users~1{id}/get',
      },
    ]);
  });

  it('returns empty tags for untagged operations (no sentinel leak)', () => {
    const operations = listOpenApiOperations({
      paths: { '/x': { get: { responses: {} } } },
    });
    expect(operations).toEqual([
      expect.objectContaining({ path: '/x', method: 'get', tags: [] }),
    ]);
  });

  it('includes trace operations and skips non-method keys', () => {
    const operations = listOpenApiOperations({
      paths: {
        '/x': {
          trace: { responses: {} },
          parameters: [],
          'x-custom': {},
          description: 'not a method',
        },
      },
    });
    expect(operations).toEqual([expect.objectContaining({ method: 'trace' })]);
  });

  it('handles documents without paths', () => {
    expect(listOpenApiOperations({})).toEqual([]);
    expect(listOpenApiOperations({ paths: null })).toEqual([]);
  });
});

describe('quick-fix diagnostic metadata (code + data)', () => {
  it('stamps duplicate-operation-id with the id and operation pointer', () => {
    const { diagnostics } = analyzeOpenApi(fixture('duplicate-operation-id.yaml'), 'yaml');
    const dup = diagnostics.find((d) => d.code === 'duplicate-operation-id');
    expect(dup).toBeDefined();
    expect(dup!.data).toMatchObject({ operationId: 'sameId', operationPointer: '/paths/~1b/post' });
  });

  it('stamps missing-path-param with the template name and operation pointer', () => {
    const { diagnostics } = analyzeOpenApi(fixture('missing-path-param.yaml'), 'yaml');
    const missing = diagnostics.find((d) => d.code === 'missing-path-param');
    expect(missing).toBeDefined();
    expect(missing!.data).toMatchObject({ name: 'id', operationPointer: '/paths/~1users~1{id}/get' });
  });

  it('stamps unused-path-param (the pointer alone drives its delete fix)', () => {
    const { diagnostics } = analyzeOpenApi(fixture('unused-path-param.yaml'), 'yaml');
    const unused = diagnostics.find((d) => d.code === 'unused-path-param');
    expect(unused).toBeDefined();
    expect(unused!.pointer).toBe('/paths/~1users/get/parameters/0');
  });

  it('stamps ref-not-found with the internal target pointer', () => {
    const { diagnostics } = analyzeOpenApi(fixture('missing-ref.yaml'), 'yaml');
    const ref = diagnostics.find((d) => d.code === 'ref-not-found');
    expect(ref).toBeDefined();
    expect(ref!.data).toMatchObject({ targetPointer: '/components/parameters/DoesNotExist' });
  });

  it('exposes the resolved-ref map on the analysis', () => {
    const analysis = analyzeOpenApi(fixture('minimal-3.1.yaml'), 'yaml');
    expect(analysis.resolvedRefs).toBeInstanceOf(Map);
  });
});
