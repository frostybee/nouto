import { debounce } from '@nouto/ui/lib/debounce';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import type { OpenApiAnalysis, OpenApiFormat, OpenApiVersion } from '@nouto/core/services/openapi/types';

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
  /** Last successfully parsed spec, retained across transient parse errors (preview input, Phase 3). */
  lastValidSpec: object | undefined;
  version: OpenApiVersion | undefined;
  /** True while the latest debounced analysis failed to parse (drives the stale banner, Phase 3). */
  previewStale: boolean;
  /** Reserved for Phase 3 (Try It / outline sync). */
  selectedOperation: { path: string; method: string } | null;
  /** Reserved for Phase 2 (editor/outline split). */
  splitRatio: number;
}

const initialState: OpenApiSessionState = {
  documentUri: null,
  content: '',
  savedContent: '',
  format: null,
  dirty: false,
  analysis: null,
  lastValidSpec: undefined,
  version: undefined,
  previewStale: false,
  selectedOperation: null,
  splitRatio: 0.7,
};

export const openApiSession = $state<OpenApiSessionState>({ ...initialState });

const ANALYZE_DEBOUNCE_MS = 300;

function applyAnalysis(result: OpenApiAnalysis): void {
  openApiSession.analysis = result;
  openApiSession.version = result.version;
  if (result.parsedSpec !== undefined) {
    openApiSession.lastValidSpec = result.parsedSpec;
    openApiSession.previewStale = false;
  } else {
    openApiSession.previewStale = true;
  }
}

const scheduleAnalysis = debounce((content: string, format: OpenApiFormat) => {
  applyAnalysis(analyzeOpenApi(content, format, openApiSession.version));
}, ANALYZE_DEBOUNCE_MS);

/** Editor keystroke path: updates dirty state and schedules a debounced re-analysis. */
export function setContent(content: string): void {
  openApiSession.content = content;
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
  openApiSession.savedContent = content;
  openApiSession.format = format;
  openApiSession.dirty = false;
  openApiSession.version = undefined;
  openApiSession.lastValidSpec = undefined;
  openApiSession.previewStale = false;
  openApiSession.selectedOperation = null;
  applyAnalysis(analyzeOpenApi(content, format));
}

export function markSaved(uri: string): void {
  openApiSession.documentUri = uri;
  openApiSession.savedContent = openApiSession.content;
  openApiSession.dirty = false;
}

export function resetSession(): void {
  scheduleAnalysis.cancel();
  Object.assign(openApiSession, initialState);
}
