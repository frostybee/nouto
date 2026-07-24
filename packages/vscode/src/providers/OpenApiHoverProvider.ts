import * as vscode from 'vscode';
import { classifyPointer, getPropertyDocs, parseJsonPointer } from '@nouto/core/services';
import type { OpenApiVersion } from '@nouto/core/services';
import {
  buildPointerMap,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  offsetToPointer,
  readOpenApiSettings,
} from '../services/openapi';

const SUPPORTED_LANGUAGES = new Set(['json', 'yaml', 'jsonc']);

/**
 * Hover documentation for OpenAPI property keys. Reuses the completion feature's
 * curated tables + pointer classifier: it only fires when the cursor is over a
 * property *key*, classifies the key's parent object, and renders that
 * property's description. Value hovers yield nothing.
 */
export class OpenApiHoverProvider implements vscode.HoverProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) return undefined;
    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) return undefined;
    if (!readOpenApiSettings(this.context).intelliSenseEnabled) return undefined;
    if (token.isCancellationRequested) return undefined;

    const offset = document.offsetAt(position);
    const pointer = offsetToPointer(document, offset);
    const map = buildPointerMap(document);
    const entry = map.entries.get(pointer);
    // Hover only over the key itself, not the value or surrounding whitespace.
    if (!entry?.keyRange || !entry.keyRange.contains(position)) return undefined;

    const segments = parseJsonPointer(pointer);
    if (!segments || segments.length === 0) return undefined;
    const propertyName = segments[segments.length - 1];
    const parentKind = classifyPointer(segments.slice(0, -1)).kind;

    const version: OpenApiVersion = getOpenApiAnalysis(document).version ?? '3.1';
    const docs = getPropertyDocs(parentKind, propertyName, version);
    if (!docs) return undefined;

    return new vscode.Hover(new vscode.MarkdownString(docs), entry.keyRange);
  }
}
