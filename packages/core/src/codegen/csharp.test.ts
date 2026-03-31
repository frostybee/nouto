import { target } from './csharp';
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

describe('C# HttpClient codegen', () => {
  it('should use GetAsync for GET', () => {
    const code = target.generate(makeRequest({ method: 'GET' }));
    expect(code).toContain('client.GetAsync(');
    expect(code).not.toContain('HttpRequestMessage');
  });

  it('should use PostAsync for POST', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'json', content: '{"a":1}' },
    }));
    expect(code).toContain('client.PostAsync(');
  });

  it('should use DeleteAsync for DELETE', () => {
    const code = target.generate(makeRequest({ method: 'DELETE' }));
    expect(code).toContain('client.DeleteAsync(');
  });

  it('should use HttpRequestMessage for HEAD', () => {
    const code = target.generate(makeRequest({ method: 'HEAD' }));
    expect(code).toContain('HttpMethod.Head');
    expect(code).toContain('HttpRequestMessage');
    expect(code).toContain('client.SendAsync(');
  });

  it('should use HttpRequestMessage for OPTIONS', () => {
    const code = target.generate(makeRequest({ method: 'OPTIONS' }));
    expect(code).toContain('HttpMethod.Options');
    expect(code).toContain('HttpRequestMessage');
  });

  it('should use new HttpMethod() for custom methods', () => {
    const code = target.generate(makeRequest({ method: 'LIST' }));
    expect(code).toContain('new HttpMethod("LIST")');
    expect(code).toContain('HttpRequestMessage');
    expect(code).toContain('client.SendAsync(');
  });

  it('should use new HttpMethod() for PURGE', () => {
    const code = target.generate(makeRequest({ method: 'PURGE' }));
    expect(code).toContain('new HttpMethod("PURGE")');
  });

  it('should use new HttpMethod() for SEARCH', () => {
    const code = target.generate(makeRequest({ method: 'SEARCH' }));
    expect(code).toContain('new HttpMethod("SEARCH")');
  });

  it('should include bearer auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'bearer', token: 'mytoken123' },
    }));
    expect(code).toContain('Authorization');
    expect(code).toContain('Bearer mytoken123');
  });

  it('should include OAuth2 with actual token', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'oauth2', oauthToken: 'oauth-token-123' },
    }));
    expect(code).toContain('Authorization');
    expect(code).toContain('Bearer oauth-token-123');
    expect(code).not.toContain('<access_token>');
  });

  it('should use NetworkCredential for digest auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'digest', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('NetworkCredential');
    expect(code).toContain('user');
    expect(code).toContain('pass');
  });

  it('should use NetworkCredential with domain for NTLM auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'CORP' },
    }));
    expect(code).toContain('NetworkCredential');
    expect(code).toContain('CORP');
  });

  it('should add comment for AWS SigV4 auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3' },
    }));
    expect(code).toContain('AWSSDK');
    expect(code).toContain('us-west-2');
    expect(code).toContain('s3');
  });

  it('should handle XML body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'xml', content: '<root>test</root>' },
    }));
    expect(code).toContain('<root>test</root>');
  });

  it('should include proxy config with WebProxy', () => {
    const code = target.generate(makeRequest({
      proxy: { enabled: true, protocol: 'http' as const, host: 'proxy.example.com', port: 8080 },
    }));
    expect(code).toContain('WebProxy');
    expect(code).toContain('proxy.example.com');
    expect(code).toContain('8080');
  });

  it('should handle SSL insecure with ServerCertificateCustomValidationCallback', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false },
    }));
    expect(code).toContain('ServerCertificateCustomValidationCallback');
  });

  it('should handle SSL client cert with X509Certificate2', () => {
    const code = target.generate(makeRequest({
      ssl: { certPath: '/path/cert.pem', keyPath: '/path/key.pem' },
    }));
    expect(code).toContain('X509Certificate2');
    expect(code).toContain('/path/cert.pem');
  });
});
