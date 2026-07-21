import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  buildPointerMap,
  offsetToPointer,
  pointerToOffset,
  type PointerDocMode,
} from './pointer-map';

export interface CodeMirrorSelectionRange {
  anchor: number;
  head: number;
}

export interface CodeMirrorEditorState {
  doc: string;
  selection: CodeMirrorSelectionRange;
}

export interface CodeMirrorCursorInfo {
  anchor: number;
  head: number;
  /** 1-based line number of the cursor head. */
  line: number;
  /** 1-based column of the cursor head. */
  column: number;
  /** JSON Pointer at the cursor, or null when unavailable for the language. */
  pointer: string | null;
}

/** Diagnostic shape reported through ondiagnosticschange. */
export interface CodeMirrorDiagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source: 'syntax' | 'schema';
}

/** One incremental text edit in UTF-16 offsets of the pre-edit document. */
export interface EditorChange {
  from: number;
  to: number;
  insert: string;
}

/** Imperative editor actions surfaced to the host component via onready. */
export interface CodeMirrorEditorActions {
  focus(): void;
  getSelection(): CodeMirrorSelectionRange;
  setSelection(range: CodeMirrorSelectionRange): void;
  scrollTo(offset: number, options?: { y?: 'start' | 'end' | 'center' | 'nearest' }): void;
  /** JSON Pointer at the current cursor, or null when unavailable. */
  pointerAtCursor(): string | null;
  /** First document offset of the pointer's value (or key), or null when not found. */
  offsetForPointer(pointer: string): number | null;
  getEditorState(): CodeMirrorEditorState;
}

/**
 * Builds the actions object over a live EditorView. `getMode` is read at call
 * time (not captured once) so pointer actions stay correct after live
 * language reconfiguration.
 */
export function createEditorActions(
  view: EditorView,
  getMode: () => PointerDocMode | null
): CodeMirrorEditorActions {
  return {
    focus: () => view.focus(),
    getSelection: () => ({
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head,
    }),
    setSelection: (range) => {
      view.dispatch({
        selection: EditorSelection.single(range.anchor, range.head),
        scrollIntoView: true,
      });
    },
    scrollTo: (offset, options) => {
      view.dispatch({
        effects: EditorView.scrollIntoView(offset, { y: options?.y ?? 'center' }),
      });
    },
    pointerAtCursor: () => {
      const mode = getMode();
      if (!mode) return null;
      try {
        return offsetToPointer(view.state, view.state.selection.main.head, mode);
      } catch {
        return null;
      }
    },
    offsetForPointer: (pointer) => {
      const mode = getMode();
      if (!mode) return null;
      try {
        const range = pointerToOffset(buildPointerMap(view.state, mode), pointer);
        if (!range) return null;
        return 'valueFrom' in range && range.valueFrom !== undefined ? range.valueFrom : range.keyFrom;
      } catch {
        return null;
      }
    },
    getEditorState: () => ({
      doc: view.state.doc.toString(),
      selection: {
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
      },
    }),
  };
}

/** Computes the cursor info payload for oncursorchange. */
export function cursorInfoFromView(
  view: EditorView,
  getMode: () => PointerDocMode | null
): CodeMirrorCursorInfo {
  const { anchor, head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const mode = getMode();
  let pointer: string | null = null;
  if (mode) {
    try {
      pointer = offsetToPointer(view.state, head, mode);
    } catch {
      pointer = null;
    }
  }
  return { anchor, head, line: line.number, column: head - line.from + 1, pointer };
}
