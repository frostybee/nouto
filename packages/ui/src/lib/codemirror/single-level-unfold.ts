import { type EditorView } from '@codemirror/view';
import { ensureSyntaxTree, foldable } from '@codemirror/language';

/**
 * Find all direct child Object/Array nodes within a parent range.
 * Returns foldable ranges for each child.
 */
export function findChildFoldableRanges(
  view: EditorView,
  parentFrom: number,
  parentTo: number
): Array<{ from: number; to: number }> {
  const tree = ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  if (!tree) return [];

  const childRanges: Array<{ from: number; to: number }> = [];

  // Find the parent node at parentFrom
  const parentNode = tree.resolveInner(parentFrom, 1);
  if (!parentNode || (parentNode.name !== 'Object' && parentNode.name !== 'Array')) {
    return [];
  }

  // Iterate through direct children
  let child = parentNode.firstChild;
  while (child) {
    // For Objects: look for Property nodes, then their Object/Array values
    // For Arrays: look for direct Object/Array elements
    if (parentNode.name === 'Object' && child.name === 'Property') {
      // Property structure: PropertyName, ":", Value
      let valueNode = child.firstChild;
      while (valueNode) {
        if (valueNode.name === 'Object' || valueNode.name === 'Array') {
          const line = view.state.doc.lineAt(valueNode.from);
          const range = foldable(view.state, line.from, line.to);
          if (range) {
            childRanges.push(range);
          }
          break;
        }
        valueNode = valueNode.nextSibling;
      }
    } else if (parentNode.name === 'Array') {
      // In arrays, direct Object/Array children
      if (child.name === 'Object' || child.name === 'Array') {
        const line = view.state.doc.lineAt(child.from);
        const range = foldable(view.state, line.from, line.to);
        if (range) {
          childRanges.push(range);
        }
      }
    }
    child = child.nextSibling;
  }

  return childRanges;
}