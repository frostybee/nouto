import { readFileSync } from 'fs';
import { join } from 'path';
import {
  analyzeOpenApiWithExternalRefs,
  bundleExternalRefs,
  resolveExternalRefUri,
  splitExternalRef,
} from './externalRefs';
import type { FileResolver, ResolvedFileMap } from './externalRefs';
import type { OpenApiFormat } from './types';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
}

interface CountingResolver extends FileResolver {
  loadCalls: string[];
}

function makeResolver(files: Record<string, { content: string; format: OpenApiFormat }>): CountingResolver {
  const loadCalls: string[] = [];
  return {
    loadCalls,
    resolve: (fromUri, refPath) => resolveExternalRefUri(fromUri, refPath),
    load: async (uri) => {
      loadCalls.push(uri);
      return files[uri];
    },
  };
}

const yamlFile = (content: string): { content: string; format: OpenApiFormat } => ({
  content,
  format: 'yaml',
});

const ROOT = 'file:///specs/api.yaml';

describe('splitExternalRef', () => {
  it('returns undefined for internal refs', () => {
    expect(splitExternalRef('#/components/schemas/Item')).toBeUndefined();
    expect(splitExternalRef('#')).toBeUndefined();
  });

  it('returns undefined for scheme URLs and Windows drive paths', () => {
    expect(splitExternalRef('http://example.com/spec.yaml#/X')).toBeUndefined();
    expect(splitExternalRef('https://example.com/spec.yaml')).toBeUndefined();
    expect(splitExternalRef('C:\\specs\\common.yaml')).toBeUndefined();
  });

  it('returns undefined for absolute paths and empty refs', () => {
    expect(splitExternalRef('/etc/spec.yaml#/X')).toBeUndefined();
    expect(splitExternalRef('\\\\server\\share.yaml')).toBeUndefined();
    expect(splitExternalRef('')).toBeUndefined();
    expect(splitExternalRef('#/X')).toBeUndefined();
  });

  it('splits a relative path with a pointer fragment', () => {
    expect(splitExternalRef('./schemas/user.yaml#/User')).toEqual({
      filePath: './schemas/user.yaml',
      pointer: '/User',
    });
  });

  it('treats a bare file path as a whole-document reference', () => {
    expect(splitExternalRef('common.yaml')).toEqual({ filePath: 'common.yaml', pointer: '' });
  });

  it('decodes URI-encoded fragments', () => {
    expect(splitExternalRef('./a.yaml#/paths/~1users%2F%7Bid%7D')).toEqual({
      filePath: './a.yaml',
      pointer: '/paths/~1users/{id}',
    });
  });
});

describe('resolveExternalRefUri', () => {
  it('resolves sibling, ./ and ../ paths against a file URI', () => {
    expect(resolveExternalRefUri('file:///a/b/c.yaml', 'common.yaml')).toBe('file:///a/b/common.yaml');
    expect(resolveExternalRefUri('file:///a/b/c.yaml', './d.yaml')).toBe('file:///a/b/d.yaml');
    expect(resolveExternalRefUri('file:///a/b/c.yaml', '../d.yaml')).toBe('file:///a/d.yaml');
  });

  it('collapses equivalent spellings to one URI', () => {
    expect(resolveExternalRefUri('file:///a/b/c.yaml', './x/../d.yaml')).toBe(
      resolveExternalRefUri('file:///a/b/c.yaml', 'd.yaml')
    );
  });
});

