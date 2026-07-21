import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState, Text } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { jsonPointerForPosition, resolveTokenName } from 'codemirror-json-schema';

/**
 * JSON Pointer <-> text offset mapping for JSON and YAML documents over the
 * CodeMirror Lezer syntax trees.
 *
 * offset->pointer reuses codemirror-json-schema's jsonPointerForPosition.
 * The full pointer map is built here instead of with the library's
 * getJsonPointers because that map only covers object properties (no array
 * items) and mis-reports JSON value ranges (it assumes the value is the
 * PropertyName's direct next sibling, which is the ':' token in current
 * @codemirror/lang-json trees).
 */

export type PointerDocMode = 'json' | 'yaml';

// Mirrors codemirror-json-schema@0.7.9's internal MODES (dist/constants.js):
// JSON is 'json4', YAML is 'yaml'. The MODES constant is not part of the
// package's public exports — re-verify these literals on upgrade.
const CM_MODE: Record<PointerDocMode, 'json4' | 'yaml'> = {
  json: 'json4',
  yaml: 'yaml',
};

/** Give the parser up to this long to finish large documents before mapping. */
const PARSE_TIMEOUT_MS = 200;

// Resolved (mode-independent) token names, matching codemirror-json-schema's
// TOKENS constants.
const PROPERTY = 'Property';
const PROPERTY_NAME = 'PropertyName';
const OBJECT = 'Object';
const ARRAY = 'Array';
const VALUE_TOKENS = new Set(['String', 'Number', 'True', 'False', 'Null', OBJECT, ARRAY, 'Item']);

export interface PointerRange {
  /** Range of the key token (for array items: the item value itself). */
  keyFrom: number;
  keyTo: number;
  /** Range of the value node, when one exists. */
  valueFrom?: number;
  valueTo?: number;
}

export interface PointerMap {
  mode: PointerDocMode;
  pointers: ReadonlyMap<string, PointerRange>;
}

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function stripQuotes(text: string): string {
  return text.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    result.push(child);
  }
  return result;
}

/**
 * Full-document scan producing every pointer's key/value offsets (object
 * properties AND array items). O(n) — call after debounced content settles or
 * on click-driven actions, not per keystroke.
 */
export function buildPointerMap(state: EditorState, mode: PointerDocMode): PointerMap {
  const cmMode = CM_MODE[mode];
  ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS);
  const pointers = new Map<string, PointerRange>();
  const doc = state.doc;

  const resolved = (node: SyntaxNode): string => resolveTokenName(node.name, cmMode);

  const visitProperty = (property: SyntaxNode, parentPointer: string): void => {
    const childNodes = children(property);
    const keyNode = childNodes.find((child) => resolved(child) === PROPERTY_NAME);
    if (!keyNode) return;
    const valueNode = [...childNodes]
      .reverse()
      .find((child) => child !== keyNode && VALUE_TOKENS.has(resolved(child)));
    const key = escapeSegment(stripQuotes(sliceText(doc, keyNode)));
    const pointer = `${parentPointer}/${key}`;
    pointers.set(pointer, {
      keyFrom: keyNode.from,
      keyTo: keyNode.to,
      ...(valueNode ? { valueFrom: valueNode.from, valueTo: valueNode.to } : {}),
    });
    if (valueNode) walk(valueNode, pointer);
  };

  const walk = (node: SyntaxNode, pointer: string): void => {
    if (resolved(node) === ARRAY) {
      let index = 0;
      for (const child of children(node)) {
        if (VALUE_TOKENS.has(resolved(child))) {
          const itemPointer = `${pointer}/${index}`;
          pointers.set(itemPointer, {
            keyFrom: child.from,
            keyTo: child.to,
            valueFrom: child.from,
            valueTo: child.to,
          });
          walk(child, itemPointer);
          index++;
        }
      }
      return;
    }
    for (const child of children(node)) {
      if (resolved(child) === PROPERTY) {
        visitProperty(child, pointer);
      } else {
        // Pass through structural wrappers (JsonText/Stream/Document/Object)
        walk(child, pointer);
      }
    }
  };

  walk(syntaxTree(state).topNode, '');
  return { mode, pointers };
}

function sliceText(doc: Text, node: SyntaxNode): string {
  return doc.sliceString(node.from, node.to);
}

/**
 * Pointer for a single document offset. Cheap (single tree-node resolve) —
 * safe on every cursor move. Returns '' at the document root.
 *
 * Side follows Lezer resolve() semantics; the default -1 matches a cursor
 * sitting AFTER the character it refers to (typical editing position).
 */
export function offsetToPointer(
  state: EditorState,
  offset: number,
  mode: PointerDocMode,
  side: -1 | 0 | 1 = -1
): string {
  ensureSyntaxTree(state, Math.min(state.doc.length, offset + 1), PARSE_TIMEOUT_MS);
  return jsonPointerForPosition(state, offset, side, CM_MODE[mode]);
}

export function pointerToOffset(map: PointerMap, pointer: string): PointerRange | null {
  return map.pointers.get(pointer) ?? null;
}
