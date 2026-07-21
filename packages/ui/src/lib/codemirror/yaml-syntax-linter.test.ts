import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { yamlParseLinter } from './yaml-syntax-linter';

function fakeView(doc: string): EditorView {
  return { state: EditorState.create({ doc }) } as unknown as EditorView;
}

describe('yamlParseLinter', () => {
  const lint = yamlParseLinter();

  it('returns no diagnostics for valid YAML', () => {
    expect(lint(fakeView('foo:\n  bar: 1\n'))).toEqual([]);
  });

  it('returns no diagnostics for empty documents', () => {
    expect(lint(fakeView(''))).toEqual([]);
    expect(lint(fakeView('   \n  '))).toEqual([]);
  });

  it('reports syntax errors with in-bounds offsets', () => {
    const doc = 'foo: { unclosed\nbar: 1\n';
    const diagnostics = lint(fakeView(doc));
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.severity).toBe('error');
      expect(diagnostic.from).toBeGreaterThanOrEqual(0);
      expect(diagnostic.to).toBeGreaterThan(diagnostic.from - 1);
      expect(diagnostic.to).toBeLessThanOrEqual(doc.length);
      expect(diagnostic.message.length).toBeGreaterThan(0);
    }
  });

  it('reports duplicate-key style errors', () => {
    const doc = 'a: 1\na: 2\n';
    const diagnostics = lint(fakeView(doc));
    // The yaml parser flags duplicate keys as errors
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('reports tab indentation errors', () => {
    const doc = 'foo:\n\tbar: 1\n';
    const diagnostics = lint(fakeView(doc));
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
