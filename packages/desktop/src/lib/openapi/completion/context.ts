/**
 * Key/value completion-context detection for OpenAPI documents — the desktop
 * (text + offset) port of the VS Code provider's detectJsonContext /
 * detectYamlContext. Pure and Monaco-free: callers pass the raw text, the
 * UTF-16 cursor offset, and a pre-built pointer map (built once per request
 * and shared across completion/hover/code-action lookups).
 */
import { getLocation } from 'jsonc-parser';
import { classifyPointer } from '@nouto/core/services/openapi/completion/registry';
import type { OpenApiNodeKind } from '@nouto/core/services/openapi/completion/types';
import { buildPointer, parsePointer } from '@nouto/core/services/openapi/pointer';
import { offsetToPointer } from '@nouto/core/services/openapi/pointerMap';
import type { OpenApiPointerMap } from '@nouto/core/services/openapi/pointerMap';

/** Characters that make up an OpenAPI/YAML/JSON key token. */
const KEY_CHAR = /[A-Za-z0-9_$.-]/;

export type DetectedContext =
  | {
      mode: 'key';
      kind: OpenApiNodeKind;
      containerPointer: string;
      /** Offset where the partially typed key begins (replace-range start). */
      wordStart?: number;
    }
  | { mode: 'value'; parentKind: OpenApiNodeKind; propertyName: string; inQuotes: boolean }
  | { mode: 'none' };

/** Line texts plus each line's start offset (lines keep no terminators; a
 * trailing `\r` from CRLF input is harmless to every consumer below). */
interface LineIndex {
  lines: string[];
  starts: number[];
}

function buildLineIndex(text: string): LineIndex {
  const lines = text.split('\n');
  const starts: number[] = new Array(lines.length);
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    starts[i] = acc;
    acc += lines[i].length + 1;
  }
  return { lines, starts };
}

function lineOfOffset(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function detectJsonContext(
  text: string,
  offset: number,
  map: OpenApiPointerMap
): DetectedContext {
  const location = getLocation(text, offset);

  if (location.isAtPropertyKey) {
    // The pointer map robustly locates the object the key belongs to, even
    // for an empty `{}`.
    const containerPointer = offsetToPointer(map, offset);
    return {
      mode: 'key',
      kind: classifyPointer(parsePointer(containerPointer) ?? []).kind,
      containerPointer,
    };
  }

  // Value position: getLocation.path is the full, tolerant path from the root.
  const path = location.path.map((segment) => String(segment ?? ''));
  if (path.length === 0) return { mode: 'none' };
  const propertyName = path[path.length - 1];
  const { lines, starts } = buildLineIndex(text);
  const lineNo = lineOfOffset(starts, offset);
  const before = lines[lineNo].slice(0, offset - starts[lineNo]);
  return {
    mode: 'value',
    parentKind: classifyPointer(path.slice(0, -1)).kind,
    propertyName,
    inQuotes: isInsideQuotes(before),
  };
}

export function detectYamlContext(
  text: string,
  offset: number,
  map: OpenApiPointerMap
): DetectedContext {
  const index = buildLineIndex(text);
  const lineNo = lineOfOffset(index.starts, offset);
  const line = index.lines[lineNo];
  const character = offset - index.starts[lineNo];
  const before = line.slice(0, character);

  if (before.trim() === '') {
    return blankLineFallback(index, lineNo, before.length, map);
  }

  const scan = scanYamlLine(before);
  if (scan.inComment) return { mode: 'none' };

  if (scan.colonIndex !== -1) {
    // Value position: the key is the text before the colon on this line.
    const rawKey = before.slice(0, scan.colonIndex).replace(/^\s*-\s*/, '').trim();
    const propertyName = unquote(rawKey);
    // offsetToPointer lands on the property itself when it already has a
    // value, or on the enclosing object when the value is still empty.
    // Normalize to the enclosing object either way.
    let parentSegments = parsePointer(offsetToPointer(map, offset)) ?? [];
    if (parentSegments.length && parentSegments[parentSegments.length - 1] === propertyName) {
      parentSegments = parentSegments.slice(0, -1);
    }
    return {
      mode: 'value',
      parentKind: classifyPointer(parentSegments).kind,
      propertyName,
      inQuotes: isInsideQuotes(before),
    };
  }

  // Key position: a bare word (possibly a fresh sequence item) being typed.
  const isSequenceItem = /^\s*-\s/.test(before);
  let containerPointer = offsetToPointer(map, offset);
  let containerSegments = parsePointer(containerPointer) ?? [];
  let kind = classifyPointer(containerSegments).kind;

  if (isSequenceItem) {
    // A new item under an array property: classify the item, not the array.
    const itemSegments = [...containerSegments, '0'];
    const itemKind = classifyPointer(itemSegments).kind;
    if (itemKind !== 'Unknown') {
      kind = itemKind;
      containerPointer = buildPointer(itemSegments);
      containerSegments = itemSegments;
    }
  }

  const wordStart = index.starts[lineNo] + scanBackToWordStart(line, character);
  return { mode: 'key', kind, containerPointer, wordStart };
}

/**
 * On a whitespace-only line, YAML gives no key token to anchor on, so the
 * container is inferred from indentation relative to the surrounding lines.
 */
function blankLineFallback(
  index: LineIndex,
  lineNo: number,
  cursorIndent: number,
  map: OpenApiPointerMap
): DetectedContext {
  const prev = nearestNonBlankLineAbove(index, lineNo);
  if (prev === undefined) {
    return { mode: 'key', kind: 'Root', containerPointer: '' };
  }

  const prevText = index.lines[prev];
  const prevIndent = leadingWhitespace(prevText);
  const prevOpensBlock = /:\s*$/.test(prevText) || /^\s*-\s*$/.test(prevText);

  let containerPointer: string;
  if (cursorIndent > prevIndent || (cursorIndent >= prevIndent && prevOpensBlock)) {
    containerPointer = pointerOfLine(index, prev, map);
  } else if (cursorIndent === prevIndent) {
    containerPointer = parentPointer(pointerOfLine(index, prev, map));
  } else {
    // Dedent: walk up to the first ancestor at or below the cursor indent.
    let found = '';
    for (let line = prev - 1; line >= 0; line--) {
      const text = index.lines[line];
      if (text.trim() === '') continue;
      const indent = leadingWhitespace(text);
      if (indent < cursorIndent) {
        found = pointerOfLine(index, line, map);
        break;
      }
      if (indent === cursorIndent) {
        found = parentPointer(pointerOfLine(index, line, map));
        break;
      }
    }
    containerPointer = found;
  }

  const kind = classifyPointer(parsePointer(containerPointer) ?? []).kind;
  return { mode: 'key', kind, containerPointer };
}

/** Finds the first unquoted `:` and whether the cursor sits in a `#` comment. */
function scanYamlLine(before: string): { colonIndex: number; inComment: boolean } {
  let quote: string | undefined;
  for (let i = 0; i < before.length; i++) {
    const char = before[i];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#' && (i === 0 || before[i - 1] === ' ')) {
      return { colonIndex: -1, inComment: true };
    } else if (char === ':' && (i + 1 >= before.length || before[i + 1] === ' ')) {
      return { colonIndex: i, inComment: false };
    }
  }
  return { colonIndex: -1, inComment: false };
}

