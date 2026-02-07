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

function urlHoverTooltip(onOpenUrl: (url: string) => void) {
  return hoverTooltip((view, pos) => {
    // Find the URL at this position by checking the decorations
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
        const url = match[0];
        return {
          pos: from,
          end: to,
          above: true,
          create() {
            const container = document.createElement('div');
            container.className = 'cm-url-tooltip';

            const urlText = document.createElement('span');
            urlText.className = 'cm-url-tooltip-text';
            urlText.textContent = url.length > 60 ? url.slice(0, 57) + '...' : url;
            container.appendChild(urlText);

            const actions = document.createElement('div');
            actions.className = 'cm-url-tooltip-actions';

            const openBtn = document.createElement('button');
            openBtn.textContent = 'Open';
            openBtn.className = 'cm-url-tooltip-btn';
            openBtn.onclick = (e) => {
              e.preventDefault();
              onOpenUrl(url);
            };
            actions.appendChild(openBtn);

            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copy';
            copyBtn.className = 'cm-url-tooltip-btn';
            copyBtn.onclick = (e) => {
              e.preventDefault();
              navigator.clipboard.writeText(url).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
              });
            };
            actions.appendChild(copyBtn);

            container.appendChild(actions);
            return { dom: container };
          },
        };
      }
    }
    return null;
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
  '.cm-url-tooltip': {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 10px',
    backgroundColor: 'var(--vscode-editorHoverWidget-background, #252526)',
    border: '1px solid var(--vscode-editorHoverWidget-border, #454545)',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'var(--vscode-font-family, sans-serif)',
    maxWidth: '400px',
  },
  '.cm-url-tooltip-text': {
    color: 'var(--vscode-textLink-foreground, #3794ff)',
    wordBreak: 'break-all',
    fontSize: '11px',
  },
  '.cm-url-tooltip-actions': {
    display: 'flex',
    gap: '6px',
  },
  '.cm-url-tooltip-btn': {
    padding: '2px 10px',
    fontSize: '11px',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    backgroundColor: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    color: 'var(--vscode-button-secondaryForeground, #d4d4d4)',
  },
  '.cm-url-tooltip-btn:hover': {
    backgroundColor: 'var(--vscode-button-secondaryHoverBackground, #45494e)',
  },
});

/**
 * Extension that makes URLs clickable with hover tooltips containing Open and Copy buttons.
 */
export function urlClickableExtension(opts: { onOpenUrl: (url: string) => void }): Extension {
  return [
    urlHighlightPlugin,
    urlHoverTooltip(opts.onOpenUrl),
    urlBaseTheme,
    tooltips({ position: 'absolute' }),
  ];
}
