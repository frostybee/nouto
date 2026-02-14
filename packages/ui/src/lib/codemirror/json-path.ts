import { type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/**
 * Compute the JSON path at a given cursor position.
 * Returns a string like `$.store.books[0].title`
 */
export function computeJsonPath(state: typeof EditorView.prototype.state, pos: number): string {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, -1);

  const segments: string[] = [];

  while (node.parent) {
    const parent = node.parent;

    if (parent.name === 'Property') {
      // Find the PropertyName child to get the key
      const propName = parent.getChild('PropertyName');
      if (propName) {
        const raw = state.doc.sliceString(propName.from, propName.to);
        // Strip surrounding quotes
        const key = raw.replace(/^"|"$/g, '');
        segments.unshift('.' + key);
      }
      // Jump up past the Property node
      node = parent;
      continue;
    }

    if (parent.name === 'Array') {
      // Count preceding siblings to determine array index
      let index = 0;
      let sibling = parent.firstChild;
      while (sibling) {
        // Skip punctuation tokens: [ ] ,
        if (sibling.from >= node.from) break;
        if (sibling.name !== '[' && sibling.name !== ']' && sibling.name !== ',') {
          index++;
        }
        sibling = sibling.nextSibling;
      }
      segments.unshift(`[${index}]`);
    }

    node = parent;
  }

  return '$' + segments.join('');
}

/**
 * CodeMirror extension that fires a callback whenever the JSON path at the cursor changes.
 */
export function jsonPathExtension(opts: { onPathChange: (path: string) => void }): Extension {
  let lastPath = '';

  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;

    const pos = update.state.selection.main.head;
    const path = computeJsonPath(update.state, pos);

    if (path !== lastPath) {
      lastPath = path;
      opts.onPathChange(path);
    }
  });
}
