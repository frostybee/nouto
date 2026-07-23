import * as vscode from 'vscode';
import { buildJsonPointer, parseJsonPointer } from '@nouto/core/services';
import { modify, parseTree } from 'jsonc-parser';
import type { Edit as JsoncEdit, FormattingOptions, Node as JsonNode, Segment } from 'jsonc-parser';
import { isMap, isPair, isScalar, isSeq, parseDocument, stringify as yamlStringify } from 'yaml';
import type { Node as YamlNode, Pair, YAMLMap, YAMLSeq } from 'yaml';

/**
 * Targeted OpenAPI spec mutations for the outline context-menu commands.
 *
 * Both backends produce minimal `WorkspaceEdit`s against the live document so
 * a single Ctrl+Z undoes the whole action:
 * - JSON/JSONC delegates to jsonc-parser's `modify()`, which localizes
 *   formatting, manages commas, and auto-creates missing parent containers.
 * - YAML splices hand-indented fragments into the block structure resolved
 *   from the `yaml` package AST. The document is never re-stringified as a
 *   whole — existing formatting, comments, and quoting stay untouched.
 *
 * All planners return `undefined` when the edit cannot be applied safely
 * (target missing, pointer traversing a primitive, or — YAML only — a
 * flow-style `{...}`/`[...]` collection with items, which line-based splicing
 * cannot extend without risking malformed output).
 */

export interface SpecEditResult {
  edit: vscode.WorkspaceEdit;
  /** Pointer of the inserted node, computed up front for post-edit reveal. */
  insertedPointer: string;
}

/** Plans the removal of the value at `pointer`, including its key/entry. */
export function planDeleteAtPointer(
  document: vscode.TextDocument,
  pointer: string
): vscode.WorkspaceEdit | undefined {
  const segments = parseJsonPointer(pointer);
  if (!segments?.length) return undefined;
  return document.languageId === 'yaml'
    ? yamlDelete(document, segments)
    : jsonDelete(document, segments);
}

/**
 * Plans inserting `key: value` into the object at `parentPointer`, creating
 * missing intermediate objects (e.g. absent `components.schemas`) on the way.
 */
export function planInsertObjectMember(
  document: vscode.TextDocument,
  parentPointer: string,
  key: string,
  value: unknown
): SpecEditResult | undefined {
  const segments = parseJsonPointer(parentPointer);
  if (!segments) return undefined;
  const edit = document.languageId === 'yaml'
    ? yamlInsert(document, segments, { kind: 'member', key, value })
    : jsonInsertMember(document, segments, key, value);
  if (!edit) return undefined;
  return { edit, insertedPointer: buildJsonPointer([...segments, key]) };
}

/**
 * Plans appending `value` to the array at `parentPointer`, creating the array
 * (and missing ancestors) when absent.
 */
export function planInsertArrayItem(
  document: vscode.TextDocument,
  parentPointer: string,
  value: unknown
): SpecEditResult | undefined {
  const segments = parseJsonPointer(parentPointer);
  if (!segments) return undefined;
  const index = document.languageId === 'yaml'
    ? yamlArrayLength(document, segments)
    : jsonArrayLength(document, segments);
  if (index === undefined) return undefined;
  const edit = document.languageId === 'yaml'
    ? yamlInsert(document, segments, { kind: 'item', value })
    : jsonInsertArrayItem(document, segments, value);
  if (!edit) return undefined;
  return { edit, insertedPointer: buildJsonPointer([...segments, String(index)]) };
}

/**
 * Plans replacing the existing scalar value at `pointer` with `value`. Used by
 * quick fixes that rewrite a leaf in place (e.g. uniquifying a duplicate
 * operationId). Returns undefined when the pointer is empty/missing or does
 * not resolve to a scalar (objects and arrays are never overwritten).
 */
export function planSetScalarAtPointer(
  document: vscode.TextDocument,
  pointer: string,
  value: string | number | boolean
): vscode.WorkspaceEdit | undefined {
  const segments = parseJsonPointer(pointer);
  if (!segments?.length) return undefined;
  return document.languageId === 'yaml'
    ? yamlSetScalar(document, segments, value)
    : jsonSetScalar(document, segments, value);
}

// --------------------------------------------------------------------------
// Shared text helpers
// --------------------------------------------------------------------------

/**
 * Conventional ordering of root-level OpenAPI sections. A newly created root
 * key is inserted after the last existing key that precedes it in this list
 * (e.g. a first `paths:` lands after `tags:`, not at the document end).
 * Unknown keys — extensions and typos — never anchor an insertion.
 */
