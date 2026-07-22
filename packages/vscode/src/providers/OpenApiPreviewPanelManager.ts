import * as vscode from 'vscode';
import { detectOpenApiVersion, executeRequest } from '@nouto/core/services';
import type { HttpRequestConfig, HttpResponse, OpenApiVersion } from '@nouto/core/services';
import type {
  OpenApiAction,
  OpenApiPreviewDataMessage,
  ProxyHttpRequest,
  ProxyHttpResponse,
} from '@nouto/transport';
import type { OpenApiActionService } from '../services/OpenApiActionService';
import {
  debounce,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
} from '../services/openapi';
import type { Debounced } from '../services/openapi';

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

const PROXY_TIMEOUT_MS = 30000;

/** Headers the renderer may send that the host client manages itself or must not forward. */
const PROXY_DROP_HEADERS = new Set(['host', 'content-length', 'connection']);

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
    private readonly actions: OpenApiActionService
  ) {}

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const entry = this.entries.get(event.document.uri.toString());
        if (entry) entry.pendingPush();
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

  /**
   * Executes a renderer "Try it out" request on behalf of the sandboxed frame.
   *
   * The frame cannot reach the network (`connect-src 'none'`), so its shimmed
   * `window.fetch` forwards each request here; it runs through the shared Node
   * HTTP client (no browser CORS) and the response is posted back. The result
   * is addressed only by `requestId` and never retargets anything, so a renderer
   * cannot use this to reach beyond what its own fetch call requested.
   */
  private async runProxyRequest(
    entry: PreviewEntry,
    requestId: string,
    request: ProxyHttpRequest
  ): Promise<void> {
    const post = (message: unknown): void => {
      if (entry.disposed) return;
      void entry.panel.webview.postMessage(message);
    };

    if (!this.isTryItEnabled()) {
      post({ type: 'openApiProxyResponse', data: { requestId, error: 'Try It is disabled.' } });
      return;
    }

    const controller = new AbortController();
    entry.proxyControllers.set(requestId, controller);
    try {
      const config: HttpRequestConfig = {
        method: (request.method || 'GET').toUpperCase(),
        url: request.url,
        headers: sanitizeProxyHeaders(request.headers),
        params: {},
        data: request.body,
        timeout: PROXY_TIMEOUT_MS,
        signal: controller.signal,
      };
      const result = await executeRequest(config);
      post({
        type: 'openApiProxyResponse',
        data: { requestId, response: serializeProxyResponse(result, request.url) },
      });
    } catch (error) {
      // AbortError included: the frame that issued it is gone, so a best-effort
      // error post is harmless (dropped by the disposed guard or channel mismatch).
      post({
        type: 'openApiProxyResponse',
        data: { requestId, error: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      entry.proxyControllers.delete(requestId);
    }
  }

  private push(key: string): void {
    const entry = this.entries.get(key);
    if (!entry || !entry.ready) return;

    const document = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === key
    );
    if (!document) return;
    if (entry.sentVersion === document.version) return;

    const payload = this.buildPayload(entry, document);
    entry.panel.webview.postMessage({ type: 'openApiPreviewData', data: payload } satisfies OpenApiPreviewDataMessage);
    entry.sentVersion = document.version;
  }

  /**
   * Currency is derived from the raw parsed value rather than
   * `analysis.version`, which the analysis cache intentionally keeps sticky
   * across parse failures and would therefore never report staleness.
   */
  private buildPayload(
    entry: PreviewEntry,
    document: vscode.TextDocument
  ): OpenApiPreviewDataMessage['data'] {
    const parsed = getOpenApiAnalysis(document).parsedSpec;
    const isObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    const version = isObject
      ? detectOpenApiVersion((parsed as Record<string, unknown>).openapi)
      : undefined;
    const tryItEnabled = this.isTryItEnabled();

    if (isObject && version) {
      entry.lastValidSpec = parsed as object;
      entry.lastValidVersion = version;
      return {
        documentUri: document.uri.toString(),
        documentVersion: document.version,
        spec: parsed as object,
        version,
        stale: false,
        tryItEnabled,
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
    const active = document
      ? hasEverBeenOpenApi(document.uri) || detectOpenApiDocument(document).isOpenApi
      : false;
    vscode.commands.executeCommand('setContext', 'nouto.openApiActive', active);
  }

  private getHtml(webview: vscode.Webview, sourceUri: string): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'openapi-preview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));
    const nonce = getNonce();

    // `frame-src blob:` hosts the sandboxed renderer iframe. No connect-src is
    // granted: the preview never talks to the network.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource} data:; frame-src blob:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>OpenAPI Preview</title>
</head>
<body>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
    window.__noutoOpenApiSourceUri = ${JSON.stringify(sourceUri)};
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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

/** Drops headers the host HTTP client sets itself or must not forward verbatim. */
function sanitizeProxyHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    if (!key || PROXY_DROP_HEADERS.has(key.toLowerCase())) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * Serializes an {@link HttpResponse} for postMessage. Binary bodies arrive as a
 * Buffer (not structured-clone-safe) and are base64-encoded, mirroring the main
 * request panel's convention; text/JSON bodies travel as UTF-8.
 */
function serializeProxyResponse(result: HttpResponse, requestUrl: string): ProxyHttpResponse {
  let body: string;
  let bodyEncoding: 'utf8' | 'base64';
  const data = result.data;
  if (Buffer.isBuffer(data)) {
    body = data.toString('base64');
    bodyEncoding = 'base64';
  } else if (data == null) {
    body = '';
    bodyEncoding = 'utf8';
  } else if (typeof data === 'string') {
    body = data;
    bodyEncoding = 'utf8';
  } else {
    body = JSON.stringify(data);
    bodyEncoding = 'utf8';
  }
  return {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
    body,
    bodyEncoding,
    url: requestUrl,
  };
}

function getNonce(): string {
  return require('crypto').randomBytes(24).toString('base64url');
}
