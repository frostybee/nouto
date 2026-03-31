import { target } from './javascript-fetch';
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

describe('JavaScript fetch codegen', () => {
  it('should generate GET request', () => {
    const code = target.generate(makeRequest());
    expect(code).toContain('await fetch(');
    expect(code).toContain("method: 'GET'");
  });

  it('should generate POST with JSON body', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      body: { type: 'json', content: '{"name":"test"}' },
    }));
    expect(code).toContain('body: JSON.stringify(');
    expect(code).toContain("method: 'POST'");
  });

  it('should include headers', () => {
    const code = target.generate(makeRequest({
      headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }],
    }));
    expect(code).toContain('headers: {');
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
    expect(code).toContain('new FormData()');
    expect(code).toContain('formData.append');
  });

  it('should include basic auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('Authorization');
    expect(code).toContain('Basic');
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

  it('should add comment for digest auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'digest', username: 'user', password: 'pass' },
    }));
    expect(code).toContain('digest-fetch');
  });

  it('should add comment for NTLM auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'CORP' },
    }));
    expect(code).toContain('NTLM');
    expect(code).toContain('library');
  });

  it('should add comment for AWS SigV4 auth', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'aws', awsAccessKey: 'AKID', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 's3' },
    }));
    expect(code).toContain('@aws-sdk/signature-v4');
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

  it('should add SSL insecure comment', () => {
    const code = target.generate(makeRequest({
      ssl: { rejectUnauthorized: false },
    }));
    expect(code).toContain('NODE_TLS_REJECT_UNAUTHORIZED');
  });

  it('should add SSL client cert comment', () => {
    const code = target.generate(makeRequest({
      ssl: { certPath: '/path/cert.pem', keyPath: '/path/key.pem' },
    }));
    expect(code).toContain('Certificate');
    expect(code).toContain('/path/cert.pem');
    expect(code).toContain('/path/key.pem');
  });
});
