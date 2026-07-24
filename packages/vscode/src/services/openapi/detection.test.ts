import { clearDetectionCache, detectOpenApiDocument, isOpenApiDocument } from './detection';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

describe('OpenAPI document detection', () => {
  afterEach(() => clearDetectionCache(createFakeTextDocument({ content: '', path: '/detect' }).uri));

  it.each([
    ['yaml', 'openapi: 3.0.4', '3.0'],
    ['yaml', '"openapi": "3.1.1"', '3.1'],
    ['json', '{"openapi":"3.2.0"}', '3.2'],
    ['jsonc', '{"openapi":"3.1.0"}', '3.1'],
  ])('detects %s OpenAPI documents', (languageId, content, version) => {
    const document = createFakeTextDocument({ content, languageId, path: '/detect' });
    expect(detectOpenApiDocument(document)).toEqual({ isOpenApi: true, version });
    expect(isOpenApiDocument(document)).toBe(true);
  });

  it('short-circuits unsupported languages and ordinary structured files', () => {
    expect(detectOpenApiDocument(createFakeTextDocument({
      content: 'openapi: 3.1.0', languageId: 'plaintext', path: '/detect',
    }))).toEqual({ isOpenApi: false });
    expect(detectOpenApiDocument(createFakeTextDocument({
      content: '{"name":"package"}', languageId: 'json', path: '/detect', version: 2,
    }))).toEqual({ isOpenApi: false });
  });

  it('detects an unknown future 3.x minor as the highest supported version', () => {
    const document = createFakeTextDocument({ content: 'openapi: 3.3.0', path: '/detect' });
    expect(detectOpenApiDocument(document)).toEqual({ isOpenApi: true, version: '3.2' });
  });

  it('does not detect other majors', () => {
    const document = createFakeTextDocument({ content: 'openapi: 4.0.0', path: '/detect' });
    expect(detectOpenApiDocument(document)).toEqual({ isOpenApi: false });
  });

  it('does not detect a multi-document stream and never throws', () => {
    // The regex gate passes, but js-yaml's load() throws on multi-document
    // streams; detection must swallow that and stay non-OpenAPI.
    const document = createFakeTextDocument({ content: 'openapi: 3.1.0\n---\nfoo: bar\n', path: '/detect' });
    expect(() => detectOpenApiDocument(document)).not.toThrow();
    expect(detectOpenApiDocument(document)).toEqual({ isOpenApi: false });
  });

  it('reuses a version cache entry and invalidates it on document changes', () => {
    const first = createFakeTextDocument({ content: 'openapi: 3.1.0', path: '/detect' });
    const result = detectOpenApiDocument(first);
    expect(detectOpenApiDocument(first)).toBe(result);
    expect(detectOpenApiDocument(createFakeTextDocument({
      content: 'openapi: nope', path: '/detect', version: 2,
    })).isOpenApi).toBe(false);
  });
});
