import { buildPointerMap, pointerToRange } from './pointerMap';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

/**
 * Characterization tests for YAML edge cases in the pointer map: anchors,
 * aliases, merge keys, multi-document streams, duplicate keys, block scalars,
 * flow style and quoted keys. These assert the current, verified-safe behavior
 * (no crashes, well-defined ranges) — not necessarily ideal behavior. If one
 * of these fails after a `yaml` package bump or a walker change, the behavior
 * shift is real and needs a deliberate decision, not a silent ride-along.
 */
describe('OpenAPI pointer map — YAML edge cases', () => {
  // Unique path per document: the pointer map caches by uri + version, so
  // reusing a path across tests with different content would return stale maps.
  let documentId = 0;

  function mapFor(content: string) {
    const document = createFakeTextDocument({ content, path: `/edge-${documentId++}.yaml` });
    return { document, map: buildPointerMap(document) };
  }

  it('walks an anchor-defining node like any other node', () => {
    const { document, map } = mapFor('foo: &a\n  x: 1\nbar: *a\n');
    expect(document.getText(pointerToRange(map, '/foo/x')!)).toBe('1');
  });

  it('treats an alias as a leaf and never recurses into the aliased subtree', () => {
    const { document, map } = mapFor('foo: &a\n  x: 1\nbar: *a\n');
    // The alias itself is addressable, and its range is the reference site.
    expect(document.getText(pointerToRange(map, '/bar')!)).toBe('*a');
    // The resolved value has an `x`, but the pointer map does not see it.
    expect(pointerToRange(map, '/bar/x')).toBeUndefined();
  });

  it('maps a merge key as the literal segment `<<` without flattening', () => {
    const { document, map } = mapFor('foo: &a\n  x: 1\nbaz:\n  <<: *a\n  y: 2\n');
    expect(document.getText(pointerToRange(map, '/baz/<<')!)).toBe('*a');
    expect(document.getText(pointerToRange(map, '/baz/y')!)).toBe('2');
    // Merged-in keys are not materialized as pointers.
    expect(pointerToRange(map, '/baz/x')).toBeUndefined();
  });

  it('recurses into a merge key whose value is a sequence of aliases', () => {
    const { document, map } = mapFor('a: &x 1\nb: &y 2\nmerged:\n  <<:\n    - *x\n    - *y\n');
    expect(document.getText(pointerToRange(map, '/merged/<</0')!)).toBe('*x');
    expect(document.getText(pointerToRange(map, '/merged/<</1')!)).toBe('*y');
  });

  it('keeps only the first document of a multi-document stream', () => {
    const { map } = mapFor('a: 1\n---\nb: 2\n');
    expect(pointerToRange(map, '/a')).toBeDefined();
    expect(pointerToRange(map, '/b')).toBeUndefined();
  });

  it('points a duplicated key at its last occurrence', () => {
    const { document, map } = mapFor('a: 1\na: 2\n');
    expect(document.getText(pointerToRange(map, '/a')!)).toBe('2');
  });

  it('spans the full multi-line range of a literal block scalar', () => {
    const { document, map } = mapFor('block: |\n  line one\n  line two\n');
    const range = pointerToRange(map, '/block')!;
    expect(range.start.line).not.toBe(range.end.line);
    const text = document.getText(range);
    expect(text).toContain('line one');
    expect(text).toContain('line two');
  });

  it('spans the full multi-line range of a folded block scalar', () => {
    const { document, map } = mapFor('folded: >\n  part one\n  part two\n');
    const range = pointerToRange(map, '/folded')!;
    expect(range.start.line).not.toBe(range.end.line);
    const text = document.getText(range);
    expect(text).toContain('part one');
    expect(text).toContain('part two');
  });

  it('recurses through flow mappings and sequences like block style', () => {
    const { document, map } = mapFor('flow: {a: 1, b: [2, 3]}\n');
    expect(document.getText(pointerToRange(map, '/flow/a')!)).toBe('1');
    expect(document.getText(pointerToRange(map, '/flow/b/1')!)).toBe('3');
  });

  it('produces clean unquoted segments for quoted keys', () => {
    const { document, map } = mapFor('"a b": 1\n\'c:d\': 2\n');
    expect(document.getText(pointerToRange(map, '/a b')!)).toBe('1');
    expect(document.getText(pointerToRange(map, '/c:d')!)).toBe('2');
  });
});
