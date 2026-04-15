import * as vscode from 'vscode';

export interface JsonExplorerInitData {
  json: any;
  contentType: string;
  requestName?: string;
  requestMethod?: string;
  requestUrl?: string;
  requestId?: string;
  panelId?: string;
  timestamp?: string;
}

export interface IJsonExplorerContext {
  /** Reveal the request panel that produced this response */
  focusRequest(requestId: string): void;
  /** Create an assertion on the originating request */
  createAssertion(data: { requestId: string; path: string; operator: string; expected: any }): void;
  /** Save a value as an environment variable */
  saveToEnvironment(data: { key: string; value: string }): void;
}

export class JsonExplorerPanelHandler {
  private _panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getNonce: () => string,
    private readonly ctx?: IJsonExplorerContext,
  ) {}

  /**
   * Refresh an existing JSON Explorer panel with new response data.
   * Preserves the explorer's UI state (expanded nodes, view mode, bookmarks).
   * Looks up the panel by the request panel ID that opened it.
   */
  refreshPanel(panelId: string, json: any, contentType?: string, meta?: { method?: string; url?: string; name?: string }): void {
    const panel = this._panels.get(panelId);
    if (!panel) return;

    panel.webview.postMessage({
      type: 'updateJsonData',
      data: {
        json: typeof json === 'object' ? JSON.stringify(json) : json,
        timestamp: new Date().toISOString(),
        requestMethod: meta?.method,
        requestUrl: meta?.url,
        requestName: meta?.name,
      },
    });
  }

  openJsonExplorer(data: JsonExplorerInitData): void {
    const title = data.requestName
      ? `JSON Explorer: ${data.requestName}`
      : 'JSON Explorer';

    // Add timestamp if not provided
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
    }

    // If a panel already exists for this request panel, reveal it and send new data
    if (data.panelId) {
      const existing = this._panels.get(data.panelId);
      if (existing) {
        existing.reveal(vscode.ViewColumn.Beside);
        existing.webview.postMessage({
          type: 'initJsonExplorer',
          data,
        });
        return;
      }
    }

    const panel = vscode.window.createWebviewPanel(
      'nouto.jsonExplorer',
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'webview-dist'),
        ],
      }
    );

    // Track panel by the request panelId that opened it
    if (data.panelId) {
      this._panels.set(data.panelId, panel);
    }

    panel.webview.html = this.getHtml(panel.webview);

    const msgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message.type) {
          case 'ready':
            panel.webview.postMessage({
              type: 'initJsonExplorer',
              data,
            });
            break;

          case 'focusRequest':
            if (message.data?.requestId && this.ctx) {
              this.ctx.focusRequest(message.data.requestId);
            }
            break;

          case 'createAssertion':
            if (message.data && this.ctx) {
              this.ctx.createAssertion(message.data);
            }
            break;

          case 'saveToEnvironment':
            if (message.data && this.ctx) {
              this.ctx.saveToEnvironment(message.data);
            }
            break;
        }
      } catch (err) {
        console.error('[Nouto] Error in JSON Explorer panel message handler:', err);
      }
    });

    panel.onDidDispose(() => {
      msgDisposable.dispose();
      if (data.panelId) {
        this._panels.delete(data.panelId);
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'json-explorer.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>JSON Explorer</title>
</head>
<body>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
