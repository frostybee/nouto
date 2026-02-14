import { parseEnvContent } from './EnvFileService';

// Only test the pure parseEnvContent function (no vscode dependency)
describe('parseEnvContent', () => {
  it('should parse basic KEY=VALUE pairs', () => {
    const result = parseEnvContent('API_KEY=secret123\nBASE_URL=https://api.com');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ key: 'API_KEY', value: 'secret123', enabled: true });
    expect(result[1]).toEqual({ key: 'BASE_URL', value: 'https://api.com', enabled: true });
  });

  it('should skip empty lines', () => {
    const result = parseEnvContent('KEY1=val1\n\n\nKEY2=val2');

    expect(result).toHaveLength(2);
  });

  it('should skip comment lines', () => {
    const result = parseEnvContent('# This is a comment\nKEY=value\n# Another comment');

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('KEY');
  });

  it('should handle double-quoted values', () => {
    const result = parseEnvContent('MSG="hello world"');

    expect(result[0].value).toBe('hello world');
  });

  it('should handle escape sequences in double-quoted values', () => {
    const result = parseEnvContent('MSG="line1\\nline2\\ttab\\\\backslash\\"quote"');

    expect(result[0].value).toBe('line1\nline2\ttab\\backslash"quote');
  });

  it('should handle single-quoted values as literals', () => {
    const result = parseEnvContent("MSG='no \\n escaping here'");

    expect(result[0].value).toBe('no \\n escaping here');
  });

  it('should strip inline comments from unquoted values', () => {
    const result = parseEnvContent('KEY=value # this is a comment');

    expect(result[0].value).toBe('value');
  });

  it('should not strip hash from quoted values', () => {
    const result = parseEnvContent('KEY="value # not a comment"');

    expect(result[0].value).toBe('value # not a comment');
  });

  it('should reject invalid key names', () => {
    const result = parseEnvContent('123BAD=value\n_GOOD=value\nALSO-BAD=value');

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('_GOOD');
  });

  it('should handle keys with underscores and digits', () => {
    const result = parseEnvContent('MY_VAR_2=value');

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('MY_VAR_2');
  });

  it('should skip lines without equals sign', () => {
    const result = parseEnvContent('NOEQUALS\nKEY=val');

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('KEY');
  });

  it('should handle empty values', () => {
    const result = parseEnvContent('EMPTY=');

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('');
  });

  it('should handle values with equals signs', () => {
    const result = parseEnvContent('CONN=postgres://user:pass@host/db?opt=1');

    expect(result[0].value).toBe('postgres://user:pass@host/db?opt=1');
  });

  it('should trim whitespace around keys and values', () => {
    const result = parseEnvContent('  KEY  =  value  ');

    expect(result[0].key).toBe('KEY');
    expect(result[0].value).toBe('value');
  });

  it('should handle Windows-style line endings', () => {
    const result = parseEnvContent('KEY1=val1\r\nKEY2=val2');

    expect(result).toHaveLength(2);
  });

  it('should handle empty content', () => {
    const result = parseEnvContent('');

    expect(result).toEqual([]);
  });

  it('should set all variables as enabled', () => {
    const result = parseEnvContent('A=1\nB=2\nC=3');

    expect(result.every(v => v.enabled === true)).toBe(true);
  });

  it('should handle empty quoted strings', () => {
    const result = parseEnvContent('EMPTY_DQ=""\nEMPTY_SQ=\'\'');

    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('');
    expect(result[1].value).toBe('');
  });
});
