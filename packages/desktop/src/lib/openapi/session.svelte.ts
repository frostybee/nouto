import { SvelteMap } from 'svelte/reactivity';
import { debounce, type Debounced } from '@nouto/ui/lib/debounce';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import type { ExternalAnalysisResult } from '@nouto/core/services/openapi/externalRefs';
import type {
  OpenApiAnalysis,
  OpenApiDiagnostic,
  OpenApiFormat,
  OpenApiVersion,
} from '@nouto/core/services/openapi/types';
import { settings } from '@nouto/ui/stores/settings.svelte';
import {
  computeSyncDiagnostics,
  fetchExampleDiagnostics,
  fetchSchemaDiagnostics,
} from './diagnostics';
import { fileUriKey } from './pathUtils';
import {
  clearAllExternalAnalysis,
  clearExternalAnalysis,
  getExternalAnalysis,
  referrersOf,
} from './externalAnalysisCache';
import { tauriFileResolver } from './tauriFileResolver';

/**
 * Multi-document session registry for the OpenAPI editor (Phase 5).
 *
 * Each open document is one `OpenApiSessionState` keyed by an opaque,
 * immutable `id` that never changes for the session's lifetime — including
 * across Save-As (only `documentUri` mutates). Monaco model URIs derive from
 * the id, so undo history and view state survive a save under a new name.
 *
 * The legacy `openApiSession` export is a Proxy facade over the active
 * session: every property access re-resolves the active session, so effects
 * and templates re-track both field changes and tab switches with no call-site
 * changes. CAUTION: never destructure fields out of `openApiSession` and hold
 * them across an `await` — a captured value goes stale if the active tab
 * changes; re-read through the facade (or pin a `getSession(id)` reference).
 */
export interface OpenApiSessionState {
  /** Opaque registry key, stable for the session's lifetime (also the Monaco model key). */
  id: string;
  /** Absolute file path, or null for an unsaved new document. */
  documentUri: string | null;
  content: string;
  /** Snapshot of what is on disk; dirty is defined as content !== savedContent. */
  savedContent: string;
  /** Fixed at open/new time; mid-session format conversion is out of scope. */
  format: OpenApiFormat | null;
  dirty: boolean;
  analysis: OpenApiAnalysis | null;
  /** Merged 5-source diagnostics (sync sources immediately; async 'schema' + external merge late). */
  diagnostics: OpenApiDiagnostic[];
  /** Last successfully parsed spec, retained across transient parse errors (preview input, Phase 3). */
  lastValidSpec: object | undefined;
  version: OpenApiVersion | undefined;
  /** True while the latest debounced analysis failed to parse (drives the stale banner, Phase 3). */
  previewStale: boolean;
  /** Reserved for Phase 3 (Try It / outline sync). */
  selectedOperation: { path: string; method: string } | null;
  /** Editor/outline split. */
  splitRatio: number;
  /**
   * Monotonic edit counter; stands in for VS Code's TextDocument.version in
   * the preview payload (documentVersion) and the external-ref cache keys.
   */
  contentRevision: number;
  /** Preview pane visibility. */
  previewVisible: boolean;
  /** Preview pane's share of the editor+preview row. */
  previewSplitRatio: number;
  /** Cross-file $ref analysis from the latest external diagnostics pass (Phase 5). */
  externalAnalysis: ExternalAnalysisResult | null;
  /** Pointer to reveal once this session's analysis is ready (cross-file navigation). */
  pendingReveal: string | null;
}

const SESSION_DEFAULTS = {
  content: '',
  savedContent: '',
  format: null,
  dirty: false,
  analysis: null,
  diagnostics: [] as OpenApiDiagnostic[],
  lastValidSpec: undefined,
  version: undefined,
  previewStale: false,
  selectedOperation: null,
  splitRatio: 0.7,
  contentRevision: 0,
  previewVisible: true,
  previewSplitRatio: 0.35,
  externalAnalysis: null,
  pendingReveal: null,
} satisfies Omit<OpenApiSessionState, 'id' | 'documentUri'>;