describe('analyzeOpenApiWithExternalRefs', () => {
  it('resolves the external-ref fixture against common.yaml with no diagnostics', async () => {
    const resolver = makeResolver({
      'file:///specs/common.yaml': yamlFile(fixture('common.yaml')),
    });
    const yaml = await import('js-yaml');
    const spec = yaml.load(fixture('external-ref.yaml')) as object;

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([]);
    expect(result.externalRefs.size).toBe(1);
    const entry = [...result.externalRefs.values()][0];
    expect(entry).toMatchObject({
      ref: './common.yaml#/components/schemas/Item',
      targetUri: 'file:///specs/common.yaml',
      targetPointer: '/components/schemas/Item',
    });
    expect(entry.atPointer.endsWith('/$ref')).toBe(true);
    expect(result.resolvedFiles.has('file:///specs/common.yaml')).toBe(true);
    expect(result.referencedFiles).toEqual(new Set(['file:///specs/common.yaml']));
  });

  it('reports external-file-not-found for a missing file', async () => {
    const resolver = makeResolver({});
    const spec = { a: { $ref: './missing.yaml#/X' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        source: 'reference',
        severity: 'error',
        code: 'external-file-not-found',
        pointer: '/a/$ref',
        data: { ref: './missing.yaml#/X', targetUri: 'file:///specs/missing.yaml' },
      }),
    ]);
    expect(result.resolvedFiles.size).toBe(0);
    expect(result.referencedFiles.has('file:///specs/missing.yaml')).toBe(true);
  });

  it('reports external-file-not-found when the file cannot be parsed', async () => {
    const resolver = makeResolver({
      'file:///specs/broken.yaml': yamlFile('key: [unclosed'),
    });
    const spec = { a: { $ref: './broken.yaml#/X' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics[0]).toMatchObject({
      code: 'external-file-not-found',
      message: expect.stringContaining('parsed'),
    });
  });

  it('reports external-pointer-not-found when the file loads but the pointer is missing', async () => {
    const resolver = makeResolver({
      'file:///specs/common.yaml': yamlFile('components:\n  schemas: {}\n'),
    });
    const spec = { a: { $ref: './common.yaml#/components/schemas/Item' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'external-pointer-not-found',
        pointer: '/a/$ref',
        data: {
          ref: './common.yaml#/components/schemas/Item',
          targetUri: 'file:///specs/common.yaml',
          targetPointer: '/components/schemas/Item',
        },
      }),
    ]);
    expect(result.resolvedFiles.has('file:///specs/common.yaml')).toBe(true);
  });

  it('resolves a bare-file ref to the whole document', async () => {
    const resolver = makeResolver({
      'file:///specs/user.yaml': yamlFile('type: object\n'),
    });
    const spec = { a: { $ref: 'user.yaml' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([]);
    expect([...result.externalRefs.values()][0].targetPointer).toBe('');
  });

  it('resolves transitive refs relative to the external file, not the root', async () => {
    // Root (in /specs) refs /specs/nested/a.yaml, which refs ./sibling.yaml —
    // that must resolve to /specs/nested/sibling.yaml, not /specs/sibling.yaml.
    const resolver = makeResolver({
      'file:///specs/nested/a.yaml': yamlFile('A:\n  $ref: "./sibling.yaml#/B"\n'),
      'file:///specs/nested/sibling.yaml': yamlFile('B:\n  type: string\n'),
      // A decoy at the WRONG location: resolving against the root would find
      // this file but not the /B pointer.
      'file:///specs/sibling.yaml': yamlFile('WRONG: true\n'),
    });
    const spec = { a: { $ref: './nested/a.yaml#/A' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([]);
    expect(result.referencedFiles.has('file:///specs/nested/sibling.yaml')).toBe(true);
    expect(result.referencedFiles.has('file:///specs/sibling.yaml')).toBe(false);
  });

  it('validates internal refs inside external files against that file', async () => {
    const resolver = makeResolver({
      'file:///specs/a.yaml': yamlFile('A:\n  $ref: "#/Missing"\n'),
    });
    const spec = { a: { $ref: './a.yaml#/A' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'external-pointer-not-found',
        pointer: '/a/$ref',
        data: expect.objectContaining({ targetUri: 'file:///specs/a.yaml', targetPointer: '/Missing' }),
      }),
    ]);
  });

  it('resolves refs pointing back into the root document without loading it', async () => {
    const resolver = makeResolver({
      'file:///specs/a.yaml': yamlFile('A:\n  $ref: "./api.yaml#/shared"\n'),
    });
    const spec = { a: { $ref: './a.yaml#/A' }, shared: { type: 'string' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([]);
    expect(resolver.loadCalls).toEqual(['file:///specs/a.yaml']);
    expect(result.referencedFiles.has(ROOT)).toBe(false);
  });

  it('detects a two-file cycle with one error and terminates', async () => {
    const resolver = makeResolver({
      'file:///specs/a.yaml': yamlFile('A:\n  $ref: "./b.yaml#/B"\n'),
      'file:///specs/b.yaml': yamlFile('B:\n  $ref: "./a.yaml#/A"\n'),
    });
    const spec = { a: { $ref: './a.yaml#/A' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Circular external reference');
  });

  it('stops at the depth limit with an error', async () => {
    const files: Record<string, { content: string; format: OpenApiFormat }> = {};
    for (let i = 0; i < 6; i += 1) {
      files[`file:///specs/f${i}.yaml`] = yamlFile(`X:\n  $ref: "./f${i + 1}.yaml#/X"\n`);
    }
    files['file:///specs/f6.yaml'] = yamlFile('X:\n  type: string\n');
    const resolver = makeResolver(files);
    const spec = { a: { $ref: './f0.yaml#/X' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver, { maxDepth: 3 });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'External reference chain exceeds maximum depth (3).',
        pointer: '/a/$ref',
      }),
    ]);
  });

  it('stops loading new files at the file limit with a single warning', async () => {
    const resolver = makeResolver({
      'file:///specs/f1.yaml': yamlFile('X:\n  type: string\n'),
      'file:///specs/f2.yaml': yamlFile('X:\n  type: string\n'),
      'file:///specs/f3.yaml': yamlFile('X:\n  type: string\n'),
    });
    const spec = {
      a: { $ref: './f1.yaml#/X' },
      b: { $ref: './f2.yaml#/X' },
      c: { $ref: './f3.yaml#/X' },
    };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver, { maxFiles: 1 });

    const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('file limit (1) exceeded');
    expect(resolver.loadCalls).toHaveLength(1);
  });

  it('loads a diamond-shared file only once', async () => {
    const resolver = makeResolver({
      'file:///specs/a.yaml': yamlFile('A:\n  $ref: "./shared.yaml#/S"\n'),
      'file:///specs/b.yaml': yamlFile('B:\n  $ref: "./shared.yaml#/S"\n'),
      'file:///specs/shared.yaml': yamlFile('S:\n  type: string\n'),
    });
    const spec = { a: { $ref: './a.yaml#/A' }, b: { $ref: './b.yaml#/B' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([]);
    expect(resolver.loadCalls.filter((uri) => uri === 'file:///specs/shared.yaml')).toHaveLength(1);
  });

  it('records every occurrence but diagnoses a broken ref once', async () => {
    const resolver = makeResolver({});
    const spec = {
      a: { $ref: './missing.yaml#/X' },
      b: { $ref: './missing.yaml#/X' },
    };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.externalRefs.size).toBe(2);
    expect([...result.externalRefs.keys()].sort()).toEqual(['/a/$ref', '/b/$ref']);
    expect(result.diagnostics).toHaveLength(1);
  });

  it('ignores scheme URLs in the root document', async () => {
    const resolver = makeResolver({});
    const spec = { a: { $ref: 'https://example.com/spec.yaml#/X' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.externalRefs.size).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(resolver.loadCalls).toEqual([]);
  });

  it('warns about unsupported scheme refs inside external files', async () => {
    const resolver = makeResolver({
      'file:///specs/a.yaml': yamlFile('A:\n  $ref: "https://example.com/x.yaml#/X"\n'),
    });
    const spec = { a: { $ref: './a.yaml#/A' } };

    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'external-ref-unsupported',
        pointer: '/a/$ref',
      }),
    ]);
  });
});

