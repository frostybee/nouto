import { describe, it, expect } from 'vitest';
import { stripJsonComments, parseJsonc } from './jsonc';

describe('stripJsonComments', () => {
  it('strips line comments', () => {
    expect(parseJsonc('{\n// note\n"a": 1 // tail\n}')).toEqual({ a: 1 });
  });

  it('strips block comments, including multi-line', () => {
    expect(parseJsonc('{ /* x */ "a": /* multi\nline */ 1 }')).toEqual({ a: 1 });
  });

  it('strips an unterminated block comment to end of input', () => {
    expect(stripJsonComments('{"a": 1} /* dangling')).toBe('{"a": 1} ');
  });

  it('drops trailing commas in objects and arrays, including nested', () => {
    expect(parseJsonc('{"a": [1, 2, ], "b": {"c": 3, }, }')).toEqual({
      a: [1, 2],
      b: { c: 3 },
    });
  });

  it('drops a trailing comma separated from its brace by a comment', () => {
    expect(parseJsonc('{"a": 1, // note\n}')).toEqual({ a: 1 });
    expect(parseJsonc('{"a": 1, /* note */ }')).toEqual({ a: 1 });
  });

  it('never touches string contents', () => {
    const doc =
      '{"url": "https://x.y/z", "note": "a, }", "slash": "//not a comment", "esc": "say \\"hi\\", //ok"}';
    expect(stripJsonComments(doc)).toBe(doc);
    expect(parseJsonc(doc)).toEqual({
      url: 'https://x.y/z',
      note: 'a, }',
      slash: '//not a comment',
      esc: 'say "hi", //ok',
    });
  });

  it('keeps separating commas intact', () => {
    expect(parseJsonc('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('is a no-op on strict JSON', () => {
    const doc = JSON.stringify(
      {
        colors: { 'editor.background': '#1e1e2e' },
        tokenColors: [{ scope: 'comment' }],
      },
      null,
      2,
    );
    expect(stripJsonComments(doc)).toBe(doc);
  });
});

describe('parseJsonc', () => {
  it('parses a realistic JSONC theme snippet', () => {
    const theme = `{
      // A Shiki-style theme with comments
      "name": "Demo // not stripped",
      "type": "dark",
      "colors": {
        "editor.background": "#282a36", /* dracula-ish */
        "editor.foreground": "#f8f8f2",
      },
      "tokenColors": [
        { "scope": ["comment"], "settings": { "foreground": "#6272a4" } },
      ],
    }`;
    const parsed = parseJsonc(theme) as {
      name: string;
      colors: Record<string, string>;
      tokenColors: unknown[];
    };
    expect(parsed.name).toBe('Demo // not stripped');
    expect(parsed.colors['editor.background']).toBe('#282a36');
    expect(parsed.tokenColors).toHaveLength(1);
  });

  it('still throws on genuinely invalid JSON', () => {
    expect(() => parseJsonc('{"a": }')).toThrow();
  });
});
