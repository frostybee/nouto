import { describe, it, expect } from 'vitest';
import { formatDocument } from './format';

describe('formatDocument', () => {
  it('formats YAML while preserving comments and anchors', async () => {
    const messy = [
      '# top comment',
      'openapi:    "3.1.0"',
      'info:',
      '    title: T   # trailing comment',
      '    version: &v "1.0.0"',
      'x-copy: *v',
      'paths:   {}',
      '',
    ].join('\n');
    const formatted = await formatDocument(messy, 'yaml');
    expect(formatted).toContain('# top comment');
    expect(formatted).toContain('# trailing comment');
    expect(formatted).toContain('&v');
    expect(formatted).toContain('*v');
    // Normalized indentation: prettier uses 2 spaces.
    expect(formatted).toContain('  title: T');
  });

  it('formats JSON', async () => {
    const messy = '{"openapi":"3.1.0","info":{"title":"T","version":"1.0.0"},"paths":{}}';
    const formatted = await formatDocument(messy, 'json');
    expect(formatted).toContain('"openapi": "3.1.0"');
    expect(JSON.parse(formatted)).toEqual(JSON.parse(messy));
  });

  it('is a fixpoint: formatting formatted output is a no-op', async () => {
    const once = await formatDocument('a:   1\nb:\n  - 2\n', 'yaml');
    expect(await formatDocument(once, 'yaml')).toBe(once);
  });

  it('throws on unparsable input (caller shows the toast)', async () => {
    await expect(formatDocument('{"broken":', 'json')).rejects.toThrow();
  });
});
