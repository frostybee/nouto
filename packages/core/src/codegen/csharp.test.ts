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
});
