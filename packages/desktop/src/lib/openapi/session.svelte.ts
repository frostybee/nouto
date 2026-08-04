import { debounce } from '@nouto/ui/lib/debounce';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import type { OpenApiAnalysis, OpenApiDiagnostic, OpenApiFormat, OpenApiVersion } from '@nouto/core/services/openapi/types';
import { computeSyncDiagnostics, fetchSchemaDiagnostics } from './diagnostics';

/**
 * Editor-agnostic state for the single open OpenAPI document. Desktop hosts
 * the document and the editor in the same process, so the whole lifecycle
 * lives here — no transport round-trips (unlike the VS Code webview split).
 * Phase 5 turns this into a Map<uri, session> registry for multi-document
 * support; until then it is a module singleton like the other rune stores.
 */
export interface OpenApiSessionState {
  /** Absolute file path, or null for an unsaved new document. */
  documentUri: string | null;
  content: string;
  /** Snapshot of what is on disk; dirty is defined as content !== savedContent. */
  savedContent: string;
  /** Fixed at open/new time; mid-session format conversion is out of scope. */
  format: OpenApiFormat | null;
  dirty: boolean;
  analysis: OpenApiAnalysis | null;
  /** Merged 5-source diagnostics (sync sources immediately; Rust 'schema' merges late). */
  diagnostics: OpenApiDiagnostic[];
  /** Last successfully parsed spec, retained across transient parse errors (preview input, Phase 3). */
  lastValidSpec: object | undefined;
  version: OpenApiVersion | undefined;
  /** True while the latest debounced analysis failed to parse (drives the stale banner, Phase 3). */
  previewStale: boolean;
  /** Reserved for Phase 3 (Try It / outline sync). */
  selectedOperation: { path: string; method: string } | null;
  /** Reserved for Phase 2 (editor/outline split). */
  splitRatio: number;
  /**
   * Monotonic edit counter; stands in for VS Code's TextDocument.version in
   * the preview's openApiPreviewData payload (documentVersion).
   */
  contentRevision: number;
  /** Preview pane visibility (session-lifetime; persistence is Phase 5). */
  previewVisible: boolean;
  /** Preview pane's share of the editor+preview row. */
  previewSplitRatio: number;
}

const initialState: OpenApiSessionState = {
  documentUri: null,
  content: '',
  savedContent: '',
  format: null,
  dirty: false,
  analysis: null,
  diagnostics: [],
  lastValidSpec: undefined,
  version: undefined,
  previewStale: false,
  selectedOperation: null,
  splitRatio: 0.7,
  contentRevision: 0,
  previewVisible: true,
  previewSplitRatio: 0.35,
};

export const openApiSession = $state<OpenApiSessionState>({ ...initialState });

const ANALYZE_DEBOUNCE_MS = 300;

/**
 * Monotonic guard for the async Rust schema pass: a keystroke (or session
 * reset) bumps it, and a resolution whose captured generation no longer
 * matches is discarded — stale results never clobber newer diagnostics.
 */
let diagnosticsGeneration = 0;

function refreshDiagnostics(content: string, format: OpenApiFormat, analysis: OpenApiAnalysis): void {
  const generation = ++diagnosticsGeneration;
  const sync = computeSyncDiagnostics(content, format, analysis);
  openApiSession.diagnostics = sync;
  // Skipped when the version is a best-effort clamp of an unknown future
  // minor: validating against the clamped version's schema would flag
  // genuinely-new fields as errors (same rule as VS Code).
  if (analysis.parsedSpec && analysis.version && !analysis.versionIsApproximate) {
    void fetchSchemaDiagnostics(analysis.parsedSpec, analysis.version).then((schema) => {
      if (generation !== diagnosticsGeneration) return;
      openApiSession.diagnostics = [...sync, ...schema];
    });
  }
}

function applyAnalysis(result: OpenApiAnalysis, content: string, format: OpenApiFormat): void {
  openApiSession.analysis = result;
  openApiSession.version = result.version;
  if (result.parsedSpec !== undefined) {
    openApiSession.lastValidSpec = result.parsedSpec;
    openApiSession.previewStale = false;
  } else {
    openApiSession.previewStale = true;
  }
  refreshDiagnostics(content, format, result);
}

const scheduleAnalysis = debounce((content: string, format: OpenApiFormat) => {
  applyAnalysis(analyzeOpenApi(content, format, openApiSession.version), content, format);
}, ANALYZE_DEBOUNCE_MS);

/**
 * Re-derives diagnostics from the current analysis without a re-parse — for
 * settings changes (lint toggle / rule severities) that alter the diagnostic
 * set while the content is unchanged.
 */
export function reanalyzeCurrent(): void {
  if (openApiSession.analysis && openApiSession.format) {
    refreshDiagnostics(openApiSession.content, openApiSession.format, openApiSession.analysis);
  }
}

/** Editor keystroke path: updates dirty state and schedules a debounced re-analysis. */
export function setContent(content: string): void {
  openApiSession.content = content;
  openApiSession.contentRevision += 1;
  openApiSession.dirty = content !== openApiSession.savedContent;
  if (openApiSession.format) {
    scheduleAnalysis(content, openApiSession.format);
  }
}

/**
 * Replaces the session with a freshly opened/created document. Analysis runs
 * synchronously so version and lastValidSpec are correct before the first
 * debounce timer could fire (the version drives monaco-yaml's schema choice).
 */
export function loadDocument(uri: string | null, content: string, format: OpenApiFormat): void {
  scheduleAnalysis.cancel();
  openApiSession.documentUri = uri;
  openApiSession.content = content;
  openApiSession.contentRevision += 1;
  openApiSession.savedContent = content;
  openApiSession.format = format;
  openApiSession.dirty = false;
  openApiSession.version = undefined;
  openApiSession.lastValidSpec = undefined;
  openApiSession.previewStale = false;
  openApiSession.selectedOperation = null;
  applyAnalysis(analyzeOpenApi(content, format), content, format);
}

export function markSaved(uri: string): void {
  openApiSession.documentUri = uri;
  openApiSession.savedContent = openApiSession.content;
  openApiSession.dirty = false;
}

export function resetSession(): void {
  scheduleAnalysis.cancel();
  diagnosticsGeneration += 1;
  Object.assign(openApiSession, initialState);
}
