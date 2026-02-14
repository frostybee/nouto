import { describe, it, expect } from 'vitest';
import { parseCurl, isCurlCommand, tokenize } from './curl-parser';

describe('isCurlCommand', () => {
  it('should detect curl commands', () => {
    expect(isCurlCommand('curl https://example.com')).toBe(true);
    expect(isCurlCommand('  curl https://example.com')).toBe(true);
    expect(isCurlCommand('CURL https://example.com')).toBe(true);
  });

  it('should reject non-curl text', () => {
    expect(isCurlCommand('https://example.com')).toBe(false);
    expect(isCurlCommand('wget https://example.com')).toBe(false);
    expect(isCurlCommand('')).toBe(false);
  });
});

describe('tokenize', () => {
  it('should tokenize simple command', () => {
    expect(tokenize('curl https://example.com')).toEqual(['curl', 'https://example.com']);
  });

  it('should handle single-quoted strings', () => {
    expect(tokenize("curl -H 'Content-Type: application/json'")).toEqual([
      'curl', '-H', 'Content-Type: application/json',
    ]);
  });

  it('should handle double-quoted strings with escapes', () => {
    expect(tokenize('curl -d "{\\"key\\": \\"value\\"}"')).toEqual([
      'curl', '-d', '{"key": "value"}',
    ]);
  });

  it('should handle line continuations', () => {
    expect(tokenize('curl \\\nhttps://example.com')).toEqual([
      'curl', 'https://example.com',
    ]);
  });
});

describe('parseCurl', () => {
  it('should parse simple GET', () => {
    const result = parseCurl('curl https://api.example.com/users');
    expect(result.method).toBe('GET');
    expect(result.url).toBe('https://api.example.com/users');
    expect(result.headers).toHaveLength(0);
  });

  it('should parse POST with JSON body', () => {
    const result = parseCurl(`curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{"name":"Alice"}'`);
    expect(result.method).toBe('POST');
    expect(result.url).toBe('https://api.example.com/users');
    expect(result.body.type).toBe('json');
    expect(result.body.content).toBe('{"name":"Alice"}');
  });

  it('should detect POST from -d flag without explicit -X', () => {
    const result = parseCurl(`curl https://api.example.com -d 'data=value'`);
    expect(result.method).toBe('POST');
  });

  it('should parse multiple headers', () => {
    const result = parseCurl(`curl https://api.example.com -H 'Accept: application/json' -H 'X-Custom: value'`);
    expect(result.headers).toHaveLength(2);
    expect(result.headers[0].key).toBe('Accept');
    expect(result.headers[1].key).toBe('X-Custom');
  });

  it('should parse basic auth with -u', () => {
    const result = parseCurl(`curl -u admin:password123 https://api.example.com`);
    expect(result.auth.type).toBe('basic');
    expect(result.auth.username).toBe('admin');
    expect(result.auth.password).toBe('password123');
  });

  it('should extract bearer token from Authorization header', () => {
    const result = parseCurl(`curl https://api.example.com -H 'Authorization: Bearer my-token-123'`);
    expect(result.auth.type).toBe('bearer');
    expect(result.auth.token).toBe('my-token-123');
    // Auth header should be removed from headers list
    expect(result.headers.find(h => h.key.toLowerCase() === 'authorization')).toBeUndefined();
  });

  it('should parse form-data with -F', () => {
    const result = parseCurl(`curl -F 'name=Alice' -F 'file=@photo.jpg' https://api.example.com/upload`);
    expect(result.method).toBe('POST');
    expect(result.body.type).toBe('form-data');
  });

  it('should parse URL with query params', () => {
    const result = parseCurl(`curl 'https://api.example.com/search?q=test&page=1'`);
    expect(result.url).toBe('https://api.example.com/search');
    expect(result.params).toHaveLength(2);
    expect(result.params[0].key).toBe('q');
    expect(result.params[0].value).toBe('test');
    expect(result.params[1].key).toBe('page');
    expect(result.params[1].value).toBe('1');
  });

  it('should parse multiline cURL', () => {
    const result = parseCurl(`curl \\\n  -X PUT \\\n  -H 'Content-Type: application/json' \\\n  -d '{"active":true}' \\\n  https://api.example.com/users/1`);
    expect(result.method).toBe('PUT');
    expect(result.url).toBe('https://api.example.com/users/1');
    expect(result.body.type).toBe('json');
  });

  it('should handle --data-raw flag', () => {
    const result = parseCurl(`curl --data-raw '{"key":"val"}' -H 'Content-Type: application/json' https://api.example.com`);
    expect(result.body.type).toBe('json');
    expect(result.body.content).toBe('{"key":"val"}');
  });

  it('should handle cookie flag', () => {
    const result = parseCurl(`curl -b 'session=abc123' https://api.example.com`);
    const cookieHeader = result.headers.find(h => h.key === 'Cookie');
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader!.value).toBe('session=abc123');
  });

  it('should skip flags without values', () => {
    const result = parseCurl(`curl -L -s -k https://api.example.com`);
    expect(result.url).toBe('https://api.example.com');
    expect(result.method).toBe('GET');
  });
});
