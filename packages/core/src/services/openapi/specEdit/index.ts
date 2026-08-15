import { buildPointer, parsePointer } from '../pointer';
import { jsonArrayLength, jsonDelete, jsonInsertArrayItem, jsonInsertMember, jsonSetScalar } from './json';
import { yamlArrayLength, yamlDelete, yamlInsert, yamlSetScalar } from './yaml';
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
