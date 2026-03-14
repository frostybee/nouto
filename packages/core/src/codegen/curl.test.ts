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
});
