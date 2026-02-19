import { type Extension } from '@codemirror/state';
import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  MatchDecorator,
  hoverTooltip,
  type Tooltip,
} from '@codemirror/view';
import { copyToClipboard } from '../clipboard';

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

  const icon = document.createElement('i');
  icon.className = `codicon codicon-${iconName}`;
  item.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = label;
  item.appendChild(text);

  item.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onclick();
  };
  return item;
}

function urlHoverTooltip(onOpenUrl: (url: string) => void, onCreateRequest?: (url: string) => void) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const lineStart = line.from;

    const regex = new RegExp(urlRegex.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      const from = lineStart + match.index;
      const to = from + match[0].length;
      if (pos >= from && pos <= to) {
        const url = match[0];
        return {
          pos: from,
          end: to,
          above: false,
          create(): { dom: HTMLDivElement } {
            const menu = document.createElement('div');
            menu.className = 'cm-url-menu';

            menu.appendChild(createMenuItem('Open in browser', 'link-external', () => {
              onOpenUrl(url);
            }));

            menu.appendChild(createMenuItem('Copy to clipboard', 'copy', () => {
              copyToClipboard(url);
            }));

            if (onCreateRequest) {
              menu.appendChild(createMenuItem('Create new request', 'add', () => {
                onCreateRequest(url);
              }));
            }

            return { dom: menu };
          },
        } satisfies Tooltip;
      }
    }
    return null;
  }, {
    // Keep tooltip open when mouse moves from URL to the tooltip itself
    hideOnChange: true,
    hoverTime: 300,
  });
}

const urlBaseTheme = EditorView.baseTheme({
  '.cm-url-link': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--hf-textLink-foreground)',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
  '.cm-url-link:hover': {
    color: 'var(--hf-textLink-activeForeground)',
  },
  // Override CM tooltip wrapper styles
  '.cm-tooltip.cm-tooltip-hover': {
    border: 'none',
    backgroundColor: 'transparent',
    padding: '0',
  },
  '.cm-url-menu': {
    minWidth: '180px',
    padding: '4px 0',
    backgroundColor: 'var(--hf-menu-background)',
    color: 'var(--hf-menu-foreground)',
    border: '1px solid var(--hf-menu-border)',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    fontSize: '12px',
    fontFamily: 'var(--hf-font-family)',
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
    backgroundColor: 'var(--hf-menu-selectionBackground)',
    color: 'var(--hf-menu-selectionForeground)',
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
    urlHoverTooltip(opts.onOpenUrl, opts.onCreateRequest),
    urlBaseTheme,
  ];
}
