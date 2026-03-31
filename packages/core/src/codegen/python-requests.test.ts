import { target } from './python-requests';
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

describe('Python requests codegen', () => {
  it('should generate GET request', () => {
    const code = target.generate(makeRequest());
    expect(code).toContain('import requests');
    expect(code).toContain('requests.get(');
  });

  it('should generate POST with JSON body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'json', content: '{"name":"test"}' },
    }));
    expect(code).toContain('requests.post(');
    expect(code).toContain('json=json_data');
  });

  it('should include headers', () => {
    const code = target.generate(makeRequest({
      headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }],
    }));
    expect(code).toContain('headers = {');
  });

  it('should include basic auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('auth=(');
  });

  it('should handle form data with files', () => {
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
    expect(code).toContain('files = {');
  });

  it('should include bearer auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'bearer', token: 'mytoken123' },
    }));
    expect(code).toContain("'Authorization': 'Bearer mytoken123'");
  });

  it('should include API key auth in header', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: 'key123', apiKeyIn: 'header' },
    }));
    expect(code).toContain("'X-API-Key': 'key123'");
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
    expect(code).toContain("'Authorization': 'Bearer oauth-token-123'");
  });

  it('should include OAuth2 placeholder when no token', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'oauth2' },
    }));
    expect(code).toContain("'Authorization': 'Bearer <access_token>'");
  });

  it('should include digest auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'digest', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('from requests.auth import HTTPDigestAuth');
    expect(code).toContain('auth=HTTPDigestAuth(');
    expect(code).toContain("'user'");
    expect(code).toContain("'pass'");
  });

  it('should include NTLM auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('from requests_ntlm import HttpNtlmAuth');
    expect(code).toContain('auth=HttpNtlmAuth(');
    expect(code).toContain("'user'");
    expect(code).toContain("'pass'");
  });

  it('should include NTLM auth with domain', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'DOMAIN', ntlmWorkstation: '' },
    }));
    expect(code).toContain('auth=HttpNtlmAuth(');
    expect(code).toContain('DOMAIN\\\\\\\\user');
  });

  it('should include AWS SigV4 auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3' },
    }));
    expect(code).toContain('from requests_aws4auth import AWS4Auth');
    expect(code).toContain('auth=AWS4Auth(');
    expect(code).toContain("'AKID'");
    expect(code).toContain("'secret'");
    expect(code).toContain("'us-west-2'");
    expect(code).toContain("'s3'");
  });

  it('should include AWS SigV4 with session token', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3', awsSessionToken: 'token123' },
    }));
    expect(code).toContain('auth=AWS4Auth(');
    expect(code).toContain("session_token='token123'");
  });

  it('should handle XML body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'xml', content: '<root><item>test</item></root>' },
    }));
    expect(code).toContain("'Content-Type': 'application/xml'");
    expect(code).toContain('<root><item>test</item></root>');
  });

  it('should include proxy', () => {
    const code = target.generate(makeRequest({
      proxy: { enabled: true, protocol: 'http' as const, host: 'proxy.example.com', port: 8080 },
    }));
    expect(code).toContain('proxies = {');
    expect(code).toContain('http://proxy.example.com:8080');
    expect(code).toContain('proxies=proxies');
  });

  it('should include proxy with auth', () => {
    const code = target.generate(makeRequest({
      proxy: { enabled: true, protocol: 'http' as const, host: 'proxy.example.com', port: 8080, username: 'puser', password: 'ppass' },
    }));
    expect(code).toContain('puser:ppass@proxy.example.com');
  });

  it('should include SSL insecure', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false },
    }));
    expect(code).toContain('verify=False');
  });

  it('should include SSL client cert and key', () => {
    const code = target.generate(makeRequest({
      ssl: { certPath: '/path/cert.pem', keyPath: '/path/key.pem' },
    }));
    expect(code).toContain("cert=('/path/cert.pem', '/path/key.pem')");
  });

  it('should include SSL insecure with client cert', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false, certPath: '/path/cert.pem', keyPath: '/path/key.pem', passphrase: 'secret' },
    }));
    expect(code).toContain('verify=False');
    expect(code).toContain("cert=('/path/cert.pem', '/path/key.pem')");
  });
});
