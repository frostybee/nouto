import { describe, it, expect } from 'vitest';
import {
  getTargets,
  getTarget,
  generateCode,
  buildFullUrl,
  getEffectiveHeaders,
  getUrlWithApiKey,
  getBodyContent,
  getFormDataItems,
  getBasicAuth,
  type CodegenRequest,
} from './index';

const createRequest = (overrides: Partial<CodegenRequest> = {}): CodegenRequest => ({
  method: 'GET',
  url: 'https://api.example.com',
  headers: [],
  params: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  ...overrides,
});

describe('codegen registry', () => {
  describe('getTargets', () => {
    it('should return all 12 registered targets', () => {
      const targets = getTargets();
      expect(targets).toHaveLength(12);
    });

    it('should include all expected target IDs', () => {
      const ids = getTargets().map(t => t.id);
      expect(ids).toEqual([
        'curl',
        'javascript-fetch',
        'javascript-axios',
        'python-requests',
        'csharp',
        'go',
        'java',
        'php',
        'swift',
        'dart',
        'powershell',
        'typescript-types',
      ]);
    });

    it('should have valid structure for each target', () => {
      for (const target of getTargets()) {
        expect(target.id).toBeTruthy();
        expect(target.label).toBeTruthy();
        expect(target.language).toBeTruthy();
        expect(typeof target.generate).toBe('function');
      }
    });
  });

  describe('getTarget', () => {
    it('should find target by ID', () => {
      const target = getTarget('curl');
      expect(target).toBeDefined();
      expect(target!.label).toBe('cURL');
    });

    it('should return undefined for unknown ID', () => {
      expect(getTarget('nonexistent')).toBeUndefined();
    });
  });

  describe('generateCode', () => {
    it('should generate code for a valid target', () => {
      const request = createRequest({ method: 'GET', url: 'https://api.example.com/users' });
      const code = generateCode('curl', request);
      expect(code).toContain('curl');
      expect(code).toContain('https://api.example.com/users');
    });

    it('should return fallback for unknown target', () => {
      const code = generateCode('nonexistent', createRequest());
      expect(code).toBe('// Unknown target: nonexistent');
    });

    it('should generate valid output for all targets', () => {
      const request = createRequest({
        method: 'POST',
        url: 'https://api.example.com/data',
        headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
        body: { type: 'json', content: '{"key": "value"}' },
      });

      for (const target of getTargets()) {
        const code = generateCode(target.id, request);
        expect(code).toBeTruthy();
        expect(code.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildFullUrl', () => {
    it('should return url without params', () => {
      expect(buildFullUrl('https://api.com', [])).toBe('https://api.com');
    });

    it('should append enabled params', () => {
      const params = [
        { key: 'page', value: '1', enabled: true },
        { key: 'limit', value: '10', enabled: true },
      ];
      expect(buildFullUrl('https://api.com', params)).toBe('https://api.com?page=1&limit=10');
    });

    it('should skip disabled params', () => {
      const params = [
        { key: 'page', value: '1', enabled: true },
        { key: 'skip', value: 'me', enabled: false },
      ];
      expect(buildFullUrl('https://api.com', params)).toBe('https://api.com?page=1');
    });

    it('should use & separator when URL already has query string', () => {
      const params = [{ key: 'extra', value: 'yes', enabled: true }];
      expect(buildFullUrl('https://api.com?existing=1', params)).toBe('https://api.com?existing=1&extra=yes');
    });
  });

  describe('getEffectiveHeaders', () => {
    it('should include enabled user headers', () => {
      const request = createRequest({
        headers: [
          { key: 'X-Custom', value: 'test', enabled: true },
          { key: 'X-Disabled', value: 'skip', enabled: false },
        ],
      });
      const headers = getEffectiveHeaders(request);
      expect(headers).toEqual([{ key: 'X-Custom', value: 'test' }]);
    });

    it('should add bearer auth header', () => {
      const request = createRequest({
        auth: { type: 'bearer', token: 'my-token' },
      });
      const headers = getEffectiveHeaders(request);
      expect(headers).toContainEqual({ key: 'Authorization', value: 'Bearer my-token' });
    });

    it('should add Content-Type for JSON POST', () => {
      const request = createRequest({
        method: 'POST',
        body: { type: 'json', content: '{}' },
      });
      const headers = getEffectiveHeaders(request);
      expect(headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
    });

    it('should add Content-Type application/json for GraphQL POST', () => {
      const request = createRequest({
        method: 'POST',
        body: { type: 'graphql', content: 'query { users { id } }' },
      });
      const headers = getEffectiveHeaders(request);
      expect(headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
    });

    it('should not override existing Content-Type for GraphQL', () => {
      const request = createRequest({
        method: 'POST',
        headers: [{ key: 'Content-Type', value: 'application/graphql', enabled: true }],
        body: { type: 'graphql', content: 'query { users { id } }' },
      });
      const headers = getEffectiveHeaders(request);
      const contentTypes = headers.filter(h => h.key === 'Content-Type');
      expect(contentTypes).toHaveLength(1);
      expect(contentTypes[0].value).toBe('application/graphql');
    });
  });

  describe('getUrlWithApiKey', () => {
    it('should append API key as query param', () => {
      const request = createRequest({
        auth: { type: 'apikey', apiKeyName: 'api_key', apiKeyValue: 'secret', apiKeyIn: 'query' },
      });
      const url = getUrlWithApiKey(request);
      expect(url).toContain('api_key=secret');
    });

    it('should not append API key when in header', () => {
      const request = createRequest({
        auth: { type: 'apikey', apiKeyName: 'X-Api-Key', apiKeyValue: 'secret', apiKeyIn: 'header' },
      });
      const url = getUrlWithApiKey(request);
      expect(url).toBe('https://api.example.com');
    });
  });

  describe('getBodyContent', () => {
    it('should return null for GET requests', () => {
      const request = createRequest({ method: 'GET', body: { type: 'json', content: '{}' } });
      expect(getBodyContent(request)).toBeNull();
    });

    it('should return JSON body for POST', () => {
      const request = createRequest({ method: 'POST', body: { type: 'json', content: '{"a":1}' } });
      expect(getBodyContent(request)).toBe('{"a":1}');
    });

    it('should return null for binary type', () => {
      const request = createRequest({ method: 'POST', body: { type: 'binary', content: '' } });
      expect(getBodyContent(request)).toBeNull();
    });

    it('should serialize GraphQL query as JSON payload', () => {
      const request = createRequest({
        method: 'POST',
        body: { type: 'graphql', content: 'query { users { id name } }' },
      });
      const result = JSON.parse(getBodyContent(request)!);
      expect(result.query).toBe('query { users { id name } }');
      expect(result.variables).toBeUndefined();
      expect(result.operationName).toBeUndefined();
    });

    it('should include parsed variables in GraphQL payload', () => {
      const request = createRequest({
        method: 'POST',
        body: {
          type: 'graphql',
          content: 'query ($id: ID!) { user(id: $id) { name } }',
          graphqlVariables: '{"id": "123"}',
        },
      });
      const result = JSON.parse(getBodyContent(request)!);
      expect(result.query).toBe('query ($id: ID!) { user(id: $id) { name } }');
      expect(result.variables).toEqual({ id: '123' });
    });

    it('should include operationName in GraphQL payload', () => {
      const request = createRequest({
        method: 'POST',
        body: {
          type: 'graphql',
          content: 'query GetUser { user { id } }',
          graphqlOperationName: 'GetUser',
        },
      });
      const result = JSON.parse(getBodyContent(request)!);
      expect(result.operationName).toBe('GetUser');
    });

    it('should include both variables and operationName in GraphQL payload', () => {
      const request = createRequest({
        method: 'POST',
        body: {
          type: 'graphql',
          content: 'query GetUser($id: ID!) { user(id: $id) { name } }',
          graphqlVariables: '{"id": "456"}',
          graphqlOperationName: 'GetUser',
        },
      });
      const result = JSON.parse(getBodyContent(request)!);
      expect(result.query).toContain('GetUser');
      expect(result.variables).toEqual({ id: '456' });
      expect(result.operationName).toBe('GetUser');
    });

    it('should ignore invalid JSON in GraphQL variables', () => {
      const request = createRequest({
        method: 'POST',
        body: {
          type: 'graphql',
          content: 'query { users { id } }',
          graphqlVariables: '{invalid json}',
        },
      });
      const result = JSON.parse(getBodyContent(request)!);
      expect(result.query).toBe('query { users { id } }');
      expect(result.variables).toBeUndefined();
    });
  });

  describe('getFormDataItems', () => {
    it('should parse form data items', () => {
      const content = JSON.stringify([
        { key: 'name', value: 'test', enabled: true },
        { key: 'disabled', value: 'skip', enabled: false },
      ]);
      const request = createRequest({ body: { type: 'form-data', content } });
      const items = getFormDataItems(request);
      expect(items).toHaveLength(1);
      expect(items[0].key).toBe('name');
    });

    it('should return empty for invalid JSON', () => {
      const request = createRequest({ body: { type: 'form-data', content: 'bad' } });
      expect(getFormDataItems(request)).toEqual([]);
    });
  });

  describe('getBasicAuth', () => {
    it('should return credentials for basic auth', () => {
      const request = createRequest({
        auth: { type: 'basic', username: 'user', password: 'pass' },
      });
      expect(getBasicAuth(request)).toEqual({ username: 'user', password: 'pass' });
    });

    it('should return null for non-basic auth', () => {
      expect(getBasicAuth(createRequest())).toBeNull();
    });
  });
});
