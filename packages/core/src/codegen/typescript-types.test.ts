import { target } from './typescript-types';
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

describe('TypeScript types codegen', () => {
  it('should show comment for empty body', () => {
    const code = target.generate(makeRequest());
    expect(code).toContain('Paste');
  });

  it('should generate interface for simple JSON object', () => {
    const code = target.generate(makeRequest({
      body: { type: 'json', content: '{"name":"test","age":25,"active":true}' },
    }));
    expect(code).toContain('interface');
    expect(code).toContain('name');
    expect(code).toContain('age');
    expect(code).toContain('active');
  });

  it('should generate array type', () => {
    const code = target.generate(makeRequest({
      body: { type: 'json', content: '[{"id":1},{"id":2}]' },
    }));
    expect(code).toContain('[]');
  });

  it('should generate multiple interfaces for nested objects', () => {
    const code = target.generate(makeRequest({
      body: { type: 'json', content: '{"user":{"name":"test","address":{"city":"NYC"}}}' },
    }));
    const interfaceCount = (code.match(/interface/g) || []).length;
    expect(interfaceCount).toBeGreaterThanOrEqual(2);
  });

  it('should use URL path for interface name', () => {
    const code = target.generate(makeRequest({
      url: 'https://api.example.com/api/users',
      body: { type: 'json', content: '{"id":1}' },
    }));
    expect(code).toMatch(/User/i);
  });

  it('should show error comment for invalid JSON', () => {
    const code = target.generate(makeRequest({
      body: { type: 'json', content: '{invalid json}' },
    }));
    expect(code).toContain('Could not parse');
  });
});