/** Whether the cursor sits inside an open string on this line. */
export function isInsideQuotes(before: string): boolean {
  let quote: string | undefined;
  for (const char of before) {
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    }
  }
  return quote !== undefined;
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

function scanBackToWordStart(line: string, character: number): number {
  let start = character;
  while (start > 0 && KEY_CHAR.test(line[start - 1])) start--;
  return start;
}

function leadingWhitespace(text: string): number {
  const match = /^\s*/.exec(text);
  return match ? match[0].length : 0;
}

function nearestNonBlankLineAbove(index: LineIndex, line: number): number | undefined {
  for (let candidate = line - 1; candidate >= 0; candidate--) {
    if (index.lines[candidate].trim() !== '') return candidate;
  }
  return undefined;
}

/** The JSON Pointer of the key/value pair defined on a given document line. */
function pointerOfLine(index: LineIndex, line: number, map: OpenApiPointerMap): string {
  const text = index.lines[line];
  // Column where the key begins: past the indentation and an optional `- `.
  const keyStart = /^(\s*(?:-\s+)?)/.exec(text)?.[1].length ?? 0;
  const basePointer = offsetToPointer(map, index.starts[line] + keyStart);
  // A key whose value is still empty has no pointer-map entry, so
  // offsetToPointer resolves to its enclosing object. Re-attach the key name
  // parsed from the line so children resolve under the right container.
  const keyMatch = /^\s*(?:-\s+)?["']?([^"':#\s][^"':#]*?)["']?\s*:/.exec(text);
  if (!keyMatch) return basePointer;
  const keyName = keyMatch[1].trim();
  const segments = parsePointer(basePointer) ?? [];
  if (segments.length && segments[segments.length - 1] === keyName) return basePointer;
  return buildPointer([...segments, keyName]);
}

function parentPointer(pointer: string): string {
  const segments = parsePointer(pointer);
  if (!segments || segments.length === 0) return '';
  return buildPointer(segments.slice(0, -1));
}
