import * as vscode from 'vscode';
import { getLocation } from 'jsonc-parser';
import {
  buildJsonPointer,
  classifyPointer,
  escapeJsonPointerSegment,
  getByJsonPointer,
  getCompletions,
  getDynamicKeyCandidates,
  getEnumValues,
  parseJsonPointer,
} from '@nouto/core/services';
import type {
  EnumValueEntry,
  FileResolver,
  OpenApiAnalysis,
  OpenApiNodeKind,
  OpenApiVersion,
  PropertyCompletionEntry,
} from '@nouto/core/services';
import {
  ALL_REF_SECTIONS,
  COMPONENT_SECTION_FOR_KIND,
  crossFileRefTargets,
  detectOpenApiDocument,
  enumerateRefTargets,
  getOpenApiAnalysis,
  getOpenApiAnalysisWithExternalRefs,
  hasEverBeenOpenApi,
  offsetToPointer,
  parsePartialRefValue,
  readOpenApiSettings,
  typedRefValue,
} from '../services/openapi';
import { relativeLabel } from './openapi-outline/buildOutline';

const SUPPORTED_LANGUAGES = new Set(['json', 'yaml', 'jsonc']);

/** Characters that make up an OpenAPI/YAML/JSON key token. */
const KEY_CHAR = /[A-Za-z0-9_$.-]/;

type DetectedContext =
  | { mode: 'key'; kind: OpenApiNodeKind; containerPointer: string; wordRange?: vscode.Range }
  | { mode: 'value'; parentKind: OpenApiNodeKind; propertyName: string; inQuotes: boolean }
  | { mode: 'none' };

/**
 * Schema-aware completion for OpenAPI documents in YAML and JSON. Suggests
 * valid property keys (from the curated per-version tables), enum values, and
 * `$ref` targets. Stateless: it re-reads the version-cached analysis and the
 * IntelliSense setting on every request.
 */
