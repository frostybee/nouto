import {
  clearOpenApiAnalysis,
  getOpenApiAnalysis,
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
