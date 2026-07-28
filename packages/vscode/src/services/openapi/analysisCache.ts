import * as vscode from 'vscode';
import { analyzeOpenApi, analyzeOpenApiWithExternalRefs } from '@nouto/core/services';
import type {
  ExternalAnalysisResult,
  FileResolver,
  OpenApiAnalysis,
  OpenApiFormat,
  OpenApiVersion,
} from '@nouto/core/services';

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
  clearExternalAnalysis(uri);
}

// ---------------------------------------------------------------------------
// Tier 2: external $ref analysis (async, cross-file)
// ---------------------------------------------------------------------------

interface ExternalAnalysisCacheEntry {
  rootVersion: number;
  /**
   * Versions of referenced documents that were open when the result was
   * computed. Closed files are read from disk and not tracked — a v1
   * limitation: on-disk changes to never-opened files are picked up only when
   * the referrer itself is next analyzed from scratch.
   */
  fileVersions: Map<string, number>;
  result: ExternalAnalysisResult;
}

const externalAnalysisCache = new Map<string, ExternalAnalysisCacheEntry>();
/** referenced file uri -> uris of root documents whose analysis read it. */
const referencedBy = new Map<string, Set<string>>();
const pendingExternalAnalysis = new Map<
  string,
  { rootVersion: number; promise: Promise<ExternalAnalysisResult> }
>();

const EMPTY_REFERRERS: ReadonlySet<string> = new Set<string>();

function openDocument(key: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((document) => document.uri.toString() === key);
}

function isExternalEntryFresh(key: string, document: vscode.TextDocument): boolean {
  const cached = externalAnalysisCache.get(key);
  if (!cached || cached.rootVersion !== document.version) return false;
  // Every tracked open referenced doc must still be open at the same version…
  for (const [fileKey, version] of cached.fileVersions) {
    if (openDocument(fileKey)?.version !== version) return false;
  }
  // …and no referenced file may have been opened since (its buffer, not the
  // disk content we read, is now the source of truth).
  for (const fileKey of cached.result.referencedFiles) {
    if (!cached.fileVersions.has(fileKey) && openDocument(fileKey)) return false;
  }
  return true;
}

function storeExternalAnalysis(key: string, rootVersion: number, result: ExternalAnalysisResult): void {
  const previous = externalAnalysisCache.get(key);
  if (previous) {
    for (const fileKey of previous.result.referencedFiles) {
      if (!result.referencedFiles.has(fileKey)) {
        const referrers = referencedBy.get(fileKey);
        referrers?.delete(key);
        if (referrers?.size === 0) referencedBy.delete(fileKey);
      }
    }
  }
  const fileVersions = new Map<string, number>();
  for (const fileKey of result.referencedFiles) {
    const document = openDocument(fileKey);
    if (document) fileVersions.set(fileKey, document.version);
    let referrers = referencedBy.get(fileKey);
    if (!referrers) {
      referrers = new Set<string>();
      referencedBy.set(fileKey, referrers);
    }
    referrers.add(key);
  }
  externalAnalysisCache.set(key, { rootVersion, fileVersions, result });
}

const EMPTY_EXTERNAL_RESULT: ExternalAnalysisResult = {
  diagnostics: [],
  externalRefs: new Map(),
  resolvedFiles: new Map(),
  referencedFiles: new Set(),
};

/**
 * Cached async companion to `getOpenApiAnalysis`: resolves the document's
 * external `$ref`s across local files. Results are reused until the root
 * document or any open referenced document changes version. Concurrent calls
 * for the same document share one in-flight computation.
 */
export async function getOpenApiAnalysisWithExternalRefs(
  document: vscode.TextDocument,
  resolver: FileResolver
): Promise<ExternalAnalysisResult> {
  const key = uriKey(document.uri);
  if (isExternalEntryFresh(key, document)) {
    return externalAnalysisCache.get(key)!.result;
  }
  const pending = pendingExternalAnalysis.get(key);
  if (pending && pending.rootVersion === document.version) return pending.promise;

  const rootVersion = document.version;
  const analysis = getOpenApiAnalysis(document);
  const parsedSpec = analysis.parsedSpec;
  const promise = (async () => {
    const result = parsedSpec
      ? await analyzeOpenApiWithExternalRefs(parsedSpec, key, resolver)
      : EMPTY_EXTERNAL_RESULT;
    storeExternalAnalysis(key, rootVersion, result);
    return result;
  })();
  pendingExternalAnalysis.set(key, { rootVersion, promise });
  try {
    return await promise;
  } finally {
    if (pendingExternalAnalysis.get(key)?.promise === promise) {
      pendingExternalAnalysis.delete(key);
    }
  }
}

/** Root documents whose external analysis read `uri` (open or on disk). */
export function getReferrersOf(uri: vscode.Uri): ReadonlySet<string> {
  return referencedBy.get(uriKey(uri)) ?? EMPTY_REFERRERS;
}

export function clearExternalAnalysis(uri: vscode.Uri): void {
  const key = uriKey(uri);
  const cached = externalAnalysisCache.get(key);
  if (cached) {
    for (const fileKey of cached.result.referencedFiles) {
      const referrers = referencedBy.get(fileKey);
      referrers?.delete(key);
      if (referrers?.size === 0) referencedBy.delete(fileKey);
    }
  }
  externalAnalysisCache.delete(key);
  pendingExternalAnalysis.delete(key);
}
