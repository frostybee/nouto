import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { json } from '@codemirror/lang-json';
import { createEditorActions, cursorInfoFromView } from './editor-actions';

const DOC = '{"a": {"b": 1}}';

function fakeView(doc: string = DOC, selectionHead?: number) {
  const state = EditorState.create({
    doc,
    extensions: [json()],
    selection: selectionHead !== undefined ? { anchor: selectionHead } : undefined,
  });
  return {
    state,
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView & { dispatch: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> };
}

describe('createEditorActions', () => {
  it('focus() delegates to the view', () => {
    const view = fakeView();
    createEditorActions(view, () => 'json').focus();
    expect(view.focus).toHaveBeenCalled();
  });

  it('getSelection() reads the main selection', () => {
    const view = fakeView(DOC, 3);
    expect(createEditorActions(view, () => 'json').getSelection()).toEqual({ anchor: 3, head: 3 });
  });

  it('setSelection() dispatches a selection with scrollIntoView', () => {
    const view = fakeView();
    createEditorActions(view, () => 'json').setSelection({ anchor: 1, head: 4 });
    expect(view.dispatch).toHaveBeenCalledTimes(1);
    const spec = view.dispatch.mock.calls[0][0];
    expect(spec.scrollIntoView).toBe(true);
    expect(spec.selection.main.anchor).toBe(1);
    expect(spec.selection.main.head).toBe(4);
  });

  it('scrollTo() dispatches a scroll effect', () => {
    const view = fakeView();
    createEditorActions(view, () => 'json').scrollTo(5);
    expect(view.dispatch).toHaveBeenCalledTimes(1);
    const spec = view.dispatch.mock.calls[0][0];
    expect(spec.effects).toBeDefined();
  });

  it('pointerAtCursor() resolves the pointer at the cursor head', () => {
    // Cursor after the '1' (side -1 semantics: the token the cursor follows)
    const view = fakeView(DOC, DOC.indexOf('1') + 1);
    expect(createEditorActions(view, () => 'json').pointerAtCursor()).toBe('/a/b');
  });

  it('pointerAtCursor() returns null when no mode is available', () => {
    const view = fakeView(DOC, 3);
    expect(createEditorActions(view, () => null).pointerAtCursor()).toBeNull();
  });

  it('offsetForPointer() returns the value offset', () => {
    const view = fakeView();
    const offset = createEditorActions(view, () => 'json').offsetForPointer('/a/b');
    expect(offset).toBe(DOC.indexOf('1'));
  });

  it('offsetForPointer() returns null for unknown pointers', () => {
    const view = fakeView();
    expect(createEditorActions(view, () => 'json').offsetForPointer('/nope')).toBeNull();
  });

  it('getEditorState() returns doc text and selection', () => {
    const view = fakeView(DOC, 2);
    expect(createEditorActions(view, () => 'json').getEditorState()).toEqual({
      doc: DOC,
      selection: { anchor: 2, head: 2 },
    });
  });

  it('reads the mode live via the getter (language switches stay correct)', () => {
    const view = fakeView(DOC, DOC.indexOf('1') + 1);
    let mode: 'json' | null = null;
    const actions = createEditorActions(view, () => mode);
    expect(actions.pointerAtCursor()).toBeNull();
    mode = 'json';
    expect(actions.pointerAtCursor()).toBe('/a/b');
  });
});

describe('cursorInfoFromView', () => {
  it('computes line, column, and pointer', () => {
    const doc = '{\n  "a": 1\n}';
    const head = doc.indexOf('1') + 1; // cursor just after the value
    const view = fakeView(doc, head);
    const info = cursorInfoFromView(view, () => 'json');
    expect(info.line).toBe(2);
    expect(info.column).toBe(9);
    expect(info.pointer).toBe('/a');
  });

  it('returns null pointer for non-structured languages', () => {
    const view = fakeView(DOC, 2);
    const info = cursorInfoFromView(view, () => null);
    expect(info.pointer).toBeNull();
  });
});
