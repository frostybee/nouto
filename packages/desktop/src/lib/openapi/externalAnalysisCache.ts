import { analyzeOpenApiWithExternalRefs } from '@nouto/core/services/openapi/externalRefs';
import type { ExternalAnalysisResult, FileResolver } from '@nouto/core/services/openapi/externalRefs';
import { findSessionByPath, type OpenApiSessionState } from './session.svelte';
import { fileUriToPath, normalizeFileUri, pathToFileUri } from './pathUtils';

/**
 * Tier-2 cache for cross-file $ref analysis (Phase 5) — the desktop analog of
 * VS Code's analysisCache.ts external tier. Tier 1 (the per-document
 * `session.analysis`) already lives on the session registry, so only the
 * external pass is cached here.
 *
 * The `referencedBy` reverse index is what makes "editing the referenced file
 * in its own tab re-validates the referrer" possible without polling: the
 * session store consults it on every content change / close.
 */
interface ExternalCacheEntry {
  /** Root session's contentRevision at compute time. */
  rootRevision: number;
  /** contentRevision of each referenced file that was an OPEN session, keyed by canonical URI. */
  sessionRevisions: Map<string, number>;
  /**
   * Referenced files read from disk (no session). Not revision-tracked — the
   * accepted v1 limitation (no watcher); an entry only goes stale if such a
   * file is later OPENED (its buffer then takes priority over disk).
   */
  closedFiles: Set<string>;
  result: ExternalAnalysisResult;
}

const cache = new Map<string, ExternalCacheEntry>(); // key = referrer session id
const pending = new Map<string, { rootRevision: number; promise: Promise<ExternalAnalysisResult> }>();
const referencedBy = new Map<string, Set<string>>(); // canonical file URI -> referrer session ids

const EMPTY_RESULT: ExternalAnalysisResult = {
  diagnostics: [],
  externalRefs: new Map(),
  resolvedFiles: new Map(),
  referencedFiles: new Set(),
};

function sessionForUri(uri: string): OpenApiSessionState | undefined {
  try {
    return findSessionByPath(fileUriToPath(uri));
  } catch {
    return undefined;
  }
}

function isFresh(entry: ExternalCacheEntry, session: OpenApiSessionState): boolean {
  if (entry.rootRevision !== session.contentRevision) return false;
  for (const [uri, revision] of entry.sessionRevisions) {
    const open = sessionForUri(uri);
    if (!open || open.contentRevision !== revision) return false;
  }
  for (const uri of entry.closedFiles) {
    // A previously-closed referenced file that has since been opened must be
    // re-read from its (possibly edited) buffer.
    if (sessionForUri(uri)) return false;
  }
  return true;
}

function updateReferencedBy(referrerId: string, referencedFiles: ReadonlySet<string>): void {
  for (const referrers of referencedBy.values()) {
    referrers.delete(referrerId);
  }
  for (const uri of referencedFiles) {
    const key = normalizeFileUri(uri);
    let referrers = referencedBy.get(key);
    if (!referrers) {
      referrers = new Set();
      referencedBy.set(key, referrers);
    }
    referrers.add(referrerId);
  }
  for (const [key, referrers] of referencedBy) {
    if (referrers.size === 0) referencedBy.delete(key);
  }
}

/**
 * Cached cross-file analysis for a session. Fresh entries return
 * synchronously-resolved promises; in-flight computations for the same
 * revision are shared.
 */
export async function getExternalAnalysis(
  session: OpenApiSessionState,
  resolver: FileResolver
): Promise<ExternalAnalysisResult> {
  const parsedSpec = session.analysis?.parsedSpec;
  if (!session.documentUri || !parsedSpec || typeof parsedSpec !== 'object') {
    return EMPTY_RESULT;
  }
  const entry = cache.get(session.id);
  if (entry && isFresh(entry, session)) return entry.result;

  const inFlight = pending.get(session.id);
  if (inFlight && inFlight.rootRevision === session.contentRevision) return inFlight.promise;

  const rootRevision = session.contentRevision;
  const rootUri = pathToFileUri(session.documentUri);
  const sessionId = session.id;
  const promise = analyzeOpenApiWithExternalRefs(parsedSpec as object, rootUri, resolver)
    .then((result) => {
      const sessionRevisions = new Map<string, number>();
      const closedFiles = new Set<string>();
      for (const uri of result.referencedFiles) {
        const key = normalizeFileUri(uri);
        const open = sessionForUri(uri);
        if (open) sessionRevisions.set(key, open.contentRevision);
        else closedFiles.add(key);
      }
      updateReferencedBy(sessionId, result.referencedFiles);
      cache.set(sessionId, { rootRevision, sessionRevisions, closedFiles, result });
      return result;
    })
    .finally(() => {
      if (pending.get(sessionId)?.promise === promise) pending.delete(sessionId);
    });
  pending.set(sessionId, { rootRevision, promise });
  return promise;
}

/**
 * Referrer sessions (excluding the changed one) whose external analysis reads
 * the given file — the caller re-runs their diagnostics.
 */
export function referrersOf(changedSessionId: string, path: string): Set<string> {
  const referrers = new Set(referencedBy.get(pathToFileUri(path)) ?? []);
  referrers.delete(changedSessionId);
  return referrers;
}

/** Drops a closed session's cached analysis and reverse-index entries. */
export function clearExternalAnalysis(sessionId: string): void {
  cache.delete(sessionId);
  pending.delete(sessionId);
  for (const [key, referrers] of referencedBy) {
    referrers.delete(sessionId);
    if (referrers.size === 0) referencedBy.delete(key);
  }
}

/** Full reset (tests, resetAllSessions). */
export function clearAllExternalAnalysis(): void {
  cache.clear();
  pending.clear();
  referencedBy.clear();
}
