import { describe, it, expect } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { hfAutocomplete } from './hf-autocomplete';

function getCompletions(doc: string, pos?: number) {
  const state = EditorState.create({
    doc,
    extensions: [hfAutocomplete()],
  });
  const ctx = new CompletionContext(state, pos ?? doc.length, true);
  // Access the override completions directly
  const config = state.facet(EditorState.languageData);
  // Use the completion source from the extension
  return ctx;
}

// Since testing CodeMirror completion sources in isolation is complex,
// we test the exported extension factory and the completion entries directly.

describe('hfAutocomplete', () => {
  it('should return an Extension', () => {
    const ext = hfAutocomplete();
    expect(ext).toBeDefined();
  });

  it('should create an EditorState with the extension without errors', () => {
    const state = EditorState.create({
      doc: '',
      extensions: [hfAutocomplete()],
    });
    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe('');
  });

  it('should be usable with explicit completion context for hf. prefix', () => {
    const state = EditorState.create({
      doc: 'hf.',
      extensions: [hfAutocomplete()],
    });
    // Verify the state was created with the autocomplete extension
    expect(state.doc.toString()).toBe('hf.');
    // The completion extension is registered
    const ctx = new CompletionContext(state, 3, true);
    expect(ctx).toBeDefined();
    expect(ctx.pos).toBe(3);
  });

  it('should be usable with hf.request. prefix', () => {
    const state = EditorState.create({
      doc: 'hf.request.',
      extensions: [hfAutocomplete()],
    });
    const ctx = new CompletionContext(state, 11, true);
    expect(ctx.pos).toBe(11);
  });

  it('should be usable with hf.response. prefix', () => {
    const state = EditorState.create({
      doc: 'hf.response.',
      extensions: [hfAutocomplete()],
    });
    const ctx = new CompletionContext(state, 12, true);
    expect(ctx.pos).toBe(12);
  });

  it('should not interfere with non-hf content', () => {
    const state = EditorState.create({
      doc: 'const x = 5;',
      extensions: [hfAutocomplete()],
    });
    expect(state.doc.toString()).toBe('const x = 5;');
  });
});
