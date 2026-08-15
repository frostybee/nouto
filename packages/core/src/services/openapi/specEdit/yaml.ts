/**
 * YAML spec-edit backend: hand-computed splices against the `yaml` package
 * AST. The document is never re-stringified as a whole — existing formatting,
 * comments, and quoting stay untouched. Flow-style `{...}`/`[...]` collections
 * with items are refused (line-based splicing cannot extend them safely).
 */
import { isMap, isPair, isScalar, isSeq, parseDocument, stringify as yamlStringify } from 'yaml';
import type { Node as YamlNode, Pair, YAMLMap, YAMLSeq } from 'yaml';
import {
  documentEol,
  endOfEntryLines,
  indentColumnAt,
  lineContentEndOffset,
  lineStartOffset,
  rootSectionRank,
  singleEdit,
} from './shared';
import type { SpecDocument, SpecTextEdit } from './shared';

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

export type YamlInsertRequest =
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

export function yamlInsert(
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
  // The new root key is either the first missing segment or, for a direct
  // member insert at the root, the member key itself (mirrors json.ts).
  const newRootKey = container === parsed.contents
    ? (remaining.length > 0 ? remaining[0] : request.kind === 'member' ? request.key : undefined)
    : undefined;
  if (newRootKey !== undefined) {
    const rank = rootSectionRank(newRootKey);
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
  // A sibling member must align with the anchor key itself, not with the
  // line's indentation: for a map nested in a sequence item (`- name: x`) the
  // key sits after the `- ` marker, and a new member on its own line needs
  // that same column.
  const anchorLineStart = lineStartOffset(text, anchorStart);
  const keyAlignedColumn = anchorStart - anchorLineStart;
  const prefixIsMarkers = /^[\s-]*$/.test(text.slice(anchorLineStart, anchorStart));
  const childColumn = isPair(anchor) && prefixIsMarkers ? keyAlignedColumn : indentColumnAt(text, anchorStart);
  const block = serializeYamlFragment(fragment, style, childColumn);
  const insertAt = endOfEntryLines(text, anchorEnd);
  const needsLeadingEol = insertAt === text.length && !text.endsWith('\n');
  return singleEdit(
    insertAt,
    insertAt,
    `${needsLeadingEol ? style.eol : ''}${block}${style.eol}`
  );
}

export function yamlDelete(doc: SpecDocument, segments: string[]): SpecTextEdit[] | undefined {
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

export function yamlArrayLength(doc: SpecDocument, segments: string[]): number | undefined {
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

export function yamlSetScalar(
  doc: SpecDocument,
  segments: string[],
  value: string | number | boolean
): SpecTextEdit[] | undefined {
  return yamlSetValue(doc, segments, value, true);
}

/**
 * Replaces the value at `segments` with `value`, serialized in flow style when
 * it is a collection (`[a, b]`, `{ k: v }`) so it stays on the existing line.
 * With `scalarTargetOnly` the current value must be a scalar (the historical
 * `yamlSetScalar` contract); otherwise any node whose range is known is
 * replaced.
 */
export function yamlSetValue(
  doc: SpecDocument,
  segments: string[],
  value: unknown,
  scalarTargetOnly = false
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

  if (scalarTargetOnly && !isScalar(valueNode)) return undefined;
  if (!isScalar(valueNode) && !isMap(valueNode) && !isSeq(valueNode)) return undefined;
  const range = yamlRangeOf(valueNode);
  if (!range) return undefined;
  const isCollection = value !== null && typeof value === 'object';
  const serialized = yamlStringify(value, {
    lineWidth: 0,
    ...(isCollection ? { collectionStyle: 'flow' as const } : {}),
  })
    .replace(/\n$/, '')
    .replace(/\n\s*/g, ' ');
  // Block collections own their trailing newline in the AST range; keep it.
  const end = text[range[1] - 1] === '\n' ? range[1] - 1 : range[1];
  return singleEdit(range[0], end, serialized);
}

/**
 * Replaces the key token of the pair at `segments` with `newKey`, leaving the
 * value and everything else untouched. Preserves the original quoting style
 * when the new key does not require different quoting. Refuses when the parent
 * is not a block map, the pair is missing, or `newKey` already exists.
 */
export function yamlRenameKey(
  doc: SpecDocument,
  segments: string[],
  newKey: string
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
  if (!isMap(current) || current.flow) return undefined;
  const last = segments[segments.length - 1];
  const pair = current.items.find((item): item is Pair => isPair(item) && yamlPairKey(item) === last);
  if (!pair) return undefined;
  if (current.items.some((item) => isPair(item) && yamlPairKey(item) === newKey)) return undefined;
  const range = yamlRangeOf(pair.key);
  if (!range) return undefined;
  const original = text.slice(range[0], range[1]);
  const serialized = yamlStringify(newKey, { lineWidth: 0 }).replace(/\n$/, '');
  const plainSafe = serialized === newKey;
  let replacement = serialized;
  if (plainSafe && original.startsWith("'")) replacement = `'${newKey.replace(/'/g, "''")}'`;
  else if (plainSafe && original.startsWith('"')) replacement = JSON.stringify(newKey);
  return singleEdit(range[0], range[1], replacement);
}
