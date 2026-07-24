import {
  buildPointerMap,
  clearPointerMap,
  offsetToPointer,
  pointerToAnchorRange,
  pointerToKeyRange,
  pointerToRange,
} from './pointerMap';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

describe('OpenAPI pointer map', () => {
  afterEach(() => clearPointerMap(createFakeTextDocument({ content: '', path: '/pointer' }).uri));

  it.each<[string, string, string, string]>([
    ['yaml', 'root:\n  items:\n    - name: first\n', '/root/items/0/name', 'first'],
    ['json', '{"root":{"items":[{"name":"first"}]}}', '/root/items/0/name', '"first"'],
    ['jsonc', '{/* c */"root":{"value":1,},}', '/root/value', '1'],
  ])('maps nested %s values', (languageId, content, pointer, expected) => {
    const document = createFakeTextDocument({ content, languageId, path: '/pointer' });
    const range = pointerToRange(buildPointerMap(document), pointer)!;
    expect(document.getText(range)).toBe(expected);
  });

  describe('anchor ranges for "missing property" diagnostics', () => {
    const seqDoc = 'params:\n  - name: page\n    in: query\n';

    it.each<[string, string, string, string]>([
      // A mapping value anchors to its own key, not its (multi-line) body.
      ['yaml', 'responses:\n  \'200\':\n    content: {}\n', '/responses/200', "'200'"],
      ['json', '{"responses":{"200":{"content":{}}}}', '/responses/200', '"200"'],
      // A sequence item has no key of its own, so it anchors to its first key.
      ['yaml', seqDoc, '/params/0', 'name'],
      ['json', '{"params":[{"name":"page","in":"query"}]}', '/params/0', '"name"'],
      // The root likewise anchors to the document's first key.
      ['yaml', seqDoc, '', 'params'],
      ['json', '{"params":[]}', '', '"params"'],
    ])('anchors a %s %s to a single key', (languageId, content, pointer, expected) => {
      const document = createFakeTextDocument({ content, languageId, path: '/pointer' });
      const range = pointerToAnchorRange(buildPointerMap(document), pointer)!;
      expect(document.getText(range)).toBe(expected);
    });

    it('keeps the anchor narrower than the value it belongs to', () => {
      const document = createFakeTextDocument({ content: seqDoc, path: '/pointer' });
      const map = buildPointerMap(document);
      // The value range spans both lines of the item; the anchor must not.
      expect(document.getText(pointerToRange(map, '/params/0')!)).toContain('in: query');
      expect(document.getText(pointerToAnchorRange(map, '/params/0')!)).toBe('name');
    });

    it('falls back to the value range for a node with no key of any kind', () => {
      const document = createFakeTextDocument({ content: '{}', path: '/pointer' });
      const map = buildPointerMap(document);
      expect(document.getText(pointerToAnchorRange(map, '')!)).toBe('{}');
    });

    it('returns undefined for an unmapped pointer', () => {
      const document = createFakeTextDocument({ content: seqDoc, path: '/pointer' });
      expect(pointerToAnchorRange(buildPointerMap(document), '/nope')).toBeUndefined();
    });
  });

  it('uses core RFC 6901 escaping and handles UTF-16 emoji offsets', () => {
    const content = 'emoji: "🐶"\na/b~c: value\n';
    const document = createFakeTextDocument({ content, path: '/pointer' });
    const map = buildPointerMap(document);
    expect(document.getText(pointerToRange(map, '/a~1b~0c')!)).toBe('value');
    expect(pointerToRange(map, '/emoji')!.end.character).toBe(11);
  });

  it('maps root to the whole document and returns the most specific pointer', () => {
    const content = 'a:\n  b: value\n';
    const document = createFakeTextDocument({ content, path: '/pointer' });
    const map = buildPointerMap(document);
    expect(document.getText(pointerToRange(map, '')!)).toBe(content);
    expect(offsetToPointer(document, content.indexOf('value'))).toBe('/a/b');
    expect(buildPointerMap(document)).toBe(map);

    const changed = createFakeTextDocument({ content: 'a: changed\n', path: '/pointer', version: 2 });
    expect(buildPointerMap(changed)).not.toBe(map);
  });

  it('maps a pointer to its key, so line decorations sit above the key', () => {
    const content = 'paths:\n  /pets:\n    get:\n      summary: List\n';
    const document = createFakeTextDocument({ content, path: '/pointer' });
    const map = buildPointerMap(document);

    const keyRange = pointerToKeyRange(map, '/paths/~1pets/get')!;
    const valueRange = pointerToRange(map, '/paths/~1pets/get')!;

    expect(document.getText(keyRange)).toBe('get');
    expect(keyRange.start.line).toBe(2);
    // The value starts on the following line, which is why keys are preferred.
    expect(valueRange.start.line).toBe(3);
  });

  it('falls back to the value range for keyless entries', () => {
    const content = 'servers:\n  - url: https://example.com\n';
    const document = createFakeTextDocument({ content, path: '/pointer' });
    const map = buildPointerMap(document);

    expect(pointerToKeyRange(map, '/servers/0')).toEqual(pointerToRange(map, '/servers/0'));
  });

  it('keeps only the root entry for an empty document', () => {
    const document = createFakeTextDocument({ content: '', path: '/pointer' });
    expect([...buildPointerMap(document).entries.keys()]).toEqual(['']);
  });
});