const ROOT_SECTION_ORDER = [
  'openapi',
  'jsonSchemaDialect',
  'info',
  'externalDocs',
  'servers',
  'security',
  'tags',
  'paths',
  'webhooks',
  'components',
];

function rootSectionRank(key: string): number {
  return ROOT_SECTION_ORDER.indexOf(key);
}

function documentEol(document: vscode.TextDocument): string {
  return document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
}

/** Offset of the first character of the line containing `offset`. */
function lineStartOffset(text: string, offset: number): number {
  const at = Math.min(Math.max(offset, 0), text.length);
  const newline = text.lastIndexOf('\n', at - 1);
  return newline === -1 ? 0 : newline + 1;
}

/** Offset just past the newline that ends the line containing `offset`. */
function nextLineStartOffset(text: string, offset: number): number {
  const newline = text.indexOf('\n', Math.min(Math.max(offset, 0), text.length));
  return newline === -1 ? text.length : newline + 1;
}

/**
 * Normalizes a yaml-AST end offset to the start of the following line. Block
 * collection ranges already extend past their trailing newline while scalar
 * ranges stop before it; advancing blindly would eat one extra line.
 */
function endOfEntryLines(text: string, offset: number): number {
  return offset > 0 && text[offset - 1] === '\n' ? offset : nextLineStartOffset(text, offset);
}

/** End of the line's content (excludes the trailing `\r?\n`). */
function lineContentEndOffset(text: string, offset: number): number {
  const next = nextLineStartOffset(text, offset);
  if (next === text.length && text[next - 1] !== '\n') return next;
  return text[next - 2] === '\r' ? next - 2 : next - 1;
}

function indentColumnAt(text: string, offset: number): number {
  const start = lineStartOffset(text, offset);
  let column = 0;
  while (text[start + column] === ' ') column++;
  return column;
}

function singleEdit(
  document: vscode.TextDocument,
  from: number,
  to: number,
  newText: string
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.set(document.uri, [
    vscode.TextEdit.replace(
      new vscode.Range(document.positionAt(from), document.positionAt(to)),
      newText
    ),
  ]);
  return edit;
}

// --------------------------------------------------------------------------
// JSON / JSONC backend (jsonc-parser)
// --------------------------------------------------------------------------

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

function detectJsonFormatting(document: vscode.TextDocument): FormattingOptions {
  const text = document.getText();
  const match = /\r?\n([ \t]+)\S/.exec(text);
  const indent = match?.[1];
  const insertSpaces = !indent?.includes('\t');
  return {
    tabSize: insertSpaces && indent ? Math.min(Math.max(indent.length, 1), 8) : insertSpaces ? 2 : 4,
    insertSpaces,
    eol: documentEol(document),
  };
}

function jsoncEditsToWorkspaceEdit(
  document: vscode.TextDocument,
  edits: JsoncEdit[]
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.set(
    document.uri,
    edits.map((change) => vscode.TextEdit.replace(
      new vscode.Range(
        document.positionAt(change.offset),
        document.positionAt(change.offset + change.length)
      ),
      change.content
    ))
  );
  return edit;
}

function jsonDelete(
  document: vscode.TextDocument,
  segments: string[]
): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const path = toJsoncPath(parseJsonTree(text), segments, true);
  if (!path) return undefined;
  const edits = modify(text, path, undefined, {
    formattingOptions: detectJsonFormatting(document),
  });
  return edits.length ? jsoncEditsToWorkspaceEdit(document, edits) : undefined;
}

function jsonInsertMember(
  document: vscode.TextDocument,
  parentSegments: string[],
  key: string,
  value: unknown
): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const root = parseJsonTree(text);
  const path = toJsoncPath(root, parentSegments, false);
  if (!path) return undefined;
  // Refuse to overwrite: `modify()` would silently replace an existing member.
  if (root && toJsoncPath(root, [...parentSegments, key], true)) return undefined;
  const edits = modify(text, [...path, key], value, {
    formattingOptions: detectJsonFormatting(document),
    getInsertionIndex: rootInsertionIndex(root, parentSegments.length ? parentSegments : [key]),
  });
  return edits.length ? jsoncEditsToWorkspaceEdit(document, edits) : undefined;
}

