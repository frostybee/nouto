import { type EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { foldEffect, unfoldAll } from '@codemirror/language';
import { foldable } from '@codemirror/language';

/**
 * Fold all JSON nodes at or beyond a given depth.
 * Level 1 = only root keys visible, Level 2 = two levels deep, etc.
 */
export function foldToDepth(view: EditorView, maxDepth: number): void {
  // First unfold everything
  unfoldAll(view);

  // Parse the full document tree (timeout 5s for large docs)
  const tree = ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  if (!tree) return;

  const effects: ReturnType<typeof foldEffect.of>[] = [];

  tree.iterate({
    enter(node) {
      if (node.name !== 'Object' && node.name !== 'Array') return;

      // Count nesting depth by walking parents
      let depth = 0;
      let parent = node.node.parent;
      while (parent) {
        if (parent.name === 'Object' || parent.name === 'Array') {
          depth++;
        }
        parent = parent.parent;
      }

      // depth=0 means root object/array, depth=1 means one level in, etc.
      // maxDepth=1 means show root keys only -> fold nodes at depth >= 1
      if (depth >= maxDepth) {
        const range = foldable(view.state, node.from, node.to);
        if (range) {
          effects.push(foldEffect.of({ from: range.from, to: range.to }));
        }
        return false; // no need to recurse into already-folded nodes
      }
    },
  });

  if (effects.length > 0) {
    view.dispatch({ effects });
  }
}
