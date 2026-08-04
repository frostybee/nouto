import { buildPointer, parsePointer } from './pointer';
import { modify, parseTree } from 'jsonc-parser';
import type { Edit as JsoncEdit, FormattingOptions, Node as JsonNode, Segment } from 'jsonc-parser';
import { isMap, isPair, isScalar, isSeq, parseDocument, stringify as yamlStringify } from 'yaml';
import type { Node as YamlNode, Pair, YAMLMap, YAMLSeq } from 'yaml';

/**
 * Targeted OpenAPI spec mutations for outline context-menu commands and quick
 * fixes. Platform-agnostic: planners operate on raw text plus a format tag and
 * return plain `{offset, length, text}` edits (UTF-16 offsets) that hosts
 * convert to their own edit types (VS Code `WorkspaceEdit`, CodeMirror
 * changes, Monaco `executeEdits`).
 *
 * Both backends produce minimal edits against the live text so a single undo
 * reverts the whole action:
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

/** One text replacement: replace `length` UTF-16 units at `offset` with `text`. */
export interface SpecTextEdit {
  offset: number;
  length: number;
  text: string;
}

export type SpecDocumentFormat = 'json' | 'yaml';

/** The document a planner operates on: raw text plus its format. */
export interface SpecDocument {
  text: string;
  format: SpecDocumentFormat;
  /** Line ending for inserted lines. Detected from `text` when omitted. */
  eol?: '\n' | '\r\n';
}

export interface SpecEditPlan {
  edits: SpecTextEdit[];
  /** Pointer of the inserted node, computed up front for post-edit reveal. */
  insertedPointer: string;
}

/** Plans the removal of the value at `pointer`, including its key/entry. */
export function planDeleteAtPointer(
  doc: SpecDocument,
  pointer: string
): SpecTextEdit[] | undefined {
  const segments = parsePointer(pointer);
  if (!segments?.length) return undefined;
  return doc.format === 'yaml'
    ? yamlDelete(doc, segments)
    : jsonDelete(doc, segments);
}

/**
 * Plans inserting `key: value` into the object at `parentPointer`, creating
 * missing intermediate objects (e.g. absent `components.schemas`) on the way.
 */
export function planInsertObjectMember(
  doc: SpecDocument,
  parentPointer: string,
  key: string,
  value: unknown
): SpecEditPlan | undefined {
  const segments = parsePointer(parentPointer);
  if (!segments) return undefined;
  const edits = doc.format === 'yaml'
    ? yamlInsert(doc, segments, { kind: 'member', key, value })
    : jsonInsertMember(doc, segments, key, value);
  if (!edits) return undefined;
  return { edits, insertedPointer: buildPointer([...segments, key]) };
}

/**
 * Plans appending `value` to the array at `parentPointer`, creating the array
 * (and missing ancestors) when absent.
 */
export function planInsertArrayItem(
  doc: SpecDocument,
  parentPointer: string,
  value: unknown
): SpecEditPlan | undefined {
  const segments = parsePointer(parentPointer);
  if (!segments) return undefined;
  const index = doc.format === 'yaml'
    ? yamlArrayLength(doc, segments)
    : jsonArrayLength(doc, segments);
  if (index === undefined) return undefined;
  const edits = doc.format === 'yaml'
    ? yamlInsert(doc, segments, { kind: 'item', value })
    : jsonInsertArrayItem(doc, segments, value);
  if (!edits) return undefined;
  return { edits, insertedPointer: buildPointer([...segments, String(index)]) };
}

/**
 * Plans replacing the existing scalar value at `pointer` with `value`. Used by
 * quick fixes that rewrite a leaf in place (e.g. uniquifying a duplicate
 * operationId). Returns undefined when the pointer is empty/missing or does
 * not resolve to a scalar (objects and arrays are never overwritten).
 */
export function planSetScalarAtPointer(
  doc: SpecDocument,
  pointer: string,
  value: string | number | boolean
): SpecTextEdit[] | undefined {
  const segments = parsePointer(pointer);
  if (!segments?.length) return undefined;
  return doc.format === 'yaml'
    ? yamlSetScalar(doc, segments, value)
    : jsonSetScalar(doc, segments, value);
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

function documentEol(doc: SpecDocument): string {
  return doc.eol ?? (doc.text.includes('\r\n') ? '\r\n' : '\n');
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

function singleEdit(from: number, to: number, newText: string): SpecTextEdit[] {
  return [{ offset: from, length: to - from, text: newText }];
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

function jsonDelete(doc: SpecDocument, segments: string[]): SpecTextEdit[] | undefined {
  const text = doc.text;
  const path = toJsoncPath(parseJsonTree(text), segments, true);
  if (!path) return undefined;
  const edits = modify(text, path, undefined, {
    formattingOptions: detectJsonFormatting(doc),
  });
  return edits.length ? jsoncEditsToTextEdits(edits) : undefined;
}

function jsonInsertMember(
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

function jsonInsertArrayItem(
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

function jsonArrayLength(doc: SpecDocument, segments: string[]): number | undefined {
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

function jsonSetScalar(
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

// --------------------------------------------------------------------------
// YAML backend (yaml package AST + hand-computed splices)
// --------------------------------------------------------------------------

interface YamlStyle {
  indentUnit: number;
  indentSeq: boolean;
  eol: string;
}

function detectYamlStyle(doc: SpecDocument): YamlStyle {
  const text = doc.text;
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
    eol: documentEol(doc),
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
  doc: SpecDocument,
  parentSegments: string[],
  request: YamlInsertRequest
): SpecTextEdit[] | undefined {
  const text = doc.text;
  const style = detectYamlStyle(doc);
  const parsed = parseDocument(text, { strict: false });
  const resolution = resolveYamlParent(parsed.contents as YamlNode | null, parentSegments);
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
    return singleEdit(keyEnd, valueEnd, `:${style.eol}${block}`);
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
      text.length,
      text.length,
      `${needsLeadingEol ? style.eol : ''}${block}${style.eol}`
    );
  }

  // Default anchor: the container's last entry. When a brand-new root section
  // is being created, anchor at its canonical position instead.
  let anchor = items[items.length - 1];
  if (container === parsed.contents && remaining.length > 0) {
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
    insertAt,
    insertAt,
    `${needsLeadingEol ? style.eol : ''}${block}${style.eol}`
  );
}

function yamlDelete(doc: SpecDocument, segments: string[]): SpecTextEdit[] | undefined {
  const text = doc.text;
  const parsed = parseDocument(text, { strict: false });
  let current: YamlNode | null = parsed.contents as YamlNode | null;
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
  return singleEdit(start, endOfEntryLines(text, contentEnd), '');
}

function yamlArrayLength(doc: SpecDocument, segments: string[]): number | undefined {
  const parsed = parseDocument(doc.text, { strict: false });
  let current: YamlNode | null = parsed.contents as YamlNode | null;
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
  doc: SpecDocument,
  segments: string[],
  value: string | number | boolean
): SpecTextEdit[] | undefined {
  const text = doc.text;
  const parsed = parseDocument(text, { strict: false });
  let current: YamlNode | null = parsed.contents as YamlNode | null;
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
  return singleEdit(range[0], range[1], serialized);
}
