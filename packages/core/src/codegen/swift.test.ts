import { target } from './swift';
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

describe('Swift codegen', () => {
  it('should generate GET request', () => {
    const code = target.generate(makeRequest());
    expect(code).toContain('import Foundation');
    expect(code).toContain('URLRequest');
    expect(code).toContain('httpMethod = "GET"');
  });

  it('should generate POST with body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'json', content: '{"name":"test"}' },
    }));
    expect(code).toContain('httpMethod = "POST"');
    expect(code).toContain('httpBody');
  });

  it('should include headers', () => {
    const code = target.generate(makeRequest({
      headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }],
    }));
    expect(code).toContain('request.setValue(');
  });

  it('should include basic auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('base64EncodedString()');
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

  it('should use URLCredential for digest auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'digest', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('URLCredential');
    expect(code).toContain('user');
    expect(code).toContain('pass');
  });

  it('should use URLCredential for NTLM auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'CORP' },
    }));
    expect(code).toContain('URLCredential');
    expect(code).toContain('CORP');
  });

  it('should add comment for AWS SigV4 auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3' },
    }));
    expect(code).toContain('AWSSDKSwiftCore');
    expect(code).toContain('us-west-2');
    expect(code).toContain('s3');
  });

  it('should handle XML body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'xml', content: '<root>test</root>' },
    }));
    expect(code).toContain('httpBody');
    expect(code).toContain('<root>test</root>');
  });

  it('should include proxy config with connectionProxyDictionary', () => {
    const code = target.generate(makeRequest({
      proxy: { enabled: true, protocol: 'http' as const, host: 'proxy.example.com', port: 8080 },
    }));
    expect(code).toContain('connectionProxyDictionary');
    expect(code).toContain('proxy.example.com');
    expect(code).toContain('8080');
  });

  it('should add SSL insecure comment', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false },
    }));
    expect(code).toContain('certificate');
  });
});
