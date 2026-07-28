import * as vscode from 'vscode';
import type { FileResolver, OpenApiFormat } from '@nouto/core/services';
import {
  clearExternalAnalysis,
  clearOpenApiAnalysis,
  getOpenApiAnalysis,
  getOpenApiAnalysisWithExternalRefs,
  getReferrersOf,
  hasEverBeenOpenApi,
} from './analysisCache';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

describe('OpenAPI analysis cache', () => {
  const path = '/sticky.yaml';

  afterEach(() => clearOpenApiAnalysis(createFakeTextDocument({ content: '', path }).uri));

  it('shares analysis per version and retains the last-known OpenAPI version', () => {
    const valid = createFakeTextDocument({
      path,
      content: 'openapi: 3.1.0\ninfo: { title: A, version: 1.0.0 }\npaths: {}\n',
    });
    const first = getOpenApiAnalysis(valid);
    expect(getOpenApiAnalysis(valid)).toBe(first);
    expect(first.version).toBe('3.1');
    expect(hasEverBeenOpenApi(valid.uri)).toBe(true);

    const corruptedVersion = createFakeTextDocument({
      path,
      version: 2,
      content: 'openapi: broken\ninfo: { title: A, version: 1.0.0 }\npaths: {}\n',
    });
    const next = getOpenApiAnalysis(corruptedVersion);
    expect(next.version).toBe('3.1');
    expect(next.diagnostics.some((diagnostic) => diagnostic.pointer === '/openapi')).toBe(true);
  });

  it('clears both cached analysis and sticky recognition on close cleanup', () => {
    const document = createFakeTextDocument({ content: 'openapi: 3.0.0', path });
    getOpenApiAnalysis(document);
    clearOpenApiAnalysis(document.uri);
    expect(hasEverBeenOpenApi(document.uri)).toBe(false);
  });
});

describe('external $ref analysis cache', () => {
  const openDocuments = vscode.workspace.textDocuments as vscode.TextDocument[];
  let counter = 0;
  let rootPath: string;

  const ROOT_CONTENT = [
    'openapi: 3.1.0',
    'info: { title: A, version: 1.0.0 }',
    'paths: {}',
    'components:',
    '  schemas:',
    '    Item:',
    '      $ref: "./common.yaml#/Item"',
    '',
  ].join('\n');
  const COMMON_CONTENT = 'Item:\n  type: string\n';

  const makeResolver = (
    files: Record<string, { content: string; format: OpenApiFormat }>
  ): FileResolver & { loadCalls: string[] } => {
    const loadCalls: string[] = [];
    return {
      loadCalls,
      resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(),
      load: async (uri) => {
        loadCalls.push(uri);
        return files[uri];
      },
    };
  };

  beforeEach(() => {
    counter += 1;
    rootPath = `/external-cache-${counter}/api.yaml`;
  });

  afterEach(() => {
    clearOpenApiAnalysis(createFakeTextDocument({ content: '', path: rootPath }).uri);
    openDocuments.length = 0;
  });

  const commonUri = () => `file:///external-cache-${counter}/common.yaml`;
  const commonPath = () => `/external-cache-${counter}/common.yaml`;

  it('reuses the result while the root and referenced versions are unchanged', async () => {
    const document = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath });
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_CONTENT, format: 'yaml' } });

    const first = await getOpenApiAnalysisWithExternalRefs(document, resolver);
    const second = await getOpenApiAnalysisWithExternalRefs(document, resolver);

    expect(second).toBe(first);
    expect(resolver.loadCalls).toHaveLength(1);
    expect(first.diagnostics).toEqual([]);
  });

  it('recomputes when the root document version bumps', async () => {
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_CONTENT, format: 'yaml' } });
    const v1 = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath });
    const first = await getOpenApiAnalysisWithExternalRefs(v1, resolver);

    const v2 = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath, version: 2 });
    const second = await getOpenApiAnalysisWithExternalRefs(v2, resolver);

    expect(second).not.toBe(first);
    expect(resolver.loadCalls).toHaveLength(2);
  });

  it('recomputes when an open referenced document changes version', async () => {
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_CONTENT, format: 'yaml' } });
    const document = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath });
    openDocuments.push(createFakeTextDocument({ content: COMMON_CONTENT, path: commonPath() }));
    const first = await getOpenApiAnalysisWithExternalRefs(document, resolver);

    openDocuments.length = 0;
    openDocuments.push(
      createFakeTextDocument({ content: COMMON_CONTENT, path: commonPath(), version: 2 })
    );
    const second = await getOpenApiAnalysisWithExternalRefs(document, resolver);

    expect(second).not.toBe(first);
    expect(resolver.loadCalls).toHaveLength(2);
  });

  it('recomputes when a referenced file read from disk is subsequently opened', async () => {
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_CONTENT, format: 'yaml' } });
    const document = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath });
    const first = await getOpenApiAnalysisWithExternalRefs(document, resolver);

    openDocuments.push(createFakeTextDocument({ content: COMMON_CONTENT, path: commonPath() }));
    const second = await getOpenApiAnalysisWithExternalRefs(document, resolver);

    expect(second).not.toBe(first);
  });

  it('shares one in-flight computation between concurrent callers', async () => {
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_CONTENT, format: 'yaml' } });
    const document = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath });

    const [first, second] = await Promise.all([
      getOpenApiAnalysisWithExternalRefs(document, resolver),
      getOpenApiAnalysisWithExternalRefs(document, resolver),
    ]);

    expect(second).toBe(first);
    expect(resolver.loadCalls).toHaveLength(1);
  });

  it('maintains the referencedBy reverse index across recomputes', async () => {
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_CONTENT, format: 'yaml' } });
    const document = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath });
    await getOpenApiAnalysisWithExternalRefs(document, resolver);

    const commonMockUri = { toString: () => commonUri() } as vscode.Uri;
    expect(getReferrersOf(commonMockUri)).toEqual(new Set([`file://${rootPath}`]));

    // A new version without the external ref prunes the index.
    const withoutRef = createFakeTextDocument({
      content: 'openapi: 3.1.0\ninfo: { title: A, version: 1.0.0 }\npaths: {}\n',
      path: rootPath,
      version: 2,
    });
    await getOpenApiAnalysisWithExternalRefs(withoutRef, resolver);

    expect(getReferrersOf(commonMockUri).size).toBe(0);
  });

  it('clearExternalAnalysis drops the cache entry and its reverse-index links', async () => {
    const resolver = makeResolver({ [commonUri()]: { content: COMMON_CONTENT, format: 'yaml' } });
    const document = createFakeTextDocument({ content: ROOT_CONTENT, path: rootPath });
    await getOpenApiAnalysisWithExternalRefs(document, resolver);

    clearExternalAnalysis(document.uri);

    const commonMockUri = { toString: () => commonUri() } as vscode.Uri;
    expect(getReferrersOf(commonMockUri).size).toBe(0);
    const again = await getOpenApiAnalysisWithExternalRefs(document, resolver);
    expect(again.diagnostics).toEqual([]);
    expect(resolver.loadCalls).toHaveLength(2);
  });

  it('returns an empty result for unparseable documents', async () => {
    const resolver = makeResolver({});
    const document = createFakeTextDocument({ content: ': not yaml [', path: rootPath });

    const result = await getOpenApiAnalysisWithExternalRefs(document, resolver);

    expect(result.externalRefs.size).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(resolver.loadCalls).toEqual([]);
  });
});
