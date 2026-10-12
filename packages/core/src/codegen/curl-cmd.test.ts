import { target, cmdQuote } from './curl-cmd';
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

describe('cmdQuote', () => {
  it('leaves plain tokens unquoted', () => {
    expect(cmdQuote('https://api.example.com/data')).toBe('https://api.example.com/data');
  });

  it('wraps values with spaces in double quotes', () => {
    expect(cmdQuote('Accept: application/json')).toBe('"Accept: application/json"');
  });

  it('escapes double quotes and the backslashes before them', () => {
    expect(cmdQuote('{"a":"b"}')).toBe('"{\\"a\\":\\"b\\"}"');
    expect(cmdQuote('say \\"hi\\"')).toBe('"say \\\\\\"hi\\\\\\""');
  });

  it('doubles a trailing backslash so it does not escape the closing quote', () => {
    expect(cmdQuote('C:\\certs\\')).toBe('"C:\\certs\\\\"');
  });

  it('quotes values that start with a dash', () => {
    expect(cmdQuote('-x')).toBe('"-x"');
  });
});

describe('cURL (cmd.exe) codegen', () => {
  it('uses caret continuations and double quotes', () => {
    const code = target.generate(makeRequest({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: [{ id: '1', key: 'Accept', value: 'application/json', enabled: true }],
      auth: { type: 'bearer', token: 'example-token' },
      body: { type: 'json', content: '{\n  "name": "Example"\n}' },
    }));
    expect(code).toBe(
      [
        'curl ^',
        '  -X POST ^',
        '  https://api.example.com/data ^',
        '  -H "Accept: application/json" ^',
        '  -H "Authorization: Bearer example-token" ^',
        '  -H "Content-Type: application/json" ^',
        '  --data-raw "{\\"name\\":\\"Example\\"}"',
      ].join('\n')
    );
  });

  it('keeps a single-line body as written', () => {
    const code = target.generate(makeRequest({ method: 'POST', body: { type: 'text', content: 'hello world' } }));
    expect(code).toContain('--data-raw "hello world"');
  });

  it('joins the lines of a body that is not JSON', () => {
    const code = target.generate(makeRequest({ method: 'POST', body: { type: 'text', content: 'line one\nline two' } }));
    expect(code).toContain('--data-raw "line one line two"');
  });

  it('keeps the NTLM domain backslash', () => {
    const code = target.generate(makeRequest({
      auth: { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'CORP' } as any,
    }));
    // A backslash is not in the plain-token set, so the value is quoted; it stays a single backslash
    expect(code).toContain('--ntlm -u "CORP\\user:pass"');
  });

  it('is registered as a code generation target', () => {
    expect(target.id).toBe('curl-cmd');
    expect(target.label).toBe('cURL (cmd.exe)');
  });
});
