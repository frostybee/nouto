import * as vscode from 'vscode';
import { detectOpenApiVersion } from '@nouto/core/services';
import type { OpenApiVersion } from '@nouto/core/services';
import type { OpenApiPreviewDataMessage } from '@nouto/transport';
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
  pendingPush: Debounced<[]>;
  disposables: vscode.Disposable[];
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

  constructor(private readonly extensionUri: vscode.Uri) {}

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
      pendingPush: debounce(() => { this.push(key); }, PREVIEW_DEBOUNCE_MS),
      disposables: [],
    };
    this.entries.set(key, entry);

    panel.webview.html = this.getHtml(panel.webview, key);

    entry.disposables.push(
      panel.webview.onDidReceiveMessage((message: { type?: string }) => {
        if (message?.type === 'openApiPreviewReady') {
          entry.ready = true;
          // The webview may have been reloaded, so resend unconditionally.
          entry.sentVersion = undefined;
          this.push(key);
        }
      })
    );

    panel.onDidDispose(() => {
      entry.pendingPush.cancel();
      for (const disposable of entry.disposables) disposable.dispose();
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
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

    if (isObject && version) {
      entry.lastValidSpec = parsed as object;
      entry.lastValidVersion = version;
      return {
        documentUri: document.uri.toString(),
        documentVersion: document.version,
        spec: parsed as object,
        version,
        stale: false,
      };
    }

    // Stale payloads carry no spec: the webview keeps rendering the last one it
    // received, or shows an empty state when it never received any.
    return {
      documentUri: document.uri.toString(),
      documentVersion: document.version,
      version: entry.lastValidVersion,
      stale: true,
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; frame-src blob:;">
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

function getNonce(): string {
  return require('crypto').randomBytes(24).toString('base64url');
}