const sessions = new SvelteMap<string, OpenApiSessionState>();
let activeId = $state<string | null>(null);
let nextSeq = 1;

const ANALYZE_DEBOUNCE_MS = 300;

/**
 * Per-session control plane, deliberately outside the reactive session object:
 * each session owns its own debounce instance and diagnostics generation
 * counter. A shared debounce/generation would let an edit in tab B invalidate
 * a still-legitimate in-flight schema fetch for tab A.
 */
interface SessionControl {
  scheduleAnalysis: Debounced<[string, OpenApiFormat]>;
  generation: number;
}
const controls = new Map<string, SessionControl>();

export function sessionList(): OpenApiSessionState[] {
  return [...sessions.values()];
}

export function getSession(id: string): OpenApiSessionState | undefined {
  return sessions.get(id);
}

export function activeSessionId(): string | null {
  return activeId;
}

export function activeSession(): OpenApiSessionState | undefined {
  return activeId ? sessions.get(activeId) : undefined;
}

export function setActiveSessionId(id: string): void {
  if (sessions.has(id)) activeId = id;
}

/** Finds an open session whose documentUri resolves to the same file as `path`. */
export function findSessionByPath(path: string): OpenApiSessionState | undefined {
  const target = fileUriKey(path);
  for (const session of sessions.values()) {
    if (session.documentUri && fileUriKey(session.documentUri) === target) return session;
  }
  return undefined;
}

const EMPTY_SESSION: OpenApiSessionState = { id: '', documentUri: null, ...SESSION_DEFAULTS };

/**
 * Backward-compat facade: forwards every property access to the active
 * session (EMPTY_SESSION when none). Reads inside the get trap touch reactive
 * state (activeId + the SvelteMap + the session's own $state fields), so
 * consumers re-track tab switches for free — verified by the Phase 5 spike
 * test. Writes with no active session are silent no-ops.
 */
export const openApiSession: OpenApiSessionState = new Proxy(EMPTY_SESSION, {
  get(_target, prop) {
    return Reflect.get(activeSession() ?? EMPTY_SESSION, prop);
  },
  set(_target, prop, value) {
    const session = activeSession();
    if (session) Reflect.set(session, prop, value);
    return true;
  },
}) as OpenApiSessionState;

function refreshDiagnostics(
  session: OpenApiSessionState,
  content: string,
  format: OpenApiFormat,
  analysis: OpenApiAnalysis,
): void {
  const control = controls.get(session.id);
  if (!control) return;
  const generation = ++control.generation;
  const sync = computeSyncDiagnostics(content, format, analysis);
  // N-source accumulator: each async source assigns its slice and republishes;
  // a stale generation discards the whole late result. Two concurrent async
  // sources concatenated onto the frozen sync array directly would clobber
  // each other — whichever resolved second would drop the first's slice.
  let schemaDiagnostics: OpenApiDiagnostic[] = [];
  let exampleDiagnostics: OpenApiDiagnostic[] = [];
  let externalDiagnostics: OpenApiDiagnostic[] = [];
  let externalHandled: Set<string> | undefined;
  const publish = (): void => {
    if (generation !== control.generation) return;
    // The sync reference pass emits placeholder external-ref-unsupported
    // warnings at pointers it cannot resolve; once the async external pass
    // has handled a pointer, its definitive diagnostic replaces the
    // placeholder (mirrors VS Code's OpenApiDiagnosticsManager swap).
    const handled = externalHandled;
    const filteredSync = handled
      ? sync.filter(
          (d) =>
            !(
              d.code === 'external-ref-unsupported' &&
              d.pointer !== undefined &&
              handled.has(d.pointer)
            ),
        )
      : sync;
    session.diagnostics = [
      ...filteredSync,
      ...schemaDiagnostics,
      ...exampleDiagnostics,
      ...externalDiagnostics,
    ];
  };
  session.diagnostics = sync;
  // Skipped when the version is a best-effort clamp of an unknown future
  // minor: validating against the clamped version's schema would flag
  // genuinely-new fields as errors (same rule as VS Code).
  if (analysis.parsedSpec && analysis.version && !analysis.versionIsApproximate) {
    void fetchSchemaDiagnostics(analysis.parsedSpec, analysis.version).then((schema) => {
      if (generation !== control.generation) return;
      schemaDiagnostics = schema;
      publish();
    });
    // Host-validated lint rules (examples vs. schemas) share the same guard.
    void fetchExampleDiagnostics(analysis).then((examples) => {
      if (generation !== control.generation) return;
      exampleDiagnostics = examples;
      publish();
    });
  }
  // Cross-file pass: file-backed documents only (untitled has no base URI),
  // gated live on the settings toggle.
  if (settings.openApiExternalRefsEnabled && analysis.parsedSpec && session.documentUri) {
    void getExternalAnalysis(session, tauriFileResolver)
      .then((result) => {
        if (generation !== control.generation) return;
        externalDiagnostics = result.diagnostics;
        externalHandled = new Set(result.externalRefs.keys());
        session.externalAnalysis = result;
        publish();
      })
      .catch(() => {
        // Cross-file failures degrade to the sync placeholders.
      });
  } else {
    session.externalAnalysis = null;
  }
}

