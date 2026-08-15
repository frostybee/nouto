import type * as vscode from 'vscode';
import { bundleAnalyzedSpecForRender } from '@nouto/core/services';
import type { FileResolver } from '@nouto/core/services';
import { getOpenApiAnalysisWithExternalRefs } from './analysisCache';
import { readOpenApiSettings } from './openApiSettings';

/**
 * Inlines a document's local external `$ref`s so renderers that cannot load
 * other files (the sandboxed preview frame, the standalone docs snapshot)
 * receive one self-contained spec. Falls back to the raw spec when resolution
 * is disabled, impossible (untitled), unnecessary (no external refs), or fails.
 * The bundle/merge step itself is core's `bundleAnalyzedSpecForRender`.
 */
export async function bundleSpecForRender(
  document: vscode.TextDocument,
  parsed: object,
  resolver: FileResolver,
  context: vscode.ExtensionContext
): Promise<{ spec: object; externalRefsIncomplete?: boolean }> {
  if (document.uri.scheme !== 'file' || !readOpenApiSettings(context).externalRefsEnabled) {
    return { spec: parsed };
  }
  try {
    const external = await getOpenApiAnalysisWithExternalRefs(document, resolver);
    return bundleAnalyzedSpecForRender(parsed, document.uri.toString(), external);
  } catch {
    return { spec: parsed };
  }
}
