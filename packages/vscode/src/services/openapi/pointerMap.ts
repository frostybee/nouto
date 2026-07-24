import * as vscode from 'vscode';
import { buildJsonPointer } from '@nouto/core/services';
import { parseTree } from 'jsonc-parser';
import type { Node as JsonNode } from 'jsonc-parser';
import { isMap, isPair, isSeq, parseDocument } from 'yaml';
import type { Node as YamlNode, Pair } from 'yaml';

export interface OpenApiPointerEntry {
  keyFrom?: number;
  keyTo?: number;
  valueFrom: number;
  valueTo: number;
  keyRange?: vscode.Range;
  valueRange: vscode.Range;
  /**
   * Short range identifying the node, for diagnostics about something that is
   * *absent* and so has no text of its own to underline. See
   * `pointerToAnchorRange`.
   */
  anchorRange?: vscode.Range;
}

export interface OpenApiPointerMap {
  uri: string;
  documentVersion: number;
  entries: Map<string, OpenApiPointerEntry>;
}

const pointerMapCache = new Map<string, OpenApiPointerMap>();

function uriKey(uri: vscode.Uri): string {
  return uri.toString();
}

function clampedRange(
  document: vscode.TextDocument,
  from: number,
  to: number
): vscode.Range {
  const length = document.getText().length;
  const start = Math.min(Math.max(from, 0), length);
  const end = Math.min(Math.max(to, start), length);
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

interface EntryRanges {
  valueFrom: number;
  valueTo: number;
  keyFrom?: number;
  keyTo?: number;
  /**
   * Anchor fallback for nodes that have no key of their own — sequence items
   * and the document root: the offsets of the first key *inside* the value.
   */
  anchorFrom?: number;
  anchorTo?: number;
}

function addEntry(
  entries: Map<string, OpenApiPointerEntry>,
  document: vscode.TextDocument,
  pointer: string,
  ranges: EntryRanges
): void {
  const { valueFrom, valueTo, keyFrom, keyTo } = ranges;
  // A node's own key is the best anchor; keyless nodes fall back to their first
  // inner key, and nodes with neither (an empty object) to the value range.
  const anchorFrom = keyFrom ?? ranges.anchorFrom;
  const anchorTo = keyTo ?? ranges.anchorTo;
  entries.set(pointer, {
    keyFrom,
    keyTo,
    valueFrom,
    valueTo,
    keyRange: keyFrom === undefined || keyTo === undefined
      ? undefined
      : clampedRange(document, keyFrom, keyTo),
    valueRange: clampedRange(document, valueFrom, valueTo),
    anchorRange: anchorFrom === undefined || anchorTo === undefined
      ? undefined
      : clampedRange(document, anchorFrom, anchorTo),
  });
}

function yamlRange(node: unknown): [number, number] | undefined {
  const range = (node as { range?: [number, number, number] } | null)?.range;
  return range ? [range[0], range[1]] : undefined;
}

function yamlKey(pair: Pair): string {
  const key = pair.key as { toJSON?: () => unknown; value?: unknown } | null;
  const value = key?.toJSON ? key.toJSON() : key?.value;
  return String(value ?? '');
}

/** Offsets of the first key inside a YAML mapping, if it has one. */
function firstYamlKeyOffsets(node: unknown): [number, number] | undefined {
  if (!isMap(node)) return undefined;
  for (const item of node.items) {
    if (!isPair(item)) continue;
    const offsets = yamlRange(item.key);
    if (offsets) return offsets;
  }
  return undefined;
}

/** Offsets of the first key inside a JSON object, if it has one. */
function firstJsonKeyOffsets(node: JsonNode): [number, number] | undefined {
  if (node.type !== 'object') return undefined;
  for (const property of node.children ?? []) {
    if (property.type !== 'property' || !property.children?.length) continue;
    const keyNode = property.children[0];
    return [keyNode.offset, keyNode.offset + keyNode.length];
  }
  return undefined;
}

function walkYaml(
  node: YamlNode | null,
  segments: string[],
  document: vscode.TextDocument,
  entries: Map<string, OpenApiPointerEntry>
): void {
  if (!node) return;

  if (isMap(node)) {
    for (const item of node.items) {
      if (!isPair(item)) continue;
      const segment = yamlKey(item);
      const childSegments = [...segments, segment];
      const pointer = buildJsonPointer(childSegments);
      const value = item.value as YamlNode | null;
      const valueOffsets = yamlRange(value);
      const keyOffsets = yamlRange(item.key);
      if (valueOffsets) {
        addEntry(entries, document, pointer, {
          valueFrom: valueOffsets[0],
          valueTo: valueOffsets[1],
          keyFrom: keyOffsets?.[0],
          keyTo: keyOffsets?.[1],
        });
      }
      walkYaml(value, childSegments, document, entries);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => {
      const value = item as YamlNode | null;
      if (!value) return;
      const childSegments = [...segments, String(index)];
      const offsets = yamlRange(value);
      if (offsets) {
        const anchor = firstYamlKeyOffsets(value);
        addEntry(entries, document, buildJsonPointer(childSegments), {
          valueFrom: offsets[0],
          valueTo: offsets[1],
          anchorFrom: anchor?.[0],
          anchorTo: anchor?.[1],
        });
      }
      walkYaml(value, childSegments, document, entries);
    });
  }
}

function walkJson(
  node: JsonNode,
  segments: string[],
  document: vscode.TextDocument,
  entries: Map<string, OpenApiPointerEntry>
): void {
  if (node.type === 'object') {
    for (const property of node.children ?? []) {
      if (property.type !== 'property' || !property.children?.length) continue;
      const keyNode = property.children[0];
      const valueNode = property.children[1];
      if (!valueNode) continue;
      const childSegments = [...segments, String(keyNode.value ?? '')];
      addEntry(entries, document, buildJsonPointer(childSegments), {
        valueFrom: valueNode.offset,
        valueTo: valueNode.offset + valueNode.length,
        keyFrom: keyNode.offset,
        keyTo: keyNode.offset + keyNode.length,
      });
      walkJson(valueNode, childSegments, document, entries);
    }
  } else if (node.type === 'array') {
    (node.children ?? []).forEach((child, index) => {
      const childSegments = [...segments, String(index)];
      const anchor = firstJsonKeyOffsets(child);
      addEntry(entries, document, buildJsonPointer(childSegments), {
        valueFrom: child.offset,
        valueTo: child.offset + child.length,
        anchorFrom: anchor?.[0],
        anchorTo: anchor?.[1],
      });
      walkJson(child, childSegments, document, entries);
    });
  }
}

export function buildPointerMap(document: vscode.TextDocument): OpenApiPointerMap {
  const key = uriKey(document.uri);
  const cached = pointerMapCache.get(key);
  if (cached?.documentVersion === document.version) return cached;

  const content = document.getText();
  const entries = new Map<string, OpenApiPointerEntry>();
  addEntry(entries, document, '', { valueFrom: 0, valueTo: content.length });
  let rootAnchor: [number, number] | undefined;

  try {
    if (document.languageId === 'yaml') {
      const parsed = parseDocument(content, { strict: false });
      const contents = parsed.contents as YamlNode | null;
      rootAnchor = firstYamlKeyOffsets(contents);
      walkYaml(contents, [], document, entries);
    } else {
      const root = parseTree(content, undefined, {
        allowTrailingComma: true,
        disallowComments: false,
        allowEmptyContent: true,
      });
      if (root) {
        rootAnchor = firstJsonKeyOffsets(root);
        walkJson(root, [], document, entries);
      }
    }
  } catch {
    // Error-tolerant parsers normally return partial trees. Root remains a safe
    // fallback if an unexpected parser edge case still throws.
  }

  // Set once the parse has revealed the document's first key: without it a
  // root-level "missing property" would underline the entire file.
  const rootEntry = entries.get('');
  if (rootEntry && rootAnchor) {
    rootEntry.anchorRange = clampedRange(document, rootAnchor[0], rootAnchor[1]);
  }

  const map = { uri: key, documentVersion: document.version, entries };
  pointerMapCache.set(key, map);
  return map;
}

export function pointerToRange(
  map: OpenApiPointerMap,
  pointer: string
): vscode.Range | undefined {
  return map.entries.get(pointer)?.valueRange;
}

/**
 * Range of the pointer's key (`get:`) rather than its value. Decorations that
 * render above a line — CodeLenses especially — belong on the key: a mapping's
 * value starts on the following line, which would place them inside the block.
 * Falls back to the value range for entries that have no key (array items).
 */
export function pointerToKeyRange(
  map: OpenApiPointerMap,
  pointer: string
): vscode.Range | undefined {
  const entry = map.entries.get(pointer);
  return entry?.keyRange ?? entry?.valueRange;
}

/**
 * Range to anchor a diagnostic about something *absent* — a missing required
 * property has no text of its own to underline, so squiggling the whole value
 * marks lines that are all individually fine. Points instead at the construct
 * that owns the gap: its key (`'200':`), or for sequence items and the root,
 * the first key inside it. Falls back to the value range when a node has
 * neither (an empty object), which still keeps the marker small.
 */
export function pointerToAnchorRange(
  map: OpenApiPointerMap,
  pointer: string
): vscode.Range | undefined {
  const entry = map.entries.get(pointer);
  return entry?.anchorRange ?? entry?.valueRange;
}

export function offsetToPointer(document: vscode.TextDocument, offset: number): string {
  const map = buildPointerMap(document);
  const boundedOffset = Math.min(Math.max(offset, 0), document.getText().length);
  let bestPointer = '';
  let bestSpan = Number.POSITIVE_INFINITY;

  for (const [pointer, entry] of map.entries) {
    const keyContains = entry.keyFrom !== undefined && entry.keyTo !== undefined
      && boundedOffset >= entry.keyFrom && boundedOffset <= entry.keyTo;
    const valueContains = boundedOffset >= entry.valueFrom && boundedOffset <= entry.valueTo;
    if (!keyContains && !valueContains) continue;

    const from = keyContains ? entry.keyFrom! : entry.valueFrom;
    const to = keyContains ? entry.keyTo! : entry.valueTo;
    const span = to - from;
    if (span < bestSpan || (span === bestSpan && pointer.length > bestPointer.length)) {
      bestPointer = pointer;
      bestSpan = span;
    }
  }
  return bestPointer;
}

export function clearPointerMap(uri: vscode.Uri): void {
  pointerMapCache.delete(uriKey(uri));
}