/** Debounced re-analysis of every open referrer of `path` (cross-tab invalidation). */
function scheduleReferrerReanalysis(changedSessionId: string, path: string | null): void {
  if (!path) return;
  for (const referrerId of referrersOf(changedSessionId, path)) {
    const referrer = sessions.get(referrerId);
    const referrerControl = controls.get(referrerId);
    if (referrer?.format && referrerControl) {
      referrerControl.scheduleAnalysis(referrer.content, referrer.format);
    }
  }
}

function applyAnalysis(
  session: OpenApiSessionState,
  result: OpenApiAnalysis,
  content: string,
  format: OpenApiFormat,
): void {
  session.analysis = result;
  session.version = result.version;
  if (result.parsedSpec !== undefined) {
    session.lastValidSpec = result.parsedSpec;
    session.previewStale = false;
  } else {
    session.previewStale = true;
  }
  refreshDiagnostics(session, content, format, result);
}

function createSession(
  uri: string | null,
  content: string,
  format: OpenApiFormat,
): OpenApiSessionState {
  const id = `doc-${nextSeq++}`;
  // Layout preferences carry over from the tab the user was just looking at.
  const layoutSource = activeSession();
  const session = $state<OpenApiSessionState>({
    ...SESSION_DEFAULTS,
    id,
    documentUri: uri,
    content,
    savedContent: content,
    format,
    contentRevision: 1,
    splitRatio: layoutSource?.splitRatio ?? SESSION_DEFAULTS.splitRatio,
    previewVisible: layoutSource?.previewVisible ?? SESSION_DEFAULTS.previewVisible,
    previewSplitRatio: layoutSource?.previewSplitRatio ?? SESSION_DEFAULTS.previewSplitRatio,
  });
  sessions.set(id, session);
  controls.set(id, {
    generation: 0,
    scheduleAnalysis: debounce((debouncedContent: string, debouncedFormat: OpenApiFormat) => {
      const current = sessions.get(id);
      if (!current) return;
      applyAnalysis(
        current,
        analyzeOpenApi(debouncedContent, debouncedFormat, current.version),
        debouncedContent,
        debouncedFormat,
      );
    }, ANALYZE_DEBOUNCE_MS),
  });
  return session;
}

/**
 * Opens a document as a new session and makes it active. Analysis runs
 * synchronously so version and lastValidSpec are correct before the first
 * debounce timer could fire (the version drives monaco-yaml's schema choice).
 * Callers wanting focus-existing semantics check findSessionByPath first.
 */
