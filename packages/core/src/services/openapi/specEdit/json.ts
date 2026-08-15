/**
 * JSON / JSONC spec-edit backend: a thin wrapper over jsonc-parser's
 * `modify()`, which localizes formatting, manages commas, and auto-creates
 * missing parent containers.
 */
import { modify, parseTree } from 'jsonc-parser';
import type { Edit as JsoncEdit, FormattingOptions, Node as JsonNode, Segment } from 'jsonc-parser';
import { documentEol, rootSectionRank } from './shared';
import type { SpecDocument, SpecTextEdit } from './shared';

function parseJsonTree(text: string): JsonNode | undefined {
  return parseTree(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: true,
  }) ?? undefined;
}

function jsonChild(node: JsonNode, segment: string): JsonNode | undefined {
  if (node.type === 'array') {
    if (!/^\d+$/.test(segment)) return undefined;
    return node.children?.[Number(segment)];
  }
  if (node.type === 'object') {
    for (const property of node.children ?? []) {
      if (property.type !== 'property' || !property.children?.length) continue;
      if (String(property.children[0].value ?? '') === segment) return property.children[1];
    }
  }
  return undefined;
}

/**
 * Converts pointer segments into a jsonc-parser path against the actual tree:
 * numeric segments become array indices only where the document really has an
 * array (object keys like `'200'` stay strings). Missing tail segments are
 * assumed to be object keys — `modify()` creates those containers itself.
 * Returns undefined when a resolved segment lands on a primitive with more
 * segments to go, or (`requireExisting`) when the full path does not resolve.
 */
function toJsoncPath(
  root: JsonNode | undefined,
  segments: string[],
  requireExisting: boolean
): Segment[] | undefined {
  const path: Segment[] = [];
  let node = root;
  for (const segment of segments) {
    if (!node) {
      if (requireExisting) return undefined;
      path.push(segment);
      continue;
    }
    if (node.type !== 'object' && node.type !== 'array') return undefined;
    path.push(node.type === 'array' ? Number(segment) : segment);
    node = jsonChild(node, segment);
  }
  if (requireExisting && !node) return undefined;
  return path;
}

/**
 * When the insert will create a brand-new root-level key (the first pointer
 * segment does not resolve), returns a `getInsertionIndex` placing it at its
 * canonical position among the existing root properties. `modify()` performs
 * its property insertion at the deepest existing ancestor — the root, in
 * exactly this case — so the callback applies to the right object.
 */
function rootInsertionIndex(
  root: JsonNode | undefined,
  segments: string[]
): ((properties: string[]) => number) | undefined {
  const key = segments[0];
  if (key === undefined || !root || root.type !== 'object') return undefined;
  if (jsonChild(root, key) !== undefined) return undefined;
  const rank = rootSectionRank(key);
  if (rank === -1) return undefined;
  return (properties) => {
    let index = properties.length;
    for (let at = properties.length - 1; at >= 0; at--) {
      const propertyRank = rootSectionRank(properties[at]);
      if (propertyRank !== -1 && propertyRank <= rank) return at + 1;
      index = at;
    }
    return index;
  };
}

function detectJsonFormatting(doc: SpecDocument): FormattingOptions {
  const text = doc.text;
  const match = /\r?\n([ \t]+)\S/.exec(text);
  const indent = match?.[1];
  const insertSpaces = !indent?.includes('\t');
  return {
    tabSize: insertSpaces && indent ? Math.min(Math.max(indent.length, 1), 8) : insertSpaces ? 2 : 4,
    insertSpaces,
    eol: documentEol(doc),
  };
}

function jsoncEditsToTextEdits(edits: JsoncEdit[]): SpecTextEdit[] {
  return edits.map((change) => ({
    offset: change.offset,
    length: change.length,
    text: change.content,
  }));
}

