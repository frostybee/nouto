import { type Extension } from '@codemirror/state';
import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  MatchDecorator,
  hoverTooltip,
} from '@codemirror/view';
import { tooltips } from '@codemirror/view';

const urlRegex = /https?:\/\/[^\s"'\\}\]]+/g;

const linkMark = Decoration.mark({ class: 'cm-url-link' });

const urlDecorator = new MatchDecorator({
  regexp: urlRegex,
  decoration: () => linkMark,
});

const urlHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = urlDecorator.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = urlDecorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations }
);

function createMenuItem(label: string, iconName: string, onclick: () => void): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'cm-url-menu-item';

  // Apply inline styles for reliability
  Object.assign(item.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const icon = document.createElement('i');
  icon.className = `codicon codicon-${iconName}`;
  icon.style.fontSize = '14px';
  item.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = label;
  item.appendChild(text);

  item.onmouseenter = () => {
    item.style.backgroundColor = 'var(--vscode-menu-selectionBackground, #094771)';
    item.style.color = 'var(--vscode-menu-selectionForeground, #fff)';
  };

  item.onmouseleave = () => {
    item.style.backgroundColor = '';
    item.style.color = '';
  };

  item.onclick = (e) => {
    e.stopPropagation();
    onclick();
  };
  return item;
}

function urlClickMenu(onOpenUrl: (url: string) => void, onCreateRequest?: (url: string) => void) {
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

  return EditorView.domEventHandlers({
    click(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;

      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      const lineStart = line.from;

      // Search for URLs in this line
      const regex = new RegExp(urlRegex.source, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(lineText)) !== null) {
        const from = lineStart + match.index;
        const to = from + match[0].length;
        if (pos >= from && pos <= to) {
          event.preventDefault();
          event.stopPropagation();

          const url = match[0];

          // Dismiss existing menu
          dismiss();

          // Create new menu
          const menu = document.createElement('div');
          menu.className = 'cm-url-menu';
          activeMenu = menu;

          // Apply inline styles for reliability
          Object.assign(menu.style, {
            position: 'fixed',
            zIndex: '1001',
            minWidth: '180px',
            padding: '4px 0',
            backgroundColor: 'var(--vscode-menu-background, #252526)',
            color: 'var(--vscode-menu-foreground, #d4d4d4)',
            border: '1px solid var(--vscode-menu-border, #454545)',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            fontSize: '12px',
            fontFamily: 'var(--vscode-font-family, sans-serif)',
            left: `${event.clientX}px`,
            top: `${event.clientY + 5}px`,
          });

          // Menu item 1: Open in browser
          menu.appendChild(createMenuItem('Open in browser', 'link-external', () => {
            onOpenUrl(url);
            dismiss();
          }));

          // Menu item 2: Copy to clipboard
          menu.appendChild(createMenuItem('Copy to clipboard', 'copy', () => {
            navigator.clipboard.writeText(url);
            dismiss();
          }));

          // Menu item 3: Create new request
          if (onCreateRequest) {
            menu.appendChild(createMenuItem('Create new request', 'add', () => {
              onCreateRequest(url);
              dismiss();
            }));
          }

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

          // Add listeners after a brief delay to avoid immediate dismissal
          setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('keydown', handleKeydown);
          }, 0);

          break;
        }
      }
    },
  });
}

const urlBaseTheme = EditorView.baseTheme({
  '.cm-url-link': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--vscode-textLink-foreground, #3794ff)',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
  '.cm-url-link:hover': {
    color: 'var(--vscode-textLink-activeForeground, #3794ff)',
  },
  '.cm-url-menu': {
    position: 'fixed',
    zIndex: '1001',
    minWidth: '180px',
    padding: '4px 0',
    backgroundColor: 'var(--vscode-menu-background, #252526)',
    color: 'var(--vscode-menu-foreground, #d4d4d4)',
    border: '1px solid var(--vscode-menu-border, #454545)',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    fontSize: '12px',
    fontFamily: 'var(--vscode-font-family, sans-serif)',
  },
  '.cm-url-menu-item': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  '.cm-url-menu-item:hover': {
    backgroundColor: 'var(--vscode-menu-selectionBackground, #094771)',
    color: 'var(--vscode-menu-selectionForeground, #fff)',
  },
  '.cm-url-menu-item .codicon': {
    fontSize: '14px',
  },
});

/**
 * Extension that makes URLs clickable with hover menu containing Open, Copy, and Create new request actions.
 */
export function urlClickableExtension(opts: {
  onOpenUrl: (url: string) => void;
  onCreateRequest?: (url: string) => void;
}): Extension {
  return [
    urlHighlightPlugin,
    urlClickMenu(opts.onOpenUrl, opts.onCreateRequest),
    urlBaseTheme,
  ];
}
