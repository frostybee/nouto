import * as vscode from 'vscode';
import {
  detailFor,
  detectJsonContext,
  detectYamlContext,
  getCompletions,
  getDynamicKeyCandidates,
  getEnumValues,
  keySnippet,
  siblingKeys,
} from '@nouto/core/services';
import type {
  DetectedContext,
  EnumValueEntry,
  FileResolver,
  OpenApiAnalysis,
  OpenApiPointerMap as CorePointerMap,
  OpenApiVersion,
  PropertyCompletionEntry,
} from '@nouto/core/services';
import {
  buildPointerMap,
  crossFileRefTargets,
  isKnownOpenApiDocument,
  enumerateRefTargets,
  getOpenApiAnalysis,
  getOpenApiAnalysisWithExternalRefs,
  parsePartialRefValue,
  readOpenApiSettings,
  typedRefValue,
  SUPPORTED_LANGUAGES,
} from '../services/openapi';
import { relativeLabel } from './openapi-outline/buildOutline';


/**
 * Schema-aware completion for OpenAPI documents in YAML and JSON. Suggests
 * valid property keys (from the curated per-version tables), enum values, and
 * `$ref` targets. Stateless: it re-reads the version-cached analysis and the
 * IntelliSense setting on every request. Context detection and the snippet
 * builders live in `@nouto/core` (shared with the desktop Monaco provider);
 * this class only wraps them in VS Code completion items.
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
    if (!isKnownOpenApiDocument(document)) return [];
    if (!readOpenApiSettings(this.context).intelliSenseEnabled) return [];
    if (token.isCancellationRequested) return [];

    const analysis = getOpenApiAnalysis(document);
    const version: OpenApiVersion = analysis.version ?? '3.1';
    const isYaml = document.languageId === 'yaml';

    // The cached VS Code pointer map carries the same offset fields as core's
    // map type (plus Range extras), so it feeds core's detection directly.
    const text = document.getText();
    const map: CorePointerMap = { length: text.length, entries: buildPointerMap(document).entries };
    const offset = document.offsetAt(position);
    const ctx = isYaml
      ? detectYamlContext(text, offset, map)
      : detectJsonContext(text, offset, map);

    if (ctx.mode === 'none') return [];
    if (ctx.mode === 'value') {
      return this.buildValueItems(ctx, version, analysis, isYaml, document, position);
    }
    const wordRange = ctx.wordStart === undefined
      ? undefined
      : new vscode.Range(document.positionAt(ctx.wordStart), position);
    return this.buildKeyItems(ctx, version, analysis, isYaml, wordRange);
  }

  private buildKeyItems(
    ctx: Extract<DetectedContext, { mode: 'key' }>,
    version: OpenApiVersion,
    analysis: OpenApiAnalysis,
    isYaml: boolean,
    wordRange: vscode.Range | undefined
  ): vscode.CompletionItem[] {
    const existingKeys = siblingKeys(analysis, ctx.containerPointer);
    const entries = getCompletions(ctx.kind, version, { existingKeys });
    const items = entries.map((entry) => keyItem(entry, version, wordRange, isYaml));

    // Security Requirement keys are the document's security-scheme names.
    if (ctx.kind === 'SecurityRequirement') {
      for (const name of getDynamicKeyCandidates(ctx.kind, analysis)) {
        if (existingKeys.has(name)) continue;
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Value);
        item.insertText = new vscode.SnippetString(isYaml ? `${name}:\n  - $0` : `"${name}": [$0]`);
        if (wordRange) item.range = wordRange;
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

/**
 * In-document `$ref` targets, section-restricted by the parent kind.
 * `enumerateRefTargets` falls back to top-level keys for component-less
 * documents (an external bare-schema-file affordance); in-document refs only
 * ever target `/components/*`.
 */
function refTargets(analysis: OpenApiAnalysis, parentKind: Parameters<typeof enumerateRefTargets>[1]): string[] {
  if (!analysis.parsedSpec) return [];
  return enumerateRefTargets(analysis.parsedSpec, parentKind)
    .filter((target) => target.startsWith('#/components/'));
}

function completionKind(entry: PropertyCompletionEntry): vscode.CompletionItemKind {
  if (entry.insertKind === 'object') return vscode.CompletionItemKind.Module;
  if (entry.insertKind === 'array') return vscode.CompletionItemKind.Field;
  if (entry.insertKind === 'enum-value') return vscode.CompletionItemKind.EnumMember;
  return vscode.CompletionItemKind.Property;
}
