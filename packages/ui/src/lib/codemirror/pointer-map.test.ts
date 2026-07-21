import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { buildPointerMap, offsetToPointer, pointerToOffset } from './pointer-map';

function jsonState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [json()] });
}

function yamlState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [yaml()] });
}

describe('pointer-map (JSON)', () => {
  const doc = '{"a": {"b": 1}, "list": [10, 20]}';

  it('builds a pointer map with key/value offsets', () => {
    const map = buildPointerMap(jsonState(doc), 'json');
    const entry = pointerToOffset(map, '/a/b');
    expect(entry).not.toBeNull();
    expect(doc.slice(entry!.keyFrom, entry!.keyTo)).toBe('"b"');
    const valueEntry = entry as { valueFrom?: number; valueTo?: number };
    expect(doc.slice(valueEntry.valueFrom, valueEntry.valueTo)).toBe('1');
  });

  it('maps array item pointers', () => {
    const map = buildPointerMap(jsonState(doc), 'json');
    const entry = pointerToOffset(map, '/list/1');
    expect(entry).not.toBeNull();
    const valueEntry = entry as { valueFrom?: number; valueTo?: number };
    expect(doc.slice(valueEntry.valueFrom, valueEntry.valueTo)).toBe('20');
  });

  it('returns null for missing pointers', () => {
    const map = buildPointerMap(jsonState(doc), 'json');
    expect(pointerToOffset(map, '/nope')).toBeNull();
  });

  it('escapes special characters per RFC 6901', () => {
    const special = '{"a/b": {"c~d": 5}}';
    const map = buildPointerMap(jsonState(special), 'json');
    const entry = pointerToOffset(map, '/a~1b/c~0d');
    expect(entry).not.toBeNull();
    const valueEntry = entry as { valueFrom?: number; valueTo?: number };
    expect(special.slice(valueEntry.valueFrom, valueEntry.valueTo)).toBe('5');
  });

  it('offsetToPointer resolves the pointer at a position', () => {
    const state = jsonState(doc);
    // Default side (-1) matches a cursor sitting AFTER the character, so
    // probe one past the token start.
    expect(offsetToPointer(state, doc.indexOf('1') + 1, 'json')).toBe('/a/b');
  });

  it('round-trips offset -> pointer -> offset', () => {
    const state = jsonState(doc);
    const map = buildPointerMap(state, 'json');
    const pointer = offsetToPointer(state, doc.indexOf('20') + 1, 'json');
    expect(pointer).toBe('/list/1');
    const entry = pointerToOffset(map, pointer) as { valueFrom?: number };
    expect(entry.valueFrom).toBe(doc.indexOf('20'));
  });
});

describe('pointer-map (YAML)', () => {
  const doc = 'foo:\n  bar: 1\nitems:\n  - ten\n  - twenty\n';

  it('builds a pointer map for nested mappings', () => {
    const map = buildPointerMap(yamlState(doc), 'yaml');
    const entry = pointerToOffset(map, '/foo/bar');
    expect(entry).not.toBeNull();
    expect(doc.slice(entry!.keyFrom, entry!.keyTo)).toBe('bar');
  });

  it('maps sequence item pointers', () => {
    const map = buildPointerMap(yamlState(doc), 'yaml');
    const entry = pointerToOffset(map, '/items/1') as { valueFrom?: number; valueTo?: number } | null;
    expect(entry).not.toBeNull();
    expect(doc.slice(entry!.valueFrom, entry!.valueTo)).toBe('twenty');
  });

  it('offsetToPointer resolves pointers inside YAML values', () => {
    const state = yamlState(doc);
    expect(offsetToPointer(state, doc.indexOf('twenty') + 1, 'yaml')).toBe('/items/1');
  });
});
