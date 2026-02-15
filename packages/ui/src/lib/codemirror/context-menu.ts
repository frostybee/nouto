import { type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { computeJsonPath } from './json-path';
import { getJsonValueAtPosition } from './json-value';

function createMenuItem(label: string, onclick: () => void): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'cm-ctx-menu-item';
  item.textContent = label;
  item.onclick = (e) => {
    e.stopPropagation();
    onclick();
  };
  return item;
}

function createSeparator(): HTMLDivElement {
  const sep = document.createElement('div');
  sep.className = 'cm-ctx-menu-separator';
  return sep;
}

/**
 * JSON right-click context menu with Copy Path, Copy Value, and Copy Line.
 */
export function contextMenuExtension(): Extension {
  let activeMenu: HTMLDivElement | null = null;

  function removeListeners() {
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleKeydown);
  }

  function dismiss() {
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
    removeListeners();
  }

  function handleClickOutside(e: MouseEvent) {
    if (activeMenu && !activeMenu.contains(e.target as Node)) {
      dismiss();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dismiss();
  }

  return [
    EditorView.domEventHandlers({
      contextmenu(event, view) {
        event.preventDefault();
        dismiss();

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return;

        const menu = document.createElement('div');
        menu.className = 'cm-ctx-menu';
        activeMenu = menu;

        // Copy Path
        const path = computeJsonPath(view.state, pos);
        menu.appendChild(
          createMenuItem('Copy Path', () => {
            navigator.clipboard.writeText(path);
            dismiss();
          })
        );

        // Copy Value
        const value = getJsonValueAtPosition(view.state, pos);
        if (value !== null) {
          menu.appendChild(
            createMenuItem('Copy Value', () => {
              navigator.clipboard.writeText(value);
              dismiss();
            })
          );
        }

        menu.appendChild(createSeparator());

        // Copy Line
        const line = view.state.doc.lineAt(pos);
        menu.appendChild(
          createMenuItem('Copy Line', () => {
            navigator.clipboard.writeText(line.text);
            dismiss();
          })
        );

        // Position the menu using fixed positioning (escapes stacking context)
        menu.style.position = 'fixed';
        menu.style.zIndex = '1001';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        document.body.appendChild(menu);

        // Ensure menu stays in viewport
        requestAnimationFrame(() => {
          const rect = menu.getBoundingClientRect();
          if (rect.right > window.innerWidth) {
            menu.style.left = `${parseInt(menu.style.left) - (rect.right - window.innerWidth) - 4}px`;
          }
          if (rect.bottom > window.innerHeight) {
            menu.style.top = `${parseInt(menu.style.top) - (rect.bottom - window.innerHeight) - 4}px`;
          }
        });

        document.addEventListener('click', handleClickOutside);
        document.addEventListener('keydown', handleKeydown);
      },
    }),
    EditorView.baseTheme({
      '.cm-ctx-menu': {
        position: 'fixed',
        zIndex: '1001',
        minWidth: '160px',
        padding: '4px 0',
        backgroundColor: 'var(--hf-menu-background)',
        color: 'var(--hf-menu-foreground)',
        border: '1px solid var(--hf-menu-border)',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        fontSize: '12px',
        fontFamily: 'var(--hf-font-family)',
      },
      '.cm-ctx-menu-item': {
        padding: '4px 12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      '.cm-ctx-menu-item:hover': {
        backgroundColor: 'var(--hf-menu-selectionBackground)',
        color: 'var(--hf-menu-selectionForeground)',
      },
      '.cm-ctx-menu-separator': {
        height: '1px',
        margin: '4px 0',
        backgroundColor: 'var(--hf-menu-separatorBackground)',
      },
    }),
  ];
}
