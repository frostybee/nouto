import { parseTree } from 'jsonc-parser';
import type { Node as JsonNode } from 'jsonc-parser';
import { isMap, isPair, isSeq, parseDocument } from 'yaml';
import type { Node as YamlNode, Pair } from 'yaml';
import { buildPointer } from './pointer';
import type { OpenApiFormat } from './types';

/**
 * Pure offset-based JSON-Pointer ↔ text-offset mapping for an OpenAPI source
 * document. All offsets are UTF-16 code units — the units the `yaml` package's
 * `.range` tuples, `jsonc-parser`'s `.offset`, and editor APIs (Monaco's
 * `getOffsetAt`/`getPositionAt`) already share.
 *
 * Host-agnostic twin of the VS Code extension's TextDocument-coupled
 * `services/openapi/pointerMap.ts`; hosts convert offsets to their own
 * position/range types.
 */
export interface OpenApiPointerMapEntry {
  keyFrom?: number;
  keyTo?: number;
  valueFrom: number;
  valueTo: number;
  /**
   * Anchor for diagnostics about something *absent* (no text of its own to
   * underline): the node's key, or for keyless nodes (sequence items, the
   * root) the first key inside the value.
   */
  anchorFrom?: number;
  anchorTo?: number;
}

export interface OpenApiPointerMap {
  /** content.length, retained for clamping lookups. */
  length: number;
  entries: Map<string, OpenApiPointerMapEntry>;
}

export interface OffsetRange {
  from: number;
  to: number;
}

interface EntryRanges {
  valueFrom: number;
  valueTo: number;
  keyFrom?: number;
  keyTo?: number;
  anchorFrom?: number;
  anchorTo?: number;
}

