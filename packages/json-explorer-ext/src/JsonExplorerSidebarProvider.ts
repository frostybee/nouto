import * as vscode from 'vscode';
import pkg from '../package.json';
import { MAX_FILE_SIZE } from './JsonEditorProvider';

const RECENT_FILES_KEY = 'noutoJsonExplorer.recentFiles';
const MAX_RECENT = 15;
const FETCH_TIMEOUT_MS = 30_000;
const HEADERS_SECRET_PREFIX = 'noutoJsonExplorer.headers:';

export interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
  kind?: 'file' | 'url';
}

export interface FetchHeader {
  name: string;
  value: string;
}

export class JsonExplorerSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'noutoJsonExplorer.sidebar';
  private _view?: vscode.WebviewView;
  private _showingAbout = false;
  private _pendingShowFetchForm = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'images'),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          this._sendRecentFiles();
          if (this._pendingShowFetchForm) {
            this._pendingShowFetchForm = false;
            this._view?.webview.postMessage({ type: 'showFetchForm' });
          }
          break;

        case 'openFromDisk': {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFolders: false,
            filters: { 'JSON Files': ['json'] },
            title: 'Open JSON File',
          });
          if (!uris || uris.length === 0) return;
          this.addRecentFile(uris[0]);
          await vscode.commands.executeCommand('vscode.openWith', uris[0], 'noutoJsonExplorer.view');
          break;
        }

        case 'openRecentFile': {
          const entry = this._getRecentFiles().find((f) => f.path === message.path);
          if (entry?.kind === 'url') {
            await this._fetchAndOpen(entry.path, await this._loadHeaders(entry.path));
          } else {
            const uri = vscode.Uri.file(message.path);
            await vscode.commands.executeCommand('vscode.openWith', uri, 'noutoJsonExplorer.view');
          }
          break;
        }

        case 'removeRecentFile': {
          const entry = this._getRecentFiles().find((f) => f.path === message.path);
          if (entry?.kind === 'url') {
            await this._deleteHeaders(entry.path);
          }
          const files = this._getRecentFiles().filter((f) => f.path !== message.path);
          await this._saveRecentFiles(files);
          this._sendRecentFiles();
          break;
        }

        case 'fetchFromUrl': {
          await this._fetchAndOpen(message.url, message.headers ?? []);
          break;
        }

        case 'clearRecent': {
          await this._saveRecentFiles([]);
          this._sendRecentFiles();
          break;
        }

        case 'openLink': {
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        }

        case 'viewChanged': {
          this._showingAbout = message.view === 'about';
          break;
        }

        case 'pasteJson': {
          const text = await vscode.env.clipboard.readText();
          if (!text.trim()) {
            vscode.window.showWarningMessage('Clipboard is empty.');
            return;
          }
          try {
            JSON.parse(text);
          } catch {
            vscode.window.showErrorMessage('Clipboard content is not valid JSON.');
            return;
          }
          this._openJsonPanel(text, 'Pasted JSON', 'Pasted JSON');
          break;
        }
      }
    });
  }

  addRecentFile(uri: vscode.Uri): void {
    const path = uri.fsPath;
    const name = path.split(/[\\/]/).pop() ?? path;
    const files = this._getRecentFiles().filter((f) => f.path !== path);
    files.unshift({ path, name, timestamp: Date.now() });
    if (files.length > MAX_RECENT) files.length = MAX_RECENT;
    this._saveRecentFiles(files);
    this._sendRecentFiles();
  }

  clearRecent(): void {
    this._saveRecentFiles([]);
    this._sendRecentFiles();
  }

  openAbout(): void {
    if (!this._view) return;
    if (this._showingAbout) {
      this._showingAbout = false;
      this._view.webview.postMessage({ type: 'showMain' });
      return;
    }
    this._showingAbout = true;
    const iconUri = this._view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'images', 'icon.png'),
    ).toString();
    this._view.webview.postMessage({
      type: 'showAbout',
      iconUrl: iconUri,
      version: pkg.version,
    });
  }

  async openFetchForm(): Promise<void> {
    if (this._view) {
      this._view.show?.(false);
      this._view.webview.postMessage({ type: 'showFetchForm' });
    } else {
      this._pendingShowFetchForm = true;
    }
    await vscode.commands.executeCommand('noutoJsonExplorer.sidebar.focus');
  }

  addRecentUrl(url: string): void {
    let name = url;
    try {
      name = new URL(url).hostname;
    } catch { /* keep full url as name */ }
    const files = this._getRecentFiles().filter((f) => f.path !== url);
    files.unshift({ path: url, name, timestamp: Date.now(), kind: 'url' });
    if (files.length > MAX_RECENT) files.length = MAX_RECENT;
    this._saveRecentFiles(files);
    this._sendRecentFiles();
  }

  private async _fetchAndOpen(url: string, headers: FetchHeader[]): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      vscode.window.showErrorMessage('Invalid URL.');
      this._postFetchDone(false);
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      vscode.window.showErrorMessage('Only http:// and https:// URLs are supported.');
      this._postFetchDone(false);
      return;
    }

    let ok = false;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fetching JSON from ${parsed.hostname}…`,
        cancellable: true,
      },
      async (_progress, token) => {
        const controller = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, FETCH_TIMEOUT_MS);
        token.onCancellationRequested(() => controller.abort());

        try {
          const response = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: Object.fromEntries(headers.map((h) => [h.name, h.value])),
          });
          if (!response.ok) {
            vscode.window.showErrorMessage(`Fetch failed: HTTP ${response.status} ${response.statusText}`.trim());
            return;
          }

          const contentLength = Number(response.headers.get('content-length'));
          if (contentLength > MAX_FILE_SIZE) {
            vscode.window.showWarningMessage(
              `Response is ${(contentLength / (1024 * 1024)).toFixed(1)} MB. Responses larger than 20 MB are not supported.`,
            );
            return;
          }

          const text = await response.text();
          const byteSize = Buffer.byteLength(text, 'utf8');
          if (byteSize > MAX_FILE_SIZE) {
            vscode.window.showWarningMessage(
              `Response is ${(byteSize / (1024 * 1024)).toFixed(1)} MB. Responses larger than 20 MB are not supported.`,
            );
            return;
          }

          try {
            JSON.parse(text);
          } catch {
            vscode.window.showErrorMessage('Response is not valid JSON.');
            return;
          }

          this._openJsonPanel(text, parsed.hostname, url);
          this.addRecentUrl(url);
          if (headers.length > 0) {
            await this._storeHeaders(url, headers);
          }
          ok = true;
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') {
            if (timedOut) {
              vscode.window.showErrorMessage('Request timed out after 30 seconds.');
            }
            // User cancellation: silent.
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to fetch: ${msg}`);
          }
        } finally {
          clearTimeout(timeout);
        }
      },
    );
    this._postFetchDone(ok);
  }

  private _postFetchDone(ok: boolean): void {
    this._view?.webview.postMessage({ type: 'fetchDone', ok });
  }

  private _storeHeaders(url: string, headers: FetchHeader[]): Thenable<void> {
    return this.context.secrets.store(HEADERS_SECRET_PREFIX + url, JSON.stringify(headers));
  }

  private async _loadHeaders(url: string): Promise<FetchHeader[]> {
    const raw = await this.context.secrets.get(HEADERS_SECRET_PREFIX + url);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private _deleteHeaders(url: string): Thenable<void> {
    return this.context.secrets.delete(HEADERS_SECRET_PREFIX + url);
  }

  private _openJsonPanel(content: string, panelTitle: string, requestName: string): void {
    const panel = vscode.window.createWebviewPanel(
      'noutoJsonExplorer.view',
      panelTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist'),
        ],
      },
    );

    panel.webview.html = this._getJsonExplorerHtml(panel.webview);

    const disposable = panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initJsonExplorer',
            data: {
              json: content,
              contentType: 'application/json',
              requestName,
              timestamp: new Date().toISOString(),
            },
          });
          break;

        case 'saveToFile': {
          const { content: fileContent, format, extension: ext } = message as {
            content: string;
            format: string;
            extension: string;
          };
          const filters: Record<string, string[]> = {};
          if (format === 'json' || format === 'minified') filters['JSON'] = ['json'];
          else if (format === 'yaml') filters['YAML'] = ['yaml', 'yml'];
          else if (format === 'csv') filters['CSV'] = ['csv'];
          else filters['All Files'] = ['*'];
          const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`pasted${ext}`),
            filters,
          });
          if (saveUri) {
            await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(fileContent));
          }
          break;
        }
      }
    });

    panel.onDidDispose(() => disposable.dispose());
  }

  private _getJsonExplorerHtml(webview: vscode.Webview): string {
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'json-explorer.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'style.css'));
    const nonce = this._getNonce();

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

  private _getRecentFiles(): RecentFile[] {
    return this.context.globalState.get<RecentFile[]>(RECENT_FILES_KEY) ?? [];
  }

  private _saveRecentFiles(files: RecentFile[]): Thenable<void> {
    return this.context.globalState.update(RECENT_FILES_KEY, files);
  }

  private _sendRecentFiles(): void {
    this._view?.webview.postMessage({
      type: 'recentFiles',
      data: this._getRecentFiles(),
    });
  }

  private _getHtml(webview: vscode.Webview): string {
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'sidebar.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'style.css'));
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource};">
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

  private _getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }
}
