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

function addEntry(
  entries: Map<string, OpenApiPointerEntry>,
  document: vscode.TextDocument,
  pointer: string,
  valueFrom: number,
  valueTo: number,
  keyFrom?: number,
  keyTo?: number
): void {
  entries.set(pointer, {
    keyFrom,
    keyTo,
    valueFrom,
    valueTo,
    keyRange: keyFrom === undefined || keyTo === undefined
      ? undefined
      : clampedRange(document, keyFrom, keyTo),
    valueRange: clampedRange(document, valueFrom, valueTo),
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
        addEntry(
          entries,
          document,
          pointer,
          valueOffsets[0],
          valueOffsets[1],
          keyOffsets?.[0],
          keyOffsets?.[1]
        );
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
        addEntry(entries, document, buildJsonPointer(childSegments), offsets[0], offsets[1]);
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
      addEntry(
        entries,
        document,
        buildJsonPointer(childSegments),
        valueNode.offset,
        valueNode.offset + valueNode.length,
        keyNode.offset,
        keyNode.offset + keyNode.length
      );
      walkJson(valueNode, childSegments, document, entries);
    }
  } else if (node.type === 'array') {
    (node.children ?? []).forEach((child, index) => {
      const childSegments = [...segments, String(index)];
      addEntry(
        entries,
        document,
        buildJsonPointer(childSegments),
        child.offset,
        child.offset + child.length
      );
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
  addEntry(entries, document, '', 0, content.length);

  try {
    if (document.languageId === 'yaml') {
      const parsed = parseDocument(content, { strict: false });
      walkYaml(parsed.contents as YamlNode | null, [], document, entries);
    } else {
      const root = parseTree(content, undefined, {
        allowTrailingComma: true,
        disallowComments: false,
        allowEmptyContent: true,
      });
      if (root) walkJson(root, [], document, entries);
    }
  } catch {
    // Error-tolerant parsers normally return partial trees. Root remains a safe
    // fallback if an unexpected parser edge case still throws.
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
