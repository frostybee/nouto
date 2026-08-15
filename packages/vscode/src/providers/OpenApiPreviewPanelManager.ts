import * as vscode from 'vscode';
import { resolveOpenApiVersion } from '@nouto/core/services';
import type { FileResolver, OpenApiVersion } from '@nouto/core/services';
import type {
  OpenApiAction,
  OpenApiPreviewDataMessage,
  ProxyHttpRequest,
} from '@nouto/transport';
import type { OpenApiActionService } from '../services/OpenApiActionService';
import {
  bundleSpecForRender,
  debounce,
  getOpenApiAnalysis,
  getReferrersOf,
  isKnownOpenApiDocument,
} from '../services/openapi';
import type { Debounced } from '../services/openapi';
import { buildPreviewHtml } from './panel/openApiPreviewHtml';
import { runProxyRequest } from './panel/openApiPreviewProxy';

const PREVIEW_DEBOUNCE_MS = 400;

/** Persisted by the webview via setState; the specification is never serialized. */
interface OpenApiPreviewState {
  sourceUri: string;
  renderer: string;
  theme: string;
  /** JSON Pointer of the toolbar's selected operation, if any. */
  selectedOperationPointer?: string;
}

interface PreviewEntry {
  panel: vscode.WebviewPanel;
  sourceUri: vscode.Uri;
  /** Retained in-memory only, so a temporarily invalid document keeps rendering. */
  lastValidSpec?: object;
  lastValidVersion?: OpenApiVersion;
  /** Last document version actually delivered; guards redundant re-sends. */
  sentVersion?: number;
  ready: boolean;
  /** Guards posts from actions that outlive the panel. */
  disposed: boolean;
  pendingPush: Debounced<[]>;
  disposables: vscode.Disposable[];
  /** In-flight "Try it out" proxy requests, keyed by requestId, for cancellation. */
  proxyControllers: Map<string, AbortController>;
}

/**
 * Owns one documentation-preview panel per source document URI.
 *
 * Panels are deliberately created without `retainContextWhenHidden` so VS Code
 * can reclaim renderer memory when a preview is hidden; the ready handshake
 * re-hydrates the webview when it is shown again.
 */
export class OpenApiPreviewPanelManager implements vscode.Disposable {
  public static readonly viewType = 'nouto.openApiPreviewPanel';