function jsonInsertArrayItem(
  document: vscode.TextDocument,
  parentSegments: string[],
  value: unknown
): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const root = parseJsonTree(text);
  const path = toJsoncPath(root, parentSegments, false);
  if (!path) return undefined;
  const edits = modify(text, [...path, -1], value, {
    formattingOptions: detectJsonFormatting(document),
    isArrayInsertion: true,
    getInsertionIndex: rootInsertionIndex(root, parentSegments),
  });
  return edits.length ? jsoncEditsToWorkspaceEdit(document, edits) : undefined;
}

function jsonArrayLength(
  document: vscode.TextDocument,
  segments: string[]
): number | undefined {
  const root = parseJsonTree(document.getText());
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

function jsonSetScalar(
  document: vscode.TextDocument,
  segments: string[],
  value: string | number | boolean
): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const root = parseJsonTree(text);
  const node = jsonNodeAt(root, segments);
  if (!node || node.type === 'object' || node.type === 'array') return undefined;
  const path = toJsoncPath(root, segments, true);
  if (!path) return undefined;
  const edits = modify(text, path, value, { formattingOptions: detectJsonFormatting(document) });
  return edits.length ? jsoncEditsToWorkspaceEdit(document, edits) : undefined;
}

// --------------------------------------------------------------------------
// YAML backend (yaml package AST + hand-computed splices)
// --------------------------------------------------------------------------

interface YamlStyle {
  indentUnit: number;
  indentSeq: boolean;
  eol: string;
}

function detectYamlStyle(document: vscode.TextDocument): YamlStyle {
  const text = document.getText();
  let indentUnit = 0;
  let indentSeq: boolean | undefined;
  let previousIndent = 0;
  let previousWasKey = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const isDash = line.trimStart().startsWith('- ') || line.trimStart() === '-';
    if (!indentUnit && !isDash && indent > previousIndent) indentUnit = indent - previousIndent;
    if (indentSeq === undefined && isDash && previousWasKey) indentSeq = indent > previousIndent;
    previousIndent = indent;
    previousWasKey = !isDash && /:\s*(#.*)?$/.test(line);
    if (indentUnit && indentSeq !== undefined) break;
  }
  return {
    indentUnit: indentUnit || 2,
    indentSeq: indentSeq ?? true,
    eol: documentEol(document),
  };
}

function yamlPairKey(pair: Pair): string {
  const key = pair.key as { toJSON?: () => unknown; value?: unknown } | null;
  const value = key?.toJSON ? key.toJSON() : key?.value;
  return String(value ?? '');
}

function yamlRangeOf(node: unknown): [number, number] | undefined {
  const range = (node as { range?: [number, number, number] } | null)?.range;
  return range ? [range[0], range[1]] : undefined;
}

/** End offset of a pair's content: its value when present, its key otherwise. */
function yamlPairEnd(pair: Pair): number | undefined {
  return yamlRangeOf(pair.value)?.[1] ?? yamlRangeOf(pair.key)?.[1];
}

function isEmptyYamlValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (isScalar(value)) return value.value === null || value.value === undefined;
  if ((isMap(value) || isSeq(value))) return value.items.length === 0;
  return false;
}

type YamlInsertRequest =
  | { kind: 'member'; key: string; value: unknown }
  | { kind: 'item'; value: unknown };

type YamlResolution =
  /** Every parent segment resolved to a block collection with items. */
  | { kind: 'container'; container: YAMLMap | YAMLSeq; remaining: string[] }
  /** A segment resolved to an empty value (`key:`, `{}`, `[]`) to convert. */
  | { kind: 'empty'; pair: Pair; remaining: string[] }
  | { kind: 'unsupported' };

function resolveYamlParent(root: YamlNode | null, segments: string[]): YamlResolution {
  if (!isMap(root)) return { kind: 'unsupported' };
  let current: YAMLMap | YAMLSeq = root;
  for (let index = 0; index < segments.length; index++) {
    if (current.flow) {
      // A flow collection with items cannot be extended line-wise.
      return { kind: 'unsupported' };
    }
    const segment = segments[index];
    if (isMap(current)) {
      const pair = current.items.find(
        (item): item is Pair => isPair(item) && yamlPairKey(item) === segment
      );
      if (!pair) return { kind: 'container', container: current, remaining: segments.slice(index) };
      if (isEmptyYamlValue(pair.value)) {
        return { kind: 'empty', pair, remaining: segments.slice(index + 1) };
      }
      const value = pair.value;
      if (!isMap(value) && !isSeq(value)) return { kind: 'unsupported' };
      current = value;
    } else {
      const item = /^\d+$/.test(segment) ? current.items[Number(segment)] : undefined;
      if (!isMap(item) && !isSeq(item)) return { kind: 'unsupported' };
      current = item;
    }
  }
  if (current.flow) return { kind: 'unsupported' };
  return { kind: 'container', container: current, remaining: [] };
}

