import type * as vscode from 'vscode';
import { analyzeOpenApi } from '@nouto/core/services';
import type { OpenApiAnalysis, OpenApiFormat, OpenApiVersion } from '@nouto/core/services';

interface CachedAnalysis {
  documentVersion: number;
  analysis: OpenApiAnalysis;
}

const analysisCache = new Map<string, CachedAnalysis>();
const lastKnownVersion = new Map<string, OpenApiVersion>();

function uriKey(uri: vscode.Uri): string {
  return uri.toString();
}

export function getOpenApiAnalysis(document: vscode.TextDocument): OpenApiAnalysis {
  const key = uriKey(document.uri);
  const cached = analysisCache.get(key);
  if (cached?.documentVersion === document.version) return cached.analysis;

  // Core intentionally uses strict JSON parsing. JSONC pointer mapping still
  // works, but documents containing comments get no host semantic diagnostics.
  const format: OpenApiFormat = document.languageId === 'yaml' ? 'yaml' : 'json';
  const analysis = analyzeOpenApi(document.getText(), format, lastKnownVersion.get(key));
  if (analysis.version) lastKnownVersion.set(key, analysis.version);
  analysisCache.set(key, { documentVersion: document.version, analysis });
  return analysis;
}

export function hasEverBeenOpenApi(uri: vscode.Uri): boolean {
  return lastKnownVersion.has(uriKey(uri));
}

export function clearOpenApiAnalysis(uri: vscode.Uri): void {
  const key = uriKey(uri);
  analysisCache.delete(key);
  lastKnownVersion.delete(key);
}
