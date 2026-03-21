import { describe, it, expect } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { ntAutocomplete } from './nt-autocomplete';

describe('ntAutocomplete', () => {
  it('should return an Extension', () => {
    const ext = ntAutocomplete();
    expect(ext).toBeDefined();
  });

  it('should create an EditorState with the extension without errors', () => {
    const state = EditorState.create({
      doc: '',
      extensions: [ntAutocomplete()],
    });
    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe('');
  });

  it('should be usable with explicit completion context for nt. prefix', () => {
    const state = EditorState.create({
      doc: 'nt.',
      extensions: [ntAutocomplete()],
    });
    expect(state.doc.toString()).toBe('nt.');
    const ctx = new CompletionContext(state, 3, true);
    expect(ctx).toBeDefined();
    expect(ctx.pos).toBe(3);
  });

  it('should be usable with nt.request. prefix', () => {
    const state = EditorState.create({
      doc: 'nt.request.',
      extensions: [ntAutocomplete()],
    });
    const ctx = new CompletionContext(state, 11, true);
    expect(ctx.pos).toBe(11);
  });

  it('should be usable with nt.response. prefix', () => {
    const state = EditorState.create({
      doc: 'nt.response.',
      extensions: [ntAutocomplete()],
    });
    const ctx = new CompletionContext(state, 12, true);
    expect(ctx.pos).toBe(12);
  });

  it('should not interfere with non-nt content', () => {
    const state = EditorState.create({
      doc: 'const x = 5;',
      extensions: [ntAutocomplete()],
    });
    expect(state.doc.toString()).toBe('const x = 5;');
  });
});