/** Wraps `leaf` in nested single-key objects for each missing segment. */
function nestForSegments(segments: string[], leaf: unknown): unknown {
  return segments.reduceRight<unknown>((inner, segment) => ({ [segment]: inner }), leaf);
}

function serializeYamlFragment(
  fragment: unknown,
  style: YamlStyle,
  indentColumns: number
): string {
  const raw = yamlStringify(fragment, {
    indent: style.indentUnit,
    indentSeq: style.indentSeq,
    lineWidth: 0,
  });
  const pad = ' '.repeat(indentColumns);
  return raw
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => (line.length ? pad + line : line))
    .join(style.eol);
}

function yamlInsert(
  document: vscode.TextDocument,
  parentSegments: string[],
  request: YamlInsertRequest
): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const style = detectYamlStyle(document);
  const doc = parseDocument(text, { strict: false });
  const resolution = resolveYamlParent(doc.contents as YamlNode | null, parentSegments);
  if (resolution.kind === 'unsupported') return undefined;

  // The payload the deepest resolved location receives: either the raw value
  // wrapped in nested objects for missing segments, or — with no missing
  // segments — the leaf member/array-item itself.
  const leaf = request.kind === 'member' ? { [request.key]: request.value } : [request.value];

  if (resolution.kind === 'empty') {
    const { pair, remaining } = resolution;
    const keyEnd = yamlRangeOf(pair.key)?.[1];
    if (keyEnd === undefined) return undefined;
    const keyColumn = indentColumnAt(text, keyEnd);
    const fragment = nestForSegments(remaining, leaf);
    const isSeqFragment = remaining.length === 0 && request.kind === 'item';
    const childColumn = isSeqFragment && !style.indentSeq ? keyColumn : keyColumn + style.indentUnit;
    const block = serializeYamlFragment(fragment, style, childColumn);
    // Replace from the key's end through the empty value (or line content when
    // the value is absent), re-adding the colon the replacement consumes.
    const valueEnd = yamlRangeOf(pair.value)?.[1] ?? lineContentEndOffset(text, keyEnd);
    return singleEdit(document, keyEnd, valueEnd, `:${style.eol}${block}`);
  }

  const { container, remaining } = resolution;
  if (remaining.length === 0 && request.kind === 'item' && !isSeq(container)) return undefined;
  if ((remaining.length > 0 || request.kind === 'member') && !isMap(container)) return undefined;
  if (remaining.length === 0 && request.kind === 'member' && isMap(container)) {
    const exists = container.items.some(
      (item) => isPair(item) && yamlPairKey(item) === request.key
    );
    if (exists) return undefined;
  }

  const fragment = remaining.length ? nestForSegments(remaining, leaf) : leaf;
  const items = container.items as unknown[];
  if (!items.length) {
    // A block collection always has at least one item; an empty container is
    // only reachable as the document root of an effectively empty file.
    const block = serializeYamlFragment(fragment, style, 0);
    const needsLeadingEol = text.length > 0 && !text.endsWith('\n');
    return singleEdit(
      document,
      text.length,
      text.length,
      `${needsLeadingEol ? style.eol : ''}${block}${style.eol}`
    );
  }

  // Default anchor: the container's last entry. When a brand-new root section
  // is being created, anchor at its canonical position instead.
  let anchor = items[items.length - 1];
  if (container === doc.contents && remaining.length > 0) {
    const rank = rootSectionRank(remaining[0]);
    if (rank !== -1) {
      let canonical: unknown;
      for (const item of items) {
        if (!isPair(item)) continue;
        const itemRank = rootSectionRank(yamlPairKey(item));
        if (itemRank !== -1 && itemRank <= rank) canonical = item;
      }
      if (canonical !== undefined) anchor = canonical;
    }
  }
  const anchorStart = isPair(anchor) ? yamlRangeOf(anchor.key)?.[0] : yamlRangeOf(anchor)?.[0];
  const anchorEnd = isPair(anchor) ? yamlPairEnd(anchor) : yamlRangeOf(anchor)?.[1];
  if (anchorStart === undefined || anchorEnd === undefined) return undefined;
  const childColumn = indentColumnAt(text, anchorStart);
  const block = serializeYamlFragment(fragment, style, childColumn);
  const insertAt = endOfEntryLines(text, anchorEnd);
  const needsLeadingEol = insertAt === text.length && !text.endsWith('\n');
  return singleEdit(
    document,
    insertAt,
    insertAt,
    `${needsLeadingEol ? style.eol : ''}${block}${style.eol}`
  );
}

