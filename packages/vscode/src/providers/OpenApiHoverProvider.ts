import * as vscode from 'vscode';
import { resolveHoverDocs } from '@nouto/core/services';
import type { OpenApiPointerMap as CorePointerMap, OpenApiVersion } from '@nouto/core/services';
import {
  buildPointerMap,
  isKnownOpenApiDocument,
  getOpenApiAnalysis,
  readOpenApiSettings,
  SUPPORTED_LANGUAGES,
} from '../services/openapi';


/**
 * Hover documentation for OpenAPI property keys. The key-range gating and the
 * curated-table lookup live in `@nouto/core`'s `resolveHoverDocs` (shared with
 * the desktop Monaco provider); this class only converts positions/offsets and
 * wraps the result in a VS Code Hover.
 */
export class OpenApiHoverProvider implements vscode.HoverProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) return undefined;
    if (!isKnownOpenApiDocument(document)) return undefined;
    if (!readOpenApiSettings(this.context).intelliSenseEnabled) return undefined;
    if (token.isCancellationRequested) return undefined;

    const map: CorePointerMap = {
      length: document.getText().length,
      entries: buildPointerMap(document).entries,
    };
    const version: OpenApiVersion = getOpenApiAnalysis(document).version ?? '3.1';
    const result = resolveHoverDocs(map, document.offsetAt(position), version);
    if (!result) return undefined;

    const range = new vscode.Range(
      document.positionAt(result.range.from),
      document.positionAt(result.range.to)
    );
    return new vscode.Hover(new vscode.MarkdownString(result.docs), range);
  }
}
