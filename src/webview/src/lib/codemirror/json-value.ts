import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

const VALUE_NODE_NAMES = new Set([
  'String', 'Number', 'True', 'False', 'Null', 'Object', 'Array',
]);

/**
 * Extract the JSON value text at a given cursor position.
 * For Property nodes, returns the value child (not the key).
 */
export function getJsonValueAtPosition(state: EditorState, pos: number): string | null {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, -1);

  // Walk up to find a value node
  while (node) {
    if (VALUE_NODE_NAMES.has(node.name)) {
      return state.doc.sliceString(node.from, node.to);
    }

    // If we're inside a Property, grab the value child directly
    if (node.name === 'Property') {
      // Value is the last non-punctuation child (after the colon)
      let child = node.lastChild;
      while (child) {
        if (VALUE_NODE_NAMES.has(child.name)) {
          return state.doc.sliceString(child.from, child.to);
        }
        child = child.prevSibling;
      }
    }

    // If we're on PropertyName, go up to Property and extract the value
    if (node.name === 'PropertyName' && node.parent?.name === 'Property') {
      const prop = node.parent;
      let child = prop.lastChild;
      while (child) {
        if (VALUE_NODE_NAMES.has(child.name)) {
          return state.doc.sliceString(child.from, child.to);
        }
        child = child.prevSibling;
      }
    }

    node = node.parent!;
  }

  return null;
}
