import { describe, it, expect } from 'vitest';
import { generateCurl } from './curl';
import type { CurlOptions } from './curl';

const createOptions = (overrides: Partial<CurlOptions> = {}): CurlOptions => ({
  method: 'GET',
  url: 'https://api.example.com',
  headers: [],
  params: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  ...overrides,
});

describe('generateCurl', () => {
  describe('API Key auth', () => {
    it('should add API key as custom header', () => {
      const curl = generateCurl(createOptions({
        auth: { type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: 'secret123', apiKeyIn: 'header' },
      }));

      expect(curl).toContain('-H');
      expect(curl).toContain('X-API-Key: secret123');
    });

    it('should append API key as query parameter', () => {
      const curl = generateCurl(createOptions({
        auth: { type: 'apikey', apiKeyName: 'api_key', apiKeyValue: 'secret123', apiKeyIn: 'query' },
      }));

      expect(curl).toContain('api_key=secret123');
      expect(curl).not.toContain('-H');
    });

    it('should use ? separator for API key query param on clean URL', () => {
      const curl = generateCurl(createOptions({
        url: 'https://api.example.com/data',
        auth: { type: 'apikey', apiKeyName: 'key', apiKeyValue: 'val', apiKeyIn: 'query' },
      }));

      expect(curl).toContain('https://api.example.com/data?key=val');
    });

    it('should use & separator when URL already has query params', () => {
      const curl = generateCurl(createOptions({
        url: 'https://api.example.com/data?existing=1',
        auth: { type: 'apikey', apiKeyName: 'key', apiKeyValue: 'val', apiKeyIn: 'query' },
      }));

      expect(curl).toContain('existing=1&key=val');
    });

    it('should not add API key header when name is empty', () => {
      const curl = generateCurl(createOptions({
        auth: { type: 'apikey', apiKeyName: '', apiKeyValue: 'secret', apiKeyIn: 'header' },
      }));

      expect(curl).not.toContain('-H');
    });

    it('should URL-encode special characters in query API key', () => {
      const curl = generateCurl(createOptions({
        auth: { type: 'apikey', apiKeyName: 'api key', apiKeyValue: 'val&ue', apiKeyIn: 'query' },
      }));

      expect(curl).toContain('api%20key=val%26ue');
    });
  });

  describe('basic functionality', () => {
    it('should generate simple GET request', () => {
      const curl = generateCurl(createOptions());

      expect(curl).toContain('curl');
      expect(curl).toContain('https://api.example.com');
      expect(curl).not.toContain('-X');
    });

    it('should add method flag for non-GET requests', () => {
      const curl = generateCurl(createOptions({ method: 'POST' }));

      expect(curl).toContain('-X');
      expect(curl).toContain('POST');
    });

    it('should include enabled headers', () => {
      const curl = generateCurl(createOptions({
        headers: [
          { key: 'Accept', value: 'application/json', enabled: true },
          { key: 'X-Disabled', value: 'skip', enabled: false },
        ],
      }));

      expect(curl).toContain('Accept: application/json');
      expect(curl).not.toContain('X-Disabled');
    });

    it('should include query params in URL', () => {
      const curl = generateCurl(createOptions({
        params: [{ key: 'page', value: '1', enabled: true }],
      }));

      expect(curl).toContain('page=1');
    });

    it('should add bearer auth header', () => {
      const curl = generateCurl(createOptions({
        auth: { type: 'bearer', token: 'my-jwt' },
      }));

      expect(curl).toContain('Authorization: Bearer my-jwt');
    });

    it('should add basic auth with -u flag', () => {
      const curl = generateCurl(createOptions({
        auth: { type: 'basic', username: 'user', password: 'pass' },
      }));

      expect(curl).toContain('-u');
      expect(curl).toContain('user:pass');
    });

    it('should add JSON body with content-type', () => {
      const curl = generateCurl(createOptions({
        method: 'POST',
        body: { type: 'json', content: '{"name":"test"}' },
      }));

      expect(curl).toContain('Content-Type: application/json');
      expect(curl).toContain('-d');
    });
  });
});
