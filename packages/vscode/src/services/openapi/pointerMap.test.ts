import {
  buildPointerMap,
  clearPointerMap,
  offsetToPointer,
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

  it('keeps only the root entry for an empty document', () => {
    const document = createFakeTextDocument({ content: '', path: '/pointer' });
    expect([...buildPointerMap(document).entries.keys()]).toEqual(['']);
  });
});
