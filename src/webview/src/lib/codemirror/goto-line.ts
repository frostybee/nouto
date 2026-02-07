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

  const label = document.createElement('label');
  label.textContent = 'Go to Line: ';
  label.className = 'cm-goto-line-label';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(view.state.doc.lines);
  input.placeholder = `1–${view.state.doc.lines}`;
  input.className = 'cm-goto-line-input';

  const goBtn = document.createElement('button');
  goBtn.textContent = 'Go';
  goBtn.className = 'cm-goto-line-btn';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00D7';
  closeBtn.className = 'cm-goto-line-close';
  closeBtn.title = 'Close (Escape)';

  function go() {
    const n = parseInt(input.value, 10);
    if (n >= 1 && n <= view.state.doc.lines) {
      const line = view.state.doc.line(n);
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      });
      view.focus();
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

  dom.appendChild(label);
  dom.appendChild(input);
  dom.appendChild(goBtn);
  dom.appendChild(closeBtn);

  return {
    dom,
    mount() {
      input.focus();
    },
  };
}

function openGotoLinePanel(view: EditorView): boolean {
  const isOpen = view.state.field(gotoLineState, false);
  view.dispatch({ effects: toggleGotoLine.of(!isOpen) });
  return true;
}

const gotoLineTheme = EditorView.baseTheme({
  '.cm-goto-line-panel': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
  },
  '.cm-goto-line-label': {
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  '.cm-goto-line-input': {
    width: '80px',
  },
  '.cm-goto-line-btn': {
    minWidth: '40px',
  },
  '.cm-goto-line-close': {
    marginLeft: 'auto',
    background: 'none !important',
    border: 'none !important',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: '1',
    opacity: '0.7',
  },
  '.cm-goto-line-close:hover': {
    opacity: '1',
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