export function jsonDelete(doc: SpecDocument, segments: string[]): SpecTextEdit[] | undefined {
  const text = doc.text;
  const path = toJsoncPath(parseJsonTree(text), segments, true);
  if (!path) return undefined;
  const edits = modify(text, path, undefined, {
    formattingOptions: detectJsonFormatting(doc),
  });
  return edits.length ? jsoncEditsToTextEdits(edits) : undefined;
}

export function jsonInsertMember(
  doc: SpecDocument,
  parentSegments: string[],
  key: string,
  value: unknown
): SpecTextEdit[] | undefined {
  const text = doc.text;
  const root = parseJsonTree(text);
  const path = toJsoncPath(root, parentSegments, false);
  if (!path) return undefined;
  // Refuse to overwrite: `modify()` would silently replace an existing member.
  if (root && toJsoncPath(root, [...parentSegments, key], true)) return undefined;
  const edits = modify(text, [...path, key], value, {
    formattingOptions: detectJsonFormatting(doc),
    getInsertionIndex: rootInsertionIndex(root, parentSegments.length ? parentSegments : [key]),
  });
  return edits.length ? jsoncEditsToTextEdits(edits) : undefined;
}

export function jsonInsertArrayItem(
  doc: SpecDocument,
  parentSegments: string[],
  value: unknown
): SpecTextEdit[] | undefined {
  const text = doc.text;
  const root = parseJsonTree(text);
  const path = toJsoncPath(root, parentSegments, false);
  if (!path) return undefined;
  const edits = modify(text, [...path, -1], value, {
    formattingOptions: detectJsonFormatting(doc),
    isArrayInsertion: true,
    getInsertionIndex: rootInsertionIndex(root, parentSegments),
  });
  return edits.length ? jsoncEditsToTextEdits(edits) : undefined;
}

export function jsonArrayLength(doc: SpecDocument, segments: string[]): number | undefined {
  const root = parseJsonTree(doc.text);
  let node = root;
  for (const segment of segments) {
    if (!node) return 0;
    if (node.type !== 'object' && node.type !== 'array') return undefined;
    node = jsonChild(node, segment);
  }
  if (!node) return 0;
  if (node.type === 'array') return node.children?.length ?? 0;
  return undefined;
}

function jsonNodeAt(root: JsonNode | undefined, segments: string[]): JsonNode | undefined {
  let node = root;
  for (const segment of segments) {
    if (!node || (node.type !== 'object' && node.type !== 'array')) return undefined;
    node = jsonChild(node, segment);
  }
  return node;
}

export function jsonSetScalar(
  doc: SpecDocument,
  segments: string[],
  value: string | number | boolean
): SpecTextEdit[] | undefined {
  const text = doc.text;
  const root = parseJsonTree(text);
  const node = jsonNodeAt(root, segments);
  if (!node || node.type === 'object' || node.type === 'array') return undefined;
  const path = toJsoncPath(root, segments, true);
  if (!path) return undefined;
  const edits = modify(text, path, value, { formattingOptions: detectJsonFormatting(doc) });
  return edits.length ? jsoncEditsToTextEdits(edits) : undefined;
}

/**
 * Replaces the key of the property at `segments` with `newKey`, keeping the
 * property's position and value. `modify()` has no rename operation, so this
 * targets the key token directly. Refuses when the parent is not an object,
 * the property is missing, or `newKey` already exists.
 */
export function jsonRenameKey(
  doc: SpecDocument,
  segments: string[],
  newKey: string
): SpecTextEdit[] | undefined {
  const root = parseJsonTree(doc.text);
  const parent = jsonNodeAt(root, segments.slice(0, -1));
  if (!parent || parent.type !== 'object') return undefined;
  const last = segments[segments.length - 1];
  let keyNode: JsonNode | undefined;
  for (const property of parent.children ?? []) {
    if (property.type !== 'property' || !property.children?.length) continue;
    const key = String(property.children[0].value ?? '');
    if (key === newKey) return undefined;
    if (key === last) keyNode = property.children[0];
  }
  if (!keyNode) return undefined;
  return [{ offset: keyNode.offset, length: keyNode.length, text: JSON.stringify(newKey) }];
}