function addEntry(
  entries: Map<string, OpenApiPointerMapEntry>,
  pointer: string,
  ranges: EntryRanges
): void {
  // A node's own key is the best anchor; keyless nodes fall back to their
  // first inner key, and nodes with neither (an empty object) to no anchor —
  // lookups then fall back to the value range.
  entries.set(pointer, {
    keyFrom: ranges.keyFrom,
    keyTo: ranges.keyTo,
    valueFrom: ranges.valueFrom,
    valueTo: ranges.valueTo,
    anchorFrom: ranges.keyFrom ?? ranges.anchorFrom,
    anchorTo: ranges.keyTo ?? ranges.anchorTo,
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
  entries: Map<string, OpenApiPointerMapEntry>
): void {
  if (!node) return;

  if (isMap(node)) {
    for (const item of node.items) {
      if (!isPair(item)) continue;
      const childSegments = [...segments, yamlKey(item)];
      const value = item.value as YamlNode | null;
      const valueOffsets = yamlRange(value);
      const keyOffsets = yamlRange(item.key);
      if (valueOffsets) {
        addEntry(entries, buildPointer(childSegments), {
          valueFrom: valueOffsets[0],
          valueTo: valueOffsets[1],
          keyFrom: keyOffsets?.[0],
          keyTo: keyOffsets?.[1],
        });
      }
      walkYaml(value, childSegments, entries);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => {
      const value = item as YamlNode | null;
      if (!value) return;
      const childSegments = [...segments, String(index)];
      const offsets = yamlRange(value);
      if (offsets) {
        const anchor = firstYamlKeyOffsets(value);
        addEntry(entries, buildPointer(childSegments), {
          valueFrom: offsets[0],
          valueTo: offsets[1],
          anchorFrom: anchor?.[0],
          anchorTo: anchor?.[1],
        });
      }
      walkYaml(value, childSegments, entries);
    });
  }
}

function walkJson(
  node: JsonNode,
  segments: string[],
  entries: Map<string, OpenApiPointerMapEntry>
): void {
  if (node.type === 'object') {
    for (const property of node.children ?? []) {
      if (property.type !== 'property' || !property.children?.length) continue;
      const keyNode = property.children[0];
      const valueNode = property.children[1];
      if (!valueNode) continue;
      const childSegments = [...segments, String(keyNode.value ?? '')];
      addEntry(entries, buildPointer(childSegments), {
        valueFrom: valueNode.offset,
        valueTo: valueNode.offset + valueNode.length,
        keyFrom: keyNode.offset,
        keyTo: keyNode.offset + keyNode.length,
      });
      walkJson(valueNode, childSegments, entries);
    }
  } else if (node.type === 'array') {
    (node.children ?? []).forEach((child, index) => {
      const childSegments = [...segments, String(index)];
      const anchor = firstJsonKeyOffsets(child);
      addEntry(entries, buildPointer(childSegments), {
        valueFrom: child.offset,
        valueTo: child.offset + child.length,
        anchorFrom: anchor?.[0],
        anchorTo: anchor?.[1],
      });
      walkJson(child, childSegments, entries);
    });
  }
}

/**
 * Builds the pointer map for a document. No internal caching — callers that
 * rebuild on content change should memoize (the desktop view uses `$derived`).
 */
export function buildPointerMap(content: string, format: OpenApiFormat): OpenApiPointerMap {
  const entries = new Map<string, OpenApiPointerMapEntry>();
  addEntry(entries, '', { valueFrom: 0, valueTo: content.length });
  let rootAnchor: [number, number] | undefined;

  try {
    if (format === 'yaml') {
      const contents = parseDocument(content, { strict: false }).contents as YamlNode | null;
      rootAnchor = firstYamlKeyOffsets(contents);
      walkYaml(contents, [], entries);
    } else {
      const root = parseTree(content, undefined, {
        allowTrailingComma: true,
        disallowComments: false,
        allowEmptyContent: true,
      });
      if (root) {
        rootAnchor = firstJsonKeyOffsets(root);
        walkJson(root, [], entries);
      }
    }
  } catch {
    // Error-tolerant parsers normally return partial trees. Root remains a
    // safe fallback if an unexpected parser edge case still throws.
  }

  // Set once the parse has revealed the document's first key: without it a
  // root-level "missing property" would underline the entire file.
  const rootEntry = entries.get('');
  if (rootEntry && rootAnchor) {
    rootEntry.anchorFrom = rootAnchor[0];
    rootEntry.anchorTo = rootAnchor[1];
  }

  return { length: content.length, entries };
}

function clampRange(map: OpenApiPointerMap, from: number, to: number): OffsetRange {
  const clampedFrom = Math.min(Math.max(from, 0), map.length);
  return { from: clampedFrom, to: Math.min(Math.max(to, clampedFrom), map.length) };
}

/** Offset range of the pointer's value, when the pointer is known. */
export function pointerToOffsetRange(
  map: OpenApiPointerMap,
  pointer: string
): OffsetRange | undefined {
  const entry = map.entries.get(pointer);
  return entry ? clampRange(map, entry.valueFrom, entry.valueTo) : undefined;
}

/**
 * Range to anchor a diagnostic about something *absent* — a missing required
 * property has no text of its own to underline, so squiggling the whole value
 * marks lines that are all individually fine. Points instead at the construct
 * that owns the gap: its key (`'200':`), or for sequence items and the root,
 * the first key inside it. Falls back to the value range when a node has
 * neither (an empty object), which still keeps the marker small.
 */
export function pointerToAnchorOffsetRange(
  map: OpenApiPointerMap,
  pointer: string
): OffsetRange | undefined {
  const entry = map.entries.get(pointer);
  if (!entry) return undefined;
  if (entry.anchorFrom !== undefined && entry.anchorTo !== undefined) {
    return clampRange(map, entry.anchorFrom, entry.anchorTo);
  }
  return clampRange(map, entry.valueFrom, entry.valueTo);
}

/**
 * The most specific pointer whose key or value range contains the offset:
 * smallest containing span wins, ties broken by the longer (deeper) pointer.
 */
export function offsetToPointer(map: OpenApiPointerMap, offset: number): string {
  const boundedOffset = Math.min(Math.max(offset, 0), map.length);
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
