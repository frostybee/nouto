import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, showPanel, keymap, type Panel } from '@codemirror/view';

const toggleGotoLine = StateEffect.define<boolean>();

const gotoLineState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(toggleGotoLine)) value = e.value;
    }
    return value;
  },
  provide: (f) =>
    showPanel.from(f, (open) => (open ? createGotoLinePanel : null)),
});

function createGotoLinePanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-goto-line-panel';

  const left = document.createElement('div');
  left.className = 'cm-goto-line-left';

  const label = document.createElement('label');
  label.textContent = 'Go to Line';
  label.className = 'cm-goto-line-label';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'cm-goto-line-input-wrap';

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = `Line (1\u2013${view.state.doc.lines})`;
  input.min = '1';
  input.max = String(view.state.doc.lines);
  input.className = 'cm-goto-line-input';

  const goBtn = document.createElement('button');
  goBtn.className = 'cm-goto-line-btn';
  goBtn.title = 'Go to line';
  goBtn.innerHTML = '<span class="cm-goto-line-btn-text">Go</span>';

  inputWrap.appendChild(input);
  inputWrap.appendChild(goBtn);

  left.appendChild(label);
  left.appendChild(inputWrap);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'cm-goto-line-close';
  closeBtn.title = 'Close (Escape)';
  closeBtn.innerHTML = '\u00D7';

  function go() {
    const n = parseInt(input.value, 10);
    if (n >= 1 && n <= view.state.doc.lines) {
      const line = view.state.doc.line(n);
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      });
      view.focus();
    } else {
      input.classList.add('cm-goto-line-input-error');
      setTimeout(() => input.classList.remove('cm-goto-line-input-error'), 600);
    }
  }

  function close() {
    view.dispatch({ effects: toggleGotoLine.of(false) });
    view.focus();
  }

  goBtn.onclick = go;
  closeBtn.onclick = close;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  dom.appendChild(left);
  dom.appendChild(closeBtn);

  return {
    dom,
    mount() {
      input.focus();
    },
  };
}

export function openGotoLinePanel(view: EditorView): boolean {
  const isOpen = view.state.field(gotoLineState, false);
  view.dispatch({ effects: toggleGotoLine.of(!isOpen) });
  return true;
}

const gotoLineTheme = EditorView.baseTheme({
  '.cm-goto-line-panel': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: '1px solid var(--vscode-editorWidget-border, rgba(127, 127, 127, 0.3))',
    backgroundColor: 'var(--vscode-editorWidget-background, #252526)',
  },
  '.cm-goto-line-left': {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  '.cm-goto-line-label': {
    fontSize: '12px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    color: 'var(--vscode-editorWidget-foreground, #d4d4d4)',
  },
  '.cm-goto-line-input-wrap': {
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid var(--vscode-input-border, rgba(127, 127, 127, 0.3))',
  },
  '.cm-goto-line-input-wrap:focus-within': {
    borderColor: 'var(--vscode-focusBorder, #007fd4)',
    outline: 'none',
  },
  '.cm-goto-line-input': {
    width: '120px',
    padding: '4px 8px !important',
    backgroundColor: 'var(--vscode-input-background, #3c3c3c) !important',
    color: 'var(--vscode-input-foreground, #d4d4d4) !important',
    border: 'none !important',
    borderRadius: '0 !important',
    fontSize: '12px !important',
    fontFamily: 'var(--vscode-editor-font-family, Consolas, Monaco, monospace) !important',
    outline: 'none !important',
  },
  '.cm-goto-line-input::placeholder': {
    color: 'var(--vscode-input-placeholderForeground, #888)',
  },
  '.cm-goto-line-input::-webkit-inner-spin-button, .cm-goto-line-input::-webkit-outer-spin-button': {
    appearance: 'none',
    margin: '0',
  },
  '.cm-goto-line-input-error': {
    backgroundColor: 'var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.15)) !important',
  },
  '.cm-goto-line-btn': {
    padding: '4px 12px',
    backgroundColor: 'var(--vscode-button-background, #0e639c)',
    color: 'var(--vscode-button-foreground, #fff)',
    border: 'none',
    borderRadius: '0',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '500',
    fontFamily: 'var(--vscode-font-family, sans-serif)',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.1s',
  },
  '.cm-goto-line-btn:hover': {
    backgroundColor: 'var(--vscode-button-hoverBackground, #1177bb)',
  },
  '.cm-goto-line-btn-text': {
    pointerEvents: 'none',
  },
  '.cm-goto-line-close': {
    background: 'none !important',
    border: 'none !important',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: '1',
    color: 'var(--vscode-editorWidget-foreground, #d4d4d4)',
    opacity: '0.6',
    borderRadius: '4px !important',
    transition: 'opacity 0.1s, background-color 0.1s',
  },
  '.cm-goto-line-close:hover': {
    opacity: '1',
    backgroundColor: 'var(--vscode-toolbar-hoverBackground, rgba(127, 127, 127, 0.15)) !important',
  },
});

/**
 * Extension: Go to Line panel opened by Ctrl-G.
 */
export function gotoLineExtension(): Extension {
  return [
    gotoLineState,
    gotoLineTheme,
    keymap.of([{ key: 'Ctrl-g', run: openGotoLinePanel }]),
  ];
}
