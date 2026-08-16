import { describeOutlineParseFailure } from './parseFailure';

describe('describeOutlineParseFailure', () => {
  const broken = "openapi: 3.0.4\npaths:\n  /a:\n    get:\n      responses:\n        '400':dad\n          description: bad\n";

  it('names the first syntax error with its line', () => {
    const text = describeOutlineParseFailure(broken, 'yaml', { diagnostics: [] }, { stale: false });
    expect(text).toMatch(/^Can't build the outline: line 6: /);
  });

  it('switches the prefix when a previous tree is kept', () => {
    const text = describeOutlineParseFailure(broken, 'yaml', { diagnostics: [] }, { stale: true });
    expect(text).toMatch(/^Outline is out of date: line 6: /);
  });

  it('falls back to the first error diagnostic when the text parses', () => {
    const text = describeOutlineParseFailure('- a\n- b\n', 'yaml', {
      diagnostics: [
        { source: 'semantic', severity: 'warning', message: 'meh' },
        { source: 'semantic', severity: 'error', message: 'Document root must be an object.' },
      ],
    }, { stale: false });
    expect(text).toBe("Can't build the outline: Document root must be an object.");
  });

  it('has a generic fallback', () => {
    expect(describeOutlineParseFailure('', 'yaml', undefined, { stale: false })).toBe(
      "Can't build the outline: the document could not be parsed."
    );
  });
});
