import * as vscode from 'vscode';
import type { FileResolver, OpenApiFormat } from '@nouto/core/services';
import {
  clearExternalRefCompletionCache,
  crossFileRefTargets,
  enumerateRefTargets,
  parsePartialRefValue,
  typedRefValue,
} from './externalRefCompletion';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

describe('parsePartialRefValue', () => {
  it('rejects internal refs, empty values, schemes, and absolute paths', () => {
    expect(parsePartialRefValue('#/components/schemas/Pet')).toBeUndefined();
    expect(parsePartialRefValue('')).toBeUndefined();
    expect(parsePartialRefValue('   ')).toBeUndefined();
    expect(parsePartialRefValue('https://example.com/x.yaml#/X')).toBeUndefined();
    expect(parsePartialRefValue('C:\\specs\\x.yaml#/X')).toBeUndefined();
    expect(parsePartialRefValue('/etc/x.yaml#/X')).toBeUndefined();
  });

  it('splits relative refs with and without a fragment', () => {
    expect(parsePartialRefValue('./common.yaml#/components/sch')).toEqual({
      filePart: './common.yaml',
      pointerPart: '/components/sch',
      hasHash: true,
    });
    expect(parsePartialRefValue('common.yaml#')).toEqual({
      filePart: 'common.yaml',
      pointerPart: '',
      hasHash: true,
    });
    expect(parsePartialRefValue('schemas/user.yaml')).toEqual({
      filePart: 'schemas/user.yaml',
      pointerPart: '',
      hasHash: false,
    });
  });
});

describe('typedRefValue', () => {
  it('extracts the value inside an open quote', () => {
    expect(typedRefValue("          $ref: './common.yaml#/")).toEqual({
      text: './common.yaml#/',
      startCharacter: 17,
    });
    expect(typedRefValue('  "$ref": "./x')).toEqual({ text: './x', startCharacter: 11 });
  });

  it('extracts unquoted values after the colon', () => {
    expect(typedRefValue('$ref: ./common.yaml')).toEqual({
      text: './common.yaml',
      startCharacter: 6,
    });
    expect(typedRefValue('$ref: ')).toEqual({ text: '', startCharacter: 6 });
  });

  it('returns undefined without a colon on the line', () => {
    expect(typedRefValue('   just text')).toBeUndefined();
  });
});

describe('enumerateRefTargets', () => {
  it('restricts to the section matching the referencing kind', () => {
    const parsed = {
      components: {
        schemas: { Item: {}, Other: {} },
        responses: { NotFound: {} },
      },
    };
    expect(enumerateRefTargets(parsed, 'Schema')).toEqual([
      '#/components/schemas/Item',
      '#/components/schemas/Other',
    ]);
    expect(enumerateRefTargets(parsed, 'Response')).toEqual(['#/components/responses/NotFound']);
  });

  it('lists every section for unknown kinds', () => {
    const parsed = {
      components: { schemas: { A: {} }, headers: { H: {} } },
    };
    expect(enumerateRefTargets(parsed, 'Unknown')).toEqual([
      '#/components/schemas/A',
      '#/components/headers/H',
    ]);
  });

  it('falls back to top-level keys for files without components', () => {
    expect(enumerateRefTargets({ Item: {}, Other: {} }, 'Schema')).toEqual(['#/Item', '#/Other']);
  });

  it('escapes pointer segments and rejects non-records', () => {
    expect(enumerateRefTargets({ components: { schemas: { 'a/b': {} } } }, 'Schema')).toEqual([
      '#/components/schemas/a~1b',
    ]);
    expect(enumerateRefTargets(null, 'Schema')).toEqual([]);
    expect(enumerateRefTargets([1], 'Schema')).toEqual([]);
  });
});

describe('crossFileRefTargets', () => {
  const openDocuments = vscode.workspace.textDocuments as vscode.TextDocument[];

  function makeResolver(
    files: Record<string, { content: string; format: OpenApiFormat }>
  ): FileResolver & { loadCalls: string[] } {
    const loadCalls: string[] = [];
    return {
      loadCalls,
      resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(),
      load: async (uri) => {
        loadCalls.push(uri);
        return files[uri];
      },
    };
  }

  afterEach(() => {
    clearExternalRefCompletionCache();
    openDocuments.length = 0;
  });

  const partial = { filePart: './common.yaml', pointerPart: '/', hasHash: true };

  it('resolves relative to the referencing document and memoizes disk loads', async () => {
    const resolver = makeResolver({
      'file:///specs/common.yaml': { content: 'Item:\n  type: string\n', format: 'yaml' },
    });

    const first = await crossFileRefTargets('file:///specs/api.yaml', partial, 'Schema', resolver);
    const second = await crossFileRefTargets('file:///specs/api.yaml', partial, 'Schema', resolver);

    expect(first).toEqual(['#/Item']);
    expect(second).toEqual(['#/Item']);
    expect(resolver.loadCalls).toHaveLength(1);
  });

  it('re-reads when the open target document changes version', async () => {
    const resolver = makeResolver({
      'file:///specs/common.yaml': { content: 'Item:\n  type: string\n', format: 'yaml' },
    });
    openDocuments.push(
      createFakeTextDocument({ content: 'Item: {}\n', path: '/specs/common.yaml', version: 1 })
    );
    await crossFileRefTargets('file:///specs/api.yaml', partial, 'Schema', resolver);

    openDocuments.length = 0;
    openDocuments.push(
      createFakeTextDocument({ content: 'Item: {}\n', path: '/specs/common.yaml', version: 2 })
    );
    await crossFileRefTargets('file:///specs/api.yaml', partial, 'Schema', resolver);

    expect(resolver.loadCalls).toHaveLength(2);
  });

  it('returns empty for missing or unparseable files', async () => {
    const missing = makeResolver({});
    await expect(
      crossFileRefTargets('file:///specs/api.yaml', partial, 'Schema', missing)
    ).resolves.toEqual([]);

    const broken = makeResolver({
      'file:///specs/common.yaml': { content: 'a: [unclosed', format: 'yaml' },
    });
    await expect(
      crossFileRefTargets('file:///specs/api.yaml', partial, 'Schema', broken)
    ).resolves.toEqual([]);
  });
});