export class OpenApiCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly resolver: FileResolver
  ) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) return [];
    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) return [];
    if (!readOpenApiSettings(this.context).intelliSenseEnabled) return [];
    if (token.isCancellationRequested) return [];

    const analysis = getOpenApiAnalysis(document);
    const version: OpenApiVersion = analysis.version ?? '3.1';
    const isYaml = document.languageId === 'yaml';
    const ctx = isYaml
      ? detectYamlContext(document, position)
      : detectJsonContext(document, position);

    if (ctx.mode === 'none') return [];
    if (ctx.mode === 'value') {
      return this.buildValueItems(ctx, version, analysis, isYaml, document, position);
    }
    return this.buildKeyItems(ctx, version, analysis, isYaml);
  }

  private buildKeyItems(
    ctx: Extract<DetectedContext, { mode: 'key' }>,
    version: OpenApiVersion,
    analysis: OpenApiAnalysis,
    isYaml: boolean
  ): vscode.CompletionItem[] {
    const existingKeys = siblingKeys(analysis, ctx.containerPointer);
    const entries = getCompletions(ctx.kind, version, { existingKeys });
    const items = entries.map((entry) => keyItem(entry, version, ctx.wordRange, isYaml));

    // Security Requirement keys are the document's security-scheme names.
    if (ctx.kind === 'SecurityRequirement') {
      for (const name of getDynamicKeyCandidates(ctx.kind, analysis)) {
        if (existingKeys.has(name)) continue;
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Value);
        item.insertText = new vscode.SnippetString(isYaml ? `${name}:\n  - $0` : `"${name}": [$0]`);
        if (ctx.wordRange) item.range = ctx.wordRange;
        items.push(item);
      }
    }
    return items;
  }

  private async buildValueItems(
    ctx: Extract<DetectedContext, { mode: 'value' }>,
    version: OpenApiVersion,
    analysis: OpenApiAnalysis,
    isYaml: boolean,
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    if (ctx.propertyName === '$ref') {
      const items = refTargets(analysis, ctx.parentKind).map((target) =>
        refItem(target, ctx.inQuotes, isYaml)
      );
      await this.appendCrossFileRefItems(items, ctx, document, position, isYaml);
      return items;
    }
    const values = getEnumValues(ctx.parentKind, ctx.propertyName, version);
    if (!values) return [];
    return values.map((value) => enumItem(value, ctx.inQuotes, isYaml));
  }

  /**
   * Cross-file `$ref` suggestions. With a local file part typed
   * (`./common.yaml#/…`), suggests that file's ref targets; with no `#` yet,
   * suggests whole refs into files the document already references (from the
   * cached external analysis — no extra I/O). Failures degrade silently to the
   * in-document items.
   */
  private async appendCrossFileRefItems(
    items: vscode.CompletionItem[],
    ctx: Extract<DetectedContext, { mode: 'value' }>,
    document: vscode.TextDocument,
    position: vscode.Position,
    isYaml: boolean
  ): Promise<void> {
    if (document.uri.scheme !== 'file') return;
    if (!readOpenApiSettings(this.context).externalRefsEnabled) return;
    const before = document.lineAt(position.line).text.slice(0, position.character);
    const typed = typedRefValue(before);
    if (!typed) return;
    const replaceRange = new vscode.Range(
      new vscode.Position(position.line, typed.startCharacter),
      position
    );

    try {
      if (typed.text.includes('#')) {
        const partial = parsePartialRefValue(typed.text);
        if (!partial) return;
        const pointers = await crossFileRefTargets(
          document.uri.toString(),
          partial,
          ctx.parentKind,
          this.resolver
        );
        for (const pointer of pointers) {
          items.push(
            crossFileRefItem(`${partial.filePart}${pointer}`, replaceRange, ctx.inQuotes, isYaml)
          );
        }
        return;
      }

      const external = await getOpenApiAnalysisWithExternalRefs(document, this.resolver);
      for (const [uri, file] of external.resolvedFiles) {
        const rel = relativeLabel(document.uri.toString(), uri);
        const display = rel.startsWith('../') ? rel : `./${rel}`;
        for (const pointer of enumerateRefTargets(file.parsed, ctx.parentKind)) {
          items.push(crossFileRefItem(`${display}${pointer}`, replaceRange, ctx.inQuotes, isYaml));
        }
      }
    } catch {
      // Unresolvable/unreadable targets must never break in-document completion.
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Context detection                                                          */
/* -------------------------------------------------------------------------- */

function detectJsonContext(document: vscode.TextDocument, position: vscode.Position): DetectedContext {
  const offset = document.offsetAt(position);
  const location = getLocation(document.getText(), offset);

  if (location.isAtPropertyKey) {
    // Our pointer map robustly locates the object the key belongs to, even for
    // an empty `{}`. VS Code computes the replace range for the JSON string.
    const containerPointer = offsetToPointer(document, offset);
    return {
      mode: 'key',
      kind: classifyPointer(parseJsonPointer(containerPointer) ?? []).kind,
      containerPointer,
    };
  }

  // Value position: getLocation.path is the full, tolerant path from the root.
  const path = location.path.map((segment) => String(segment ?? ''));
  if (path.length === 0) return { mode: 'none' };
  const propertyName = path[path.length - 1];
  const before = document.lineAt(position.line).text.slice(0, position.character);
  return {
    mode: 'value',
    parentKind: classifyPointer(path.slice(0, -1)).kind,
    propertyName,
    inQuotes: isInsideQuotes(before),
  };
}

function detectYamlContext(document: vscode.TextDocument, position: vscode.Position): DetectedContext {
  const offset = document.offsetAt(position);
  const line = document.lineAt(position.line).text;
  const before = line.slice(0, position.character);

  if (before.trim() === '') {
    return blankLineFallback(document, position, before.length);
  }

  const scan = scanYamlLine(before);
  if (scan.inComment) return { mode: 'none' };

  if (scan.colonIndex !== -1) {
    // Value position: the key is the text before the colon on this line.
    const rawKey = before.slice(0, scan.colonIndex).replace(/^\s*-\s*/, '').trim();
    const propertyName = unquote(rawKey);
    // offsetToPointer lands on the property itself when it already has a value,
    // or on the enclosing object when the value is still empty. Normalize to
    // the enclosing object either way.
    let parentSegments = parseJsonPointer(offsetToPointer(document, offset)) ?? [];
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
  let containerPointer = offsetToPointer(document, offset);
  let containerSegments = parseJsonPointer(containerPointer) ?? [];
  let kind = classifyPointer(containerSegments).kind;

  if (isSequenceItem) {
    // A new item under an array property: classify the item, not the array.
    const itemSegments = [...containerSegments, '0'];
    const itemKind = classifyPointer(itemSegments).kind;
    if (itemKind !== 'Unknown') {
      kind = itemKind;
      containerPointer = buildJsonPointer(itemSegments);
      containerSegments = itemSegments;
    }
  }

  const wordStart = scanBackToWordStart(line, position.character);
  const wordRange = new vscode.Range(new vscode.Position(position.line, wordStart), position);
  return { mode: 'key', kind, containerPointer, wordRange };
}

/**
 * On a whitespace-only line, YAML gives no key token to anchor on, so the
 * container is inferred from indentation relative to the surrounding lines.
 */
function blankLineFallback(
  document: vscode.TextDocument,
  position: vscode.Position,
  cursorIndent: number
): DetectedContext {
  const prev = nearestNonBlankLineAbove(document, position.line);
  if (prev === undefined) {
    return { mode: 'key', kind: 'Root', containerPointer: '' };
  }

  const prevText = document.lineAt(prev).text;
  const prevIndent = leadingWhitespace(prevText);
  const prevOpensBlock = /:\s*$/.test(prevText) || /^\s*-\s*$/.test(prevText);

  let containerPointer: string;
  if (cursorIndent > prevIndent || (cursorIndent >= prevIndent && prevOpensBlock)) {
    containerPointer = pointerOfLine(document, prev);
  } else if (cursorIndent === prevIndent) {
    containerPointer = parentPointer(pointerOfLine(document, prev));
  } else {
    // Dedent: walk up to the first ancestor at or below the cursor indent.
    let found = '';
    for (let line = prev - 1; line >= 0; line--) {
      const text = document.lineAt(line).text;
      if (text.trim() === '') continue;
      const indent = leadingWhitespace(text);
      if (indent < cursorIndent) {
        found = pointerOfLine(document, line);
        break;
      }
      if (indent === cursorIndent) {
        found = parentPointer(pointerOfLine(document, line));
        break;
      }
    }
    containerPointer = found;
  }

  const kind = classifyPointer(parseJsonPointer(containerPointer) ?? []).kind;
  return { mode: 'key', kind, containerPointer };
}

/* -------------------------------------------------------------------------- */
/* Completion item builders                                                   */
/* -------------------------------------------------------------------------- */

function keyItem(
  entry: PropertyCompletionEntry,
  version: OpenApiVersion,
  wordRange: vscode.Range | undefined,
  isYaml: boolean
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(entry.name, completionKind(entry));
  item.documentation = new vscode.MarkdownString(entry.docs);
  item.detail = detailFor(entry);
  if (wordRange) item.range = wordRange;
  item.insertText = new vscode.SnippetString(keySnippet(entry, version, isYaml));
  return item;
}

function keySnippet(entry: PropertyCompletionEntry, version: OpenApiVersion, isYaml: boolean): string {
  if (!isYaml) {
    // JSON: insert the quoted key and a placeholder value; punctuation around
    // it is left to the JSON editor. Bare-key edits inside existing quotes are
    // handled by VS Code's default replace range.
    return `"${entry.name}": $0`;
  }
  if (entry.snippetBody) return `${entry.name}:${entry.snippetBody}`;
  switch (entry.insertKind) {
    case 'object':
      return `${entry.name}:\n  $0`;
    case 'array':
      return `${entry.name}:\n  - $0`;
    case 'enum-value': {
      const choices = (entry.enumValues ?? [])
        .filter((value) => visibleInVersion(value, version))
        .map((value) => value.value);
      return choices.length ? `${entry.name}: \${1|${choices.join(',')}|}` : `${entry.name}: $0`;
    }
    default:
      return `${entry.name}: $0`;
  }
}

function enumItem(value: EnumValueEntry, inQuotes: boolean, isYaml: boolean): vscode.CompletionItem {
  const item = new vscode.CompletionItem(value.value, vscode.CompletionItemKind.EnumMember);
  if (value.docs) item.documentation = new vscode.MarkdownString(value.docs);
  const needsQuotes = !isYaml && !inQuotes;
  item.insertText = needsQuotes ? `"${value.value}"` : value.value;
  return item;
}

/**
 * A cross-file ref item with an explicit replace range: the default word range
 * fragments on `.`, `/`, and `#`, so the item replaces the exact typed value
 * (excluding an opening quote) instead.
 */
function crossFileRefItem(
  ref: string,
  range: vscode.Range,
  inQuotes: boolean,
  isYaml: boolean
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(ref, vscode.CompletionItemKind.Reference);
  item.insertText = inQuotes ? ref : isYaml ? `'${ref}'` : `"${ref}"`;
  item.range = range;
  item.filterText = ref;
  return item;
}

function refItem(target: string, inQuotes: boolean, isYaml: boolean): vscode.CompletionItem {
  const item = new vscode.CompletionItem(target, vscode.CompletionItemKind.Reference);
  // A leading '#' starts a comment in unquoted YAML, so YAML refs must be
  // quoted. JSON values are quoted unless the cursor already sits in a string.
  if (isYaml) {
    item.insertText = inQuotes ? target : `'${target}'`;
  } else {
    item.insertText = inQuotes ? target : `"${target}"`;
  }
  return item;
}

function refTargets(analysis: OpenApiAnalysis, parentKind: OpenApiNodeKind): string[] {
  const spec = analysis.parsedSpec as Record<string, unknown> | undefined;
  const components = spec && isRecord(spec.components) ? spec.components : undefined;
  if (!components) return [];
  const section = COMPONENT_SECTION_FOR_KIND[parentKind];
  const sections = section ? [section] : ALL_REF_SECTIONS;
  const targets: string[] = [];
  for (const sec of sections) {
    const bucket = isRecord(components[sec]) ? (components[sec] as Record<string, unknown>) : undefined;
    if (!bucket) continue;
    for (const name of Object.keys(bucket)) {
      targets.push(`#/components/${sec}/${escapeJsonPointerSegment(name)}`);
    }
  }
  return targets;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function completionKind(entry: PropertyCompletionEntry): vscode.CompletionItemKind {
  if (entry.insertKind === 'object') return vscode.CompletionItemKind.Module;
  if (entry.insertKind === 'array') return vscode.CompletionItemKind.Field;
  if (entry.insertKind === 'enum-value') return vscode.CompletionItemKind.EnumMember;
  return vscode.CompletionItemKind.Property;
}

function detailFor(entry: PropertyCompletionEntry): string | undefined {
  const parts: string[] = [];
  if (entry.required) parts.push('required');
  if (entry.deprecatedSince) parts.push(`deprecated ${entry.deprecatedSince}`);
  else if (entry.sinceVersion) parts.push(`since ${entry.sinceVersion}`);
  return parts.length ? parts.join(' · ') : undefined;
}

const VERSION_ORDER: Record<OpenApiVersion, number> = { '3.0': 0, '3.1': 1, '3.2': 2 };
function visibleInVersion(entry: { sinceVersion?: OpenApiVersion; until?: OpenApiVersion }, version: OpenApiVersion): boolean {
  const order = VERSION_ORDER[version];
  if (entry.sinceVersion && order < VERSION_ORDER[entry.sinceVersion]) return false;
  if (entry.until && order > VERSION_ORDER[entry.until]) return false;
  return true;
}

function siblingKeys(analysis: OpenApiAnalysis, containerPointer: string): Set<string> {
  if (!analysis.parsedSpec) return new Set();
  const lookup = getByJsonPointer(analysis.parsedSpec, containerPointer);
  if (lookup.found && isRecord(lookup.value)) return new Set(Object.keys(lookup.value));
  return new Set();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
function isInsideQuotes(before: string): boolean {
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

function nearestNonBlankLineAbove(document: vscode.TextDocument, line: number): number | undefined {
  for (let candidate = line - 1; candidate >= 0; candidate--) {
    if (document.lineAt(candidate).text.trim() !== '') return candidate;
  }
  return undefined;
}

/** The JSON Pointer of the key/value pair defined on a given document line. */
function pointerOfLine(document: vscode.TextDocument, line: number): string {
  const text = document.lineAt(line).text;
  // Column where the key begins: past the indentation and an optional `- `.
  const keyStart = /^(\s*(?:-\s+)?)/.exec(text)?.[1].length ?? 0;
  const offset = document.offsetAt(new vscode.Position(line, keyStart));
  const basePointer = offsetToPointer(document, offset);
  // A key whose value is still empty has no pointer-map entry, so
  // offsetToPointer resolves to its enclosing object. Re-attach the key name
  // parsed from the line so children resolve under the right container.
  const keyMatch = /^\s*(?:-\s+)?["']?([^"':#\s][^"':#]*?)["']?\s*:/.exec(text);
  if (!keyMatch) return basePointer;
  const keyName = keyMatch[1].trim();
  const segments = parseJsonPointer(basePointer) ?? [];
  if (segments.length && segments[segments.length - 1] === keyName) return basePointer;
  return buildJsonPointer([...segments, keyName]);
}

function parentPointer(pointer: string): string {
  const segments = parseJsonPointer(pointer);
  if (!segments || segments.length === 0) return '';
  return buildJsonPointer(segments.slice(0, -1));
}
