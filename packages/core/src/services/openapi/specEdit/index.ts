import { buildPointer, parsePointer } from '../pointer';
import { jsonArrayLength, jsonDelete, jsonInsertArrayItem, jsonInsertMember, jsonRenameKey, jsonSetScalar } from './json';
import { yamlArrayLength, yamlDelete, yamlInsert, yamlRenameKey, yamlSetScalar } from './yaml';
import type { SpecDocument, SpecEditPlan, SpecTextEdit } from './shared';

export type { SpecDocument, SpecDocumentFormat, SpecEditPlan, SpecTextEdit } from './shared';

/**
 * Targeted OpenAPI spec mutations for outline context-menu commands and quick
 * fixes. Platform-agnostic: planners operate on raw text plus a format tag and
 * return plain `{offset, length, text}` edits (UTF-16 offsets) that hosts
 * convert to their own edit types (VS Code `WorkspaceEdit`, CodeMirror
 * changes, Monaco `executeEdits`).
 *
 * Both backends (sibling `json.ts` and `yaml.ts`) produce minimal edits
 * against the live text so a single undo reverts the whole action:
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

/**
 * Plans renaming the object key at `pointer` to `newKey`, keeping the value
 * and position. Returns undefined when the pointer does not resolve to an
 * object member, or `newKey` already exists on the parent.
 */
export function planRenameObjectKey(
  doc: SpecDocument,
  pointer: string,
  newKey: string
): SpecEditPlan | undefined {
  const segments = parsePointer(pointer);
  if (!segments?.length) return undefined;
  const edits = doc.format === 'yaml'
    ? yamlRenameKey(doc, segments, newKey)
    : jsonRenameKey(doc, segments, newKey);
  if (!edits) return undefined;
  return { edits, insertedPointer: buildPointer([...segments.slice(0, -1), newKey]) };
}

/**
 * Plans deleting every node in `pointers` as one batch. Hosts apply a plan's
 * edits against the original text in one shot, so independent per-pointer
 * deletions of adjacent siblings would produce overlapping ranges (both claim
 * the shared comma or line, and the JSON backend reflows neighbours). Instead
 * the deletions are applied sequentially to a working copy, deepest/last
 * sibling first so earlier pointers stay valid, and the net change is emitted
 * as one minimal replacement edit (common prefix/suffix trimmed). Returns
 * undefined when the list is empty or any pointer cannot be deleted.
 */
export function planDeleteMany(doc: SpecDocument, pointers: string[]): SpecTextEdit[] | undefined {
  const unique = Array.from(new Set(pointers));
  if (unique.length === 0) return undefined;
  const parsed = unique.map((pointer) => ({ pointer, segments: parsePointer(pointer) }));
  if (parsed.some((entry) => !entry.segments?.length)) return undefined;
  parsed.sort((a, b) => -compareSegments(a.segments!, b.segments!));
  let text = doc.text;
  for (const { pointer } of parsed) {
    const edits = planDeleteAtPointer({ text, format: doc.format }, pointer);
    if (!edits) return undefined;
    text = applyTextEdits(text, edits);
  }
  return [diffAsSingleEdit(doc.text, text)];
}

/** Lexicographic segment comparison; numeric segments compare numerically. */
function compareSegments(a: string[], b: string[]): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    if (a[index] === b[index]) continue;
    const numeric = /^\d+$/.test(a[index]) && /^\d+$/.test(b[index]);
    if (numeric) return Number(a[index]) - Number(b[index]);
    return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}

function applyTextEdits(text: string, edits: SpecTextEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((x, y) => y.offset - x.offset)) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

/** The single edit turning `before` into `after` (common prefix/suffix kept). */
function diffAsSingleEdit(before: string, after: string): SpecTextEdit {
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(before.length, after.length) - prefix;
  while (
    suffix < maxSuffix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    offset: prefix,
    length: before.length - prefix - suffix,
    text: after.slice(prefix, after.length - suffix),
  };
}