describe('bundleExternalRefs', () => {
  const resolveAll = async (
    spec: object,
    files: Record<string, { content: string; format: OpenApiFormat }>
  ): Promise<ResolvedFileMap> => {
    const resolver = makeResolver(files);
    const result = await analyzeOpenApiWithExternalRefs(spec, ROOT, resolver);
    return result.resolvedFiles;
  };

  it('hoists an external target into components.schemas and rewrites the ref', async () => {
    const spec = {
      paths: { '/items': { get: { responses: { '200': { schema: { $ref: './common.yaml#/components/schemas/Item' } } } } } },
    };
    const files = { 'file:///specs/common.yaml': yamlFile(fixture('common.yaml')) };
    const resolvedFiles = await resolveAll(spec, files);

    const { document, diagnostics } = bundleExternalRefs(spec, ROOT, resolvedFiles);

    expect(diagnostics).toEqual([]);
    const doc = document as Record<string, any>;
    expect(doc.paths['/items'].get.responses['200'].schema).toEqual({
      $ref: '#/components/schemas/Item',
    });
    expect(doc.components.schemas.Item).toMatchObject({ type: 'object' });
    // The input spec is never mutated.
    expect((spec.paths['/items'].get.responses['200'].schema as { $ref: string }).$ref).toBe(
      './common.yaml#/components/schemas/Item'
    );
  });

  it('dedupes two refs to the same target into one hoisted schema', async () => {
    const spec = {
      a: { $ref: './common.yaml#/components/schemas/Item' },
      b: { $ref: 'common.yaml#/components/schemas/Item' },
    };
    const files = { 'file:///specs/common.yaml': yamlFile(fixture('common.yaml')) };
    const resolvedFiles = await resolveAll(spec, files);

    const { document } = bundleExternalRefs(spec, ROOT, resolvedFiles);

    const doc = document as Record<string, any>;
    expect(doc.a.$ref).toBe('#/components/schemas/Item');
    expect(doc.b.$ref).toBe('#/components/schemas/Item');
    expect(Object.keys(doc.components.schemas)).toEqual(['Item']);
  });

  it('disambiguates name collisions across files and with root schemas', async () => {
    const spec = {
      components: { schemas: { User: { type: 'integer' } } },
      a: { $ref: './one.yaml#/User' },
      b: { $ref: './two.yaml#/User' },
    };
    const files = {
      'file:///specs/one.yaml': yamlFile('User:\n  type: string\n'),
      'file:///specs/two.yaml': yamlFile('User:\n  type: boolean\n'),
    };
    const resolvedFiles = await resolveAll(spec, files);

    const { document } = bundleExternalRefs(spec, ROOT, resolvedFiles);

    const doc = document as Record<string, any>;
    expect(doc.components.schemas.User).toEqual({ type: 'integer' });
    expect(doc.a.$ref).toBe('#/components/schemas/User_2');
    expect(doc.components.schemas.User_2).toEqual({ type: 'string' });
    expect(doc.b.$ref).toBe('#/components/schemas/User_3');
    expect(doc.components.schemas.User_3).toEqual({ type: 'boolean' });
  });

  it("rewrites a hoisted subtree's internal refs against its own file", async () => {
    const spec = { a: { $ref: './a.yaml#/A' } };
    const files = {
      'file:///specs/a.yaml': yamlFile('A:\n  type: object\n  properties:\n    b:\n      $ref: "#/B"\nB:\n  type: string\n'),
    };
    const resolvedFiles = await resolveAll(spec, files);

    const { document, diagnostics } = bundleExternalRefs(spec, ROOT, resolvedFiles);

    expect(diagnostics).toEqual([]);
    const doc = document as Record<string, any>;
    expect(doc.a.$ref).toBe('#/components/schemas/A');
    expect(doc.components.schemas.A.properties.b.$ref).toBe('#/components/schemas/B');
    expect(doc.components.schemas.B).toEqual({ type: 'string' });
  });

  it('turns a cross-file cycle into a terminating internal cycle', async () => {
    const spec = { a: { $ref: './a.yaml#/A' } };
    const files = {
      'file:///specs/a.yaml': yamlFile('A:\n  type: object\n  properties:\n    b:\n      $ref: "./b.yaml#/B"\n'),
      'file:///specs/b.yaml': yamlFile('B:\n  type: object\n  properties:\n    a:\n      $ref: "./a.yaml#/A"\n'),
    };
    const resolvedFiles = await resolveAll(spec, files);

    const { document } = bundleExternalRefs(spec, ROOT, resolvedFiles);

    const doc = document as Record<string, any>;
    expect(doc.components.schemas.A.properties.b.$ref).toBe('#/components/schemas/B');
    expect(doc.components.schemas.B.properties.a.$ref).toBe('#/components/schemas/A');
  });

  it('names a whole-document hoist after the file', async () => {
    const spec = { a: { $ref: './user-profile.yaml' } };
    const files = { 'file:///specs/user-profile.yaml': yamlFile('type: object\n') };
    const resolvedFiles = await resolveAll(spec, files);

    const { document } = bundleExternalRefs(spec, ROOT, resolvedFiles);

    const doc = document as Record<string, any>;
    expect(doc.a.$ref).toBe('#/components/schemas/user-profile');
    expect(doc.components.schemas['user-profile']).toEqual({ type: 'object' });
  });

  it('leaves unresolvable refs untouched and reports diagnostics', async () => {
    const spec = {
      a: { $ref: './missing.yaml#/X' },
      b: { $ref: './present.yaml#/Missing' },
    };
    const files = { 'file:///specs/present.yaml': yamlFile('X:\n  type: string\n') };
    const resolvedFiles = await resolveAll(spec, files);

    const { document, diagnostics } = bundleExternalRefs(spec, ROOT, resolvedFiles);

    const doc = document as Record<string, any>;
    expect(doc.a.$ref).toBe('./missing.yaml#/X');
    expect(doc.b.$ref).toBe('./present.yaml#/Missing');
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'external-file-not-found', pointer: '/a/$ref' }),
      expect.objectContaining({ code: 'external-pointer-not-found', pointer: '/b/$ref' }),
    ]);
  });

  it('returns an unchanged document when there is nothing to bundle', () => {
    const spec = {
      openapi: '3.1.0',
      paths: { '/x': { get: { responses: { '200': { description: 'OK' } } } } },
      remote: { $ref: 'https://example.com/x.yaml#/X' },
    };

    const { document, diagnostics } = bundleExternalRefs(spec, ROOT, new Map());

    expect(diagnostics).toEqual([]);
    expect(document).toEqual(spec);
    expect((document as Record<string, any>).components).toBeUndefined();
  });
});
