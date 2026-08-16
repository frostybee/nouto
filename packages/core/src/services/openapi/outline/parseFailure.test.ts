import { describeOutlineParseFailure, outlineParseFailure, parseFailureNode, PARSE_FAILURE_NODE_ID } from './parseFailure';

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

describe('outlineParseFailure / parseFailureNode', () => {
  const broken = "openapi: 3.0.4\npaths:\n  /a:\n    get:\n      responses:\n        '400':dad\n          description: bad\n";

  it('splits title, detail and position', () => {
    const failure = outlineParseFailure(broken, 'yaml', { diagnostics: [] }, { stale: true });
    expect(failure.title).toBe('Outline is out of date');
    expect(failure.detail).toMatch(/^line 6: /);
    expect(failure.message).toBe(`${failure.title}: ${failure.detail}`);
    expect(failure.line).toBe(6);
    expect(broken.slice(0, failure.offset).split('\n').length).toBe(6);
  });

  it('builds a red error row without a pointer that jumps to the offset', () => {
    const failure = outlineParseFailure(broken, 'yaml', { diagnostics: [] }, { stale: false });
    const node = parseFailureNode('file:///a.yaml', failure);
    expect(node).toMatchObject({
      id: PARSE_FAILURE_NODE_ID,
      label: "Can't build the outline",
      description: failure.detail,
      iconId: 'error',
      iconColor: 'errorForeground',
      contextValue: 'outlineParseFailure',
      documentUri: 'file:///a.yaml',
      offset: failure.offset,
      children: [],
    });
    expect(node.pointer).toBeUndefined();
  });
});
