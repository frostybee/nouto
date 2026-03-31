import { target } from './curl';
import type { CodegenRequest } from './index';

function makeRequest(overrides: Partial<CodegenRequest> = {}): CodegenRequest {
  return {
    method: 'GET',
    url: 'https://api.example.com',
    headers: [],
    params: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    ...overrides,
  };
}

describe('cURL codegen', () => {
  it('should generate GET request without -X flag', () => {
    const code = target.generate(makeRequest());
    expect(code).toContain('https://api.example.com');
    expect(code).not.toContain('-X');
  });

  it('should generate POST with body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'json', content: '{"name":"test"}' },
    }));
    expect(code).toContain('-X');
    expect(code).toContain('POST');
    expect(code).toContain('-d');
  });

  it('should include custom headers', () => {
    const code = target.generate(makeRequest({
      headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }],
    }));
    expect(code).toContain('-H');
  });

  it('should include basic auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('-u');
  });

  it('should handle binary body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'binary', content: '/path/to/file', fileName: 'data.bin' },
    }));
    expect(code).toContain('--data-binary');
    expect(code).toContain('@/path/to/file');
  });

  it('should handle form data', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: {
        type: 'form-data',
        content: JSON.stringify([
          { key: 'file', value: '/path/to/file', enabled: true, fieldType: 'file', fileName: 'file.txt' },
          { key: 'name', value: 'test', enabled: true, fieldType: 'text' },
        ]),
      },
    }));
    expect(code).toContain('-F');
  });

  it('should include bearer auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'bearer', token: 'mytoken123' },
    }));
    expect(code).toContain('Authorization: Bearer mytoken123');
  });

  it('should include API key auth in header', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: 'key123', apiKeyIn: 'header' },
    }));
    expect(code).toContain('X-API-Key: key123');
  });

  it('should include API key auth in query', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'apikey', apiKeyName: 'api_key', apiKeyValue: 'key123', apiKeyIn: 'query' },
    }));
    expect(code).toContain('api_key=key123');
  });

  it('should include OAuth2 with token', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'oauth2', oauthToken: 'oauth-token-123' },
    }));
    expect(code).toContain('Authorization: Bearer oauth-token-123');
  });

  it('should include OAuth2 placeholder when no token', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'oauth2' },
    }));
    expect(code).toContain('Authorization: Bearer <access_token>');
  });

  it('should include digest auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'digest', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('--digest');
    expect(code).toContain('-u');
    expect(code).toContain('user:pass');
  });

  it('should include NTLM auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('--ntlm');
    expect(code).toContain('-u');
    expect(code).toContain('user:pass');
  });

  it('should include NTLM auth with domain', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'DOMAIN', ntlmWorkstation: '' },
    }));
    expect(code).toContain('--ntlm');
    expect(code).toContain('DOMAIN\\user:pass');
  });

  it('should include AWS SigV4 auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3' },
    }));
    expect(code).toContain('--aws-sigv4');
    expect(code).toContain('aws:amz:us-west-2:s3');
    expect(code).toContain('-u');
    expect(code).toContain('AKID:secret');
  });

  it('should include AWS SigV4 with session token', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3', awsSessionToken: 'token123' },
    }));
    expect(code).toContain('--aws-sigv4');
    expect(code).toContain('X-Amz-Security-Token: token123');
  });

  it('should handle XML body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'xml', content: '<root><item>test</item></root>' },
    }));
    expect(code).toContain('Content-Type: application/xml');
    expect(code).toContain('<root><item>test</item></root>');
  });

  it('should include proxy', () => {
    const code = target.generate(makeRequest({
      proxy: { enabled: true, protocol: 'http' as const, host: 'proxy.example.com', port: 8080 },
    }));
    expect(code).toContain('--proxy');
    expect(code).toContain('http://proxy.example.com:8080');
  });

  it('should include proxy with auth', () => {
    const code = target.generate(makeRequest({
      proxy: { enabled: true, protocol: 'http' as const, host: 'proxy.example.com', port: 8080, username: 'puser', password: 'ppass' },
    }));
    expect(code).toContain('--proxy');
    expect(code).toContain('puser:ppass@proxy.example.com');
  });

  it('should include SSL insecure flag', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false },
    }));
    expect(code).toContain('--insecure');
  });

  it('should include SSL client cert and key', () => {
    const code = target.generate(makeRequest({
      ssl: { certPath: '/path/cert.pem', keyPath: '/path/key.pem' },
    }));
    expect(code).toContain('--cert');
    expect(code).toContain('/path/cert.pem');
    expect(code).toContain('--key');
    expect(code).toContain('/path/key.pem');
  });

  it('should include SSL insecure with client cert and passphrase', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false, certPath: '/path/cert.pem', keyPath: '/path/key.pem', passphrase: 'secret' },
    }));
    expect(code).toContain('--insecure');
    expect(code).toContain('--cert');
    expect(code).toContain('--key');
    expect(code).toContain('--pass');
  });
});
