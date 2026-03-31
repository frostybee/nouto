import { target } from './php';
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

describe('PHP cURL codegen', () => {
  it('should generate GET request', () => {
    const code = target.generate(makeRequest());
    expect(code).toContain('curl_init()');
    expect(code).toContain('CURLOPT_URL');
    expect(code).not.toContain('CURLOPT_CUSTOMREQUEST');
  });

  it('should generate POST request', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'json', content: '{"name":"test"}' },
    }));
    expect(code).toContain('CURLOPT_CUSTOMREQUEST');
    expect(code).toContain('CURLOPT_POSTFIELDS');
  });

  it('should include headers', () => {
    const code = target.generate(makeRequest({
      headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }],
    }));
    expect(code).toContain('CURLOPT_HTTPHEADER');
  });

  it('should include basic auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('CURLOPT_USERPWD');
  });

  it('should handle form data with file', () => {
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
    expect(code).toContain('CURLFile');
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

  it('should use CURLAUTH_DIGEST for digest auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'digest', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('CURLAUTH_DIGEST');
    expect(code).toContain('CURLOPT_USERPWD');
  });

  it('should use CURLAUTH_NTLM for NTLM auth with domain', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'CORP' },
    }));
    expect(code).toContain('CURLAUTH_NTLM');
    expect(code).toContain('CORP');
  });

  it('should use CURLOPT_AWS_SIGV4 for AWS auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3' },
    }));
    expect(code).toContain('CURLOPT_AWS_SIGV4');
    expect(code).toContain('us-west-2');
    expect(code).toContain('s3');
  });

  it('should handle XML body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'xml', content: '<root>test</root>' },
    }));
    expect(code).toContain('CURLOPT_POSTFIELDS');
    expect(code).toContain('<root>test</root>');
  });

  it('should include proxy config with CURLOPT_PROXY', () => {
    const code = target.generate(makeRequest({
      proxy: { enabled: true, protocol: 'http' as const, host: 'proxy.example.com', port: 8080 },
    }));
    expect(code).toContain('CURLOPT_PROXY');
    expect(code).toContain('proxy.example.com');
  });

  it('should handle SSL insecure with CURLOPT_SSL_VERIFYPEER', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false },
    }));
    expect(code).toContain('CURLOPT_SSL_VERIFYPEER');
  });

  it('should handle SSL client cert with CURLOPT_SSLCERT and CURLOPT_SSLKEY', () => {
    const code = target.generate(makeRequest({
      ssl: { certPath: '/path/cert.pem', keyPath: '/path/key.pem' },
    }));
    expect(code).toContain('CURLOPT_SSLCERT');
    expect(code).toContain('CURLOPT_SSLKEY');
    expect(code).toContain('/path/cert.pem');
    expect(code).toContain('/path/key.pem');
  });
});