export function openSession(uri: string, content: string, format: OpenApiFormat): string {
  const session = createSession(uri, content, format);
  activeId = session.id;
  applyAnalysis(session, analyzeOpenApi(content, format), content, format);
  // Referrers that were reading this file from disk must switch to the newly
  // opened buffer (unsaved edits win from now on).
  scheduleReferrerReanalysis(session.id, uri);
  return session.id;
}

/** Creates an untitled session (New Spec) and makes it active. */
export function newSession(content: string, format: OpenApiFormat): string {
  const session = createSession(null, content, format);
  activeId = session.id;
  applyAnalysis(session, analyzeOpenApi(content, format), content, format);
  return session.id;
}

/**
 * Removes a session. The caller is responsible for the dirty confirmation and
 * for disposing the Monaco model (surface.disposeSession). If the closed
 * session was active, the neighbor in tab order becomes active.
 */
export function closeSession(id: string): void {
  const control = controls.get(id);
  if (control) {
    control.scheduleAnalysis.cancel();
    control.generation += 1; // invalidate in-flight async passes
    controls.delete(id);
  }
  if (!sessions.has(id)) return;
  const closedUri = sessions.get(id)?.documentUri ?? null;
  const order = [...sessions.keys()];
  const index = order.indexOf(id);
  sessions.delete(id);
  if (activeId === id) {
    activeId = order[index + 1] ?? order[index - 1] ?? null;
  }
  clearExternalAnalysis(id);
  // Referrers were reading this session's buffer; they must re-read from disk
  // (which may differ if unsaved edits were discarded).
  scheduleReferrerReanalysis(id, closedUri);
}

/** Editor keystroke path for a specific session: dirty tracking + debounced re-analysis. */
export function setContentFor(id: string, content: string): void {
  const session = sessions.get(id);
  const control = controls.get(id);
  if (!session || !control) return;
  session.content = content;
  session.contentRevision += 1;
  session.dirty = content !== session.savedContent;
  // Any edit invalidates in-flight async diagnostic passes (schema/external):
  // their pointers were computed against the pre-edit text and would land on
  // the live model mispositioned. The scheduleAnalysis below produces a fresh
  // pass for the new content anyway.
  control.generation += 1;
  if (session.format) {
    control.scheduleAnalysis(content, session.format);
  }
  // Any open referrer reading this file through the resolver is now stale.
  scheduleReferrerReanalysis(id, session.documentUri);
}

/** Marks a session saved under `uri`. The registry key (id) never changes — only documentUri. */
export function markSaved(id: string, uri: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.documentUri = uri;
  session.savedContent = session.content;
  session.dirty = false;
}

/**
 * Re-derives diagnostics from the current analysis without a re-parse — for
 * settings changes (lint toggles / rule severities / external refs) that alter
 * the diagnostic set while the content is unchanged.
 */
export function reanalyzeSession(id: string): void {
  const session = sessions.get(id);
  if (session?.analysis && session.format) {
    refreshDiagnostics(session, session.content, session.format, session.analysis);
  }
}

export function reanalyzeAllSessions(): void {
  for (const session of sessions.values()) {
    reanalyzeSession(session.id);
  }
}

/** Clears the whole registry (tests, teardown). */
export function resetAllSessions(): void {
  for (const control of controls.values()) {
    control.scheduleAnalysis.cancel();
    control.generation += 1;
  }
  controls.clear();
  sessions.clear();
  activeId = null;
  clearAllExternalAnalysis();
}

// ---------------------------------------------------------------------------
// Active-session convenience wrappers (legacy zero-arg call sites).

/** setContentFor targeting the active session (editor onchange path). */
export function setContent(content: string): void {
  const id = activeSessionId();
  if (id) setContentFor(id, content);
}

/** reanalyzeSession targeting the active session (settings-change path). */
export function reanalyzeCurrent(): void {
  const id = activeSessionId();
  if (id) reanalyzeSession(id);
}