  private readonly entries = new Map<string, PreviewEntry>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly actions: OpenApiActionService,
    private readonly context: vscode.ExtensionContext,
    private readonly resolver: FileResolver
  ) {}

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const entry = this.entries.get(event.document.uri.toString());
        if (entry) entry.pendingPush();
        // A previewed spec must also re-render when a file it references via
        // external $ref changes. The root document's own version is unchanged,
        // so the sent-version guard has to be reset explicitly.
        for (const referrerKey of getReferrersOf(event.document.uri)) {
          if (referrerKey === event.document.uri.toString()) continue;
          const referrer = this.entries.get(referrerKey);
          if (referrer) {
            referrer.sentVersion = undefined;
            referrer.pendingPush();
          }
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.entries.get(document.uri.toString())?.panel.dispose();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => { this.updateContextKey(); }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === vscode.window.activeTextEditor?.document) {
          this.updateContextKey();
        }
      })
    );
    this.updateContextKey();
  }

  /** Reveals the existing preview for this document, or opens a new one beside it. */
  openPreview(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.entries.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      OpenApiPreviewPanelManager.viewType,
      previewTitle(document.uri),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview-dist')],
      }
    );
    this.adoptPanel(panel, document);
  }

  /** Serializer entry point: reattaches a restored panel to its source document. */
  async revivePreview(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    const sourceUri = (state as OpenApiPreviewState | undefined)?.sourceUri;
    if (!sourceUri) {
      panel.dispose();
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(sourceUri));
      this.adoptPanel(panel, document);
    } catch {
      vscode.window.showErrorMessage(
        `Nouto: could not reopen ${sourceUri} for its OpenAPI preview.`
      );
      panel.dispose();
    }
  }

  private adoptPanel(panel: vscode.WebviewPanel, document: vscode.TextDocument): void {
    const key = document.uri.toString();
    // A second panel for the same URI (e.g. two restored panels) is not tracked
    // twice; the newest wins and the previous one is disposed.
    this.entries.get(key)?.panel.dispose();

    const entry: PreviewEntry = {
      panel,
      sourceUri: document.uri,
      ready: false,
      disposed: false,
      pendingPush: debounce(() => { this.push(key); }, PREVIEW_DEBOUNCE_MS),
      disposables: [],
      proxyControllers: new Map(),
    };
    this.entries.set(key, entry);

    panel.webview.html = this.getHtml(panel.webview, key);

    entry.disposables.push(
      panel.webview.onDidReceiveMessage((message: { type?: string; data?: unknown }) => {
        if (message?.type === 'openApiPreviewReady') {
          entry.ready = true;
          // The webview may have been reloaded, so resend unconditionally.
          entry.sentVersion = undefined;
          this.push(key);
          return;
        }
        if (message?.type === 'openApiTryOperation') {
          const data = message.data as { path?: unknown; method?: unknown } | undefined;
          if (typeof data?.path !== 'string' || typeof data?.method !== 'string') return;
          void this.runAction(entry, 'tryOperation', () =>
            // The bound source URI is used rather than anything the webview
            // sends: a renderer must not be able to retarget the action.
            this.actions.tryOperation({
              uri: entry.sourceUri,
              path: data.path as string,
              method: data.method as string,
            })
          );
          return;
        }
        if (message?.type === 'openApiGenerateCollection') {
          void this.runAction(entry, 'generateCollection', () =>
            this.actions.generateCollection(entry.sourceUri)
          );
          return;
        }
        if (message?.type === 'openApiOpenDocsInBrowser') {
          void vscode.commands.executeCommand('nouto.openApiDocsInBrowser', entry.sourceUri);
          return;
        }
        if (message?.type === 'openApiProxyRequest') {
          const data = message.data as { requestId?: unknown; request?: ProxyHttpRequest } | undefined;
          if (typeof data?.requestId !== 'string' || !data.request || typeof data.request !== 'object') {
            return;
          }
          void this.runProxyRequest(entry, data.requestId, data.request);
          return;
        }
        if (message?.type === 'openApiProxyCancel') {
          const data = message.data as { requestId?: unknown } | undefined;
          if (typeof data?.requestId === 'string') {
            entry.proxyControllers.get(data.requestId)?.abort();
            entry.proxyControllers.delete(data.requestId);
          }
        }
      })
    );

    panel.onDidDispose(() => {
      entry.disposed = true;
      entry.pendingPush.cancel();
      for (const controller of entry.proxyControllers.values()) controller.abort();
      entry.proxyControllers.clear();
      for (const disposable of entry.disposables) disposable.dispose();
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
  }

  /**
   * Runs a preview-initiated action, bracketing it with the progress messages
   * the toolbar renders inline.
   *
   * The environment prompt deliberately runs after success is reported: it
   * blocks on user input, and leaving the toolbar busy until the user answers
   * would also block every other action on this document.
   */
  private async runAction(
    entry: PreviewEntry,
    action: OpenApiAction,
    run: () => Promise<import('../services/OpenApiActionService').OpenApiActionOutcome>
  ): Promise<void> {
    const post = (message: unknown): void => {
      if (entry.disposed) return;
      void entry.panel.webview.postMessage(message);
    };

    post({ type: 'openApiActionStarted', data: { action } });

    let outcome: import('../services/OpenApiActionService').OpenApiActionOutcome;
    try {
      outcome = await run();
    } catch (error) {
      post({
        type: 'openApiActionFailed',
        data: { action, message: error instanceof Error ? error.message : String(error) },
      });
      return;
    }

    if (!outcome.ok) {
      post({ type: 'openApiActionFailed', data: { action, message: outcome.message } });
      return;
    }

    post({
      type: 'openApiActionSucceeded',
      data: {
        action,
        message: [outcome.message, ...outcome.warnings].join(' '),
      },
    });

    await outcome.promptEnvironment?.();
  }

  private isTryItEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('nouto')
      .get<boolean>('openApiPreview.enableTryIt', true);
  }

  /** Delegates a renderer "Try it out" request to the shared proxy module. */
  private runProxyRequest(
    entry: PreviewEntry,
    requestId: string,
    request: ProxyHttpRequest
  ): Promise<void> {
    return runProxyRequest(
      {
        post: (message) => {
          if (entry.disposed) return;
          void entry.panel.webview.postMessage(message);
        },
        controllers: entry.proxyControllers,
        tryItEnabled: () => this.isTryItEnabled(),
      },
      requestId,
      request
    );
  }

  private push(key: string): void {
    void this.pushAsync(key);
  }

  private async pushAsync(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || !entry.ready) return;

    const document = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === key
    );
    if (!document) return;
    if (entry.sentVersion === document.version) return;
    const startedVersion = document.version;

    const payload = await this.buildPayload(entry, document);
    // The bundle await may have been overtaken by disposal or a newer edit —
    // the newer edit's own debounced push delivers the fresher payload.
    if (entry.disposed || !entry.ready) return;
    if (document.version !== startedVersion) return;

    entry.panel.webview.postMessage({ type: 'openApiPreviewData', data: payload } satisfies OpenApiPreviewDataMessage);
    entry.sentVersion = startedVersion;
  }

  /**
   * Currency is derived from the raw parsed value rather than
   * `analysis.version`, which the analysis cache intentionally keeps sticky
   * across parse failures and would therefore never report staleness.
   */
  private async buildPayload(
    entry: PreviewEntry,
    document: vscode.TextDocument
  ): Promise<OpenApiPreviewDataMessage['data']> {
    const parsed = getOpenApiAnalysis(document).parsedSpec;
    const isObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    // Lenient: an unknown future 3.x minor renders best-effort as the highest
    // supported version instead of flipping the preview to stale.
    const version = isObject
      ? resolveOpenApiVersion((parsed as Record<string, unknown>).openapi)?.version
      : undefined;
    const tryItEnabled = this.isTryItEnabled();

    if (isObject && version) {
      const { spec, externalRefsIncomplete } = await bundleSpecForRender(
        document,
        parsed as object,
        this.resolver,
        this.context
      );
      entry.lastValidSpec = spec;
      entry.lastValidVersion = version;
      return {
        documentUri: document.uri.toString(),
        documentVersion: document.version,
        spec,
        version,
        stale: false,
        tryItEnabled,
        externalRefsIncomplete,
      };
    }

    // Stale payloads carry no spec: the webview keeps rendering the last one it
    // received, or shows an empty state when it never received any.
    return {
      documentUri: document.uri.toString(),
      documentVersion: document.version,
      version: entry.lastValidVersion,
      stale: true,
      tryItEnabled,
    };
  }

  private updateContextKey(): void {
    const document = vscode.window.activeTextEditor?.document;
    // No active editor means focus sits in a webview (e.g. the request panel),
    // terminal, or sidebar — keep the last value so the outline view doesn't
    // vanish, mirroring how OpenApiOutlineProvider ignores `undefined` editors.
    if (!document) return;
    const active = isKnownOpenApiDocument(document);
    vscode.commands.executeCommand('setContext', 'nouto.openApiActive', active);
  }

  private getHtml(webview: vscode.Webview, sourceUri: string): string {
    return buildPreviewHtml(webview, this.extensionUri, sourceUri);
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    for (const entry of [...this.entries.values()]) entry.panel.dispose();
    this.entries.clear();
  }
}

function previewTitle(uri: vscode.Uri): string {
  const name = uri.path.split('/').pop() || 'OpenAPI';
  return `Preview: ${name}`;
}