function yamlDelete(
  document: vscode.TextDocument,
  segments: string[]
): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const doc = parseDocument(text, { strict: false });
  let current: YamlNode | null = doc.contents as YamlNode | null;
  for (const segment of segments.slice(0, -1)) {
    if (isMap(current)) {
      const pair: Pair | undefined = current.items.find(
        (item): item is Pair => isPair(item) && yamlPairKey(item) === segment
      );
      current = (pair?.value as YamlNode | null) ?? null;
    } else if (isSeq(current)) {
      current = /^\d+$/.test(segment)
        ? ((current.items[Number(segment)] as YamlNode | null) ?? null)
        : null;
    } else {
      return undefined;
    }
  }

  const last = segments[segments.length - 1];
  let start: number | undefined;
  let contentEnd: number | undefined;
  if (isMap(current)) {
    if (current.flow) return undefined;
    const pair = current.items.find(
      (item): item is Pair => isPair(item) && yamlPairKey(item) === last
    );
    const keyStart = pair && yamlRangeOf(pair.key)?.[0];
    if (!pair || keyStart === undefined) return undefined;
    start = lineStartOffset(text, keyStart);
    contentEnd = yamlPairEnd(pair);
  } else if (isSeq(current)) {
    if (current.flow) return undefined;
    const item = /^\d+$/.test(last) ? current.items[Number(last)] : undefined;
    const range = yamlRangeOf(item);
    if (!range) return undefined;
    start = lineStartOffset(text, range[0]);
    contentEnd = range[1];
  } else {
    return undefined;
  }
  if (start === undefined || contentEnd === undefined) return undefined;
  // Remove through the end of the entry's last content line; standalone
  // comment lines between siblings are left in place.
  return singleEdit(document, start, endOfEntryLines(text, contentEnd), '');
}

function yamlArrayLength(
  document: vscode.TextDocument,
  segments: string[]
): number | undefined {
  const doc = parseDocument(document.getText(), { strict: false });
  let current: YamlNode | null = doc.contents as YamlNode | null;
  for (const segment of segments) {
    if (isMap(current)) {
      const pair = current.items.find(
        (item): item is Pair => isPair(item) && yamlPairKey(item) === segment
      );
      if (!pair) return 0;
      if (isEmptyYamlValue(pair.value)) return 0;
      current = pair.value as YamlNode | null;
    } else if (isSeq(current)) {
      current = /^\d+$/.test(segment)
        ? ((current.items[Number(segment)] as YamlNode | null) ?? null)
        : null;
    } else {
      return undefined;
    }
  }
  if (isSeq(current)) return current.items.length;
  if (current === null) return 0;
  return undefined;
}

function yamlSetScalar(
  document: vscode.TextDocument,
  segments: string[],
  value: string | number | boolean
): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const doc = parseDocument(text, { strict: false });
  let current: YamlNode | null = doc.contents as YamlNode | null;
  for (const segment of segments.slice(0, -1)) {
    if (isMap(current)) {
      const pair = current.items.find(
        (item): item is Pair => isPair(item) && yamlPairKey(item) === segment
      );
      current = (pair?.value as YamlNode | null) ?? null;
    } else if (isSeq(current)) {
      current = /^\d+$/.test(segment)
        ? ((current.items[Number(segment)] as YamlNode | null) ?? null)
        : null;
    } else {
      return undefined;
    }
  }

  const last = segments[segments.length - 1];
  let valueNode: unknown;
  if (isMap(current)) {
    const pair = current.items.find(
      (item): item is Pair => isPair(item) && yamlPairKey(item) === last
    );
    if (!pair) return undefined;
    valueNode = pair.value;
  } else if (isSeq(current)) {
    valueNode = /^\d+$/.test(last) ? current.items[Number(last)] : undefined;
  } else {
    return undefined;
  }

  if (!isScalar(valueNode)) return undefined;
  const range = yamlRangeOf(valueNode);
  if (!range) return undefined;
  const serialized = yamlStringify(value, { lineWidth: 0 }).replace(/\n$/, '');
  return singleEdit(document, range[0], range[1], serialized);
}
