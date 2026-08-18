import { describe, it, expect } from 'vitest';
import { formatFromPath, isOpenApiDocument } from './detect';

describe('formatFromPath', () => {
  it('maps yaml/yml/json extensions case-insensitively', () => {
    expect(formatFromPath('C:\\specs\\api.yaml')).toBe('yaml');
    expect(formatFromPath('/home/user/api.YML')).toBe('yaml');
    expect(formatFromPath('api.json')).toBe('json');
  });

  it('returns null for unknown extensions', () => {
    expect(formatFromPath('api.txt')).toBeNull();
    expect(formatFromPath('api')).toBeNull();
  });
});

describe('isOpenApiDocument', () => {
  const yamlSpec = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;
  const jsonSpec = JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'T', version: '1' },
    paths: {},
  });

  it('accepts valid 3.x documents in both formats', () => {
    expect(isOpenApiDocument(yamlSpec, 'yaml')).toBe(true);
    expect(isOpenApiDocument(jsonSpec, 'json')).toBe(true);
  });

  it('rejects non-OpenAPI content', () => {
    expect(isOpenApiDocument('hello: world\n', 'yaml')).toBe(false);
    expect(isOpenApiDocument('{"swagger": "2.0"}', 'json')).toBe(false);
  });

  it('rejects unparseable content that passes the quick regex', () => {
    expect(isOpenApiDocument('openapi: 3.1.0\n  bad:\nindent', 'yaml')).toBe(false);
    expect(isOpenApiDocument('{"openapi": "3.1.0"', 'json')).toBe(false);
  });

  it('rejects unsupported versions', () => {
    expect(isOpenApiDocument('openapi: 2.0\n', 'yaml')).toBe(false);
  });
});
