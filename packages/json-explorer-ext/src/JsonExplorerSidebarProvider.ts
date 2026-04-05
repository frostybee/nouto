import * as vscode from 'vscode';
import pkg from '../package.json';

const RECENT_FILES_KEY = 'noutoJsonExplorer.recentFiles';
const MAX_RECENT = 15;

export interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
}

export class JsonExplorerSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'noutoJsonExplorer.sidebar';
  private _view?: vscode.WebviewView;
  private _aboutPanel?: vscode.WebviewPanel;

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
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          this._sendRecentFiles();
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
          const uri = vscode.Uri.file(message.path);
          await vscode.commands.executeCommand('vscode.openWith', uri, 'noutoJsonExplorer.view');
          break;
        }

        case 'removeRecentFile': {
          const files = this._getRecentFiles().filter((f) => f.path !== message.path);
          await this._saveRecentFiles(files);
          this._sendRecentFiles();
          break;
        }

        case 'clearRecent': {
          await this._saveRecentFiles([]);
          this._sendRecentFiles();
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
          this._openPastedJson(text);
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
    if (this._aboutPanel) {
      try {
        this._aboutPanel.reveal();
        return;
      } catch {
        this._aboutPanel = undefined;
      }
    }

    const panel = vscode.window.createWebviewPanel(
      'noutoJsonExplorer.about',
      'About',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [] },
    );

    this._aboutPanel = panel;
    panel.webview.html = this._getAboutHtml(panel.webview);

    const disposable = panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'openLink') {
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
    });

    panel.onDidDispose(() => {
      disposable.dispose();
      this._aboutPanel = undefined;
    });
  }

  private _openPastedJson(content: string): void {
    const panel = vscode.window.createWebviewPanel(
      'noutoJsonExplorer.view',
      'Pasted JSON',
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
              requestName: 'Pasted JSON',
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; font-src ${webview.cspSource};">
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

  private _getAboutHtml(webview: vscode.Webview): string {
    const nonce = this._getNonce();
    const repoUrl = 'https://github.com/frostybee/nouto';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>About</title>
  <style>
    body {
      padding: 24px 28px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.5;
    }
    h1 {
      font-size: 1.4em;
      font-weight: 700;
      margin: 0 0 12px;
      color: var(--vscode-foreground);
    }
    p {
      margin: 0 0 24px;
      color: var(--vscode-descriptionForeground);
    }
    h2 {
      font-size: 1em;
      font-weight: 700;
      margin: 0 0 8px;
      color: var(--vscode-foreground);
    }
    .section {
      margin-bottom: 20px;
    }
    .links {
      display: flex;
      gap: 4px;
      align-items: center;
      flex-wrap: wrap;
    }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .sep {
      color: var(--vscode-descriptionForeground);
      opacity: 0.5;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      margin-left: 6px;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <h1>${pkg.displayName} <span class="badge">v${pkg.version}</span></h1>
  <p>${pkg.description}</p>

  <div class="section">
    <h2>Development</h2>
    <div class="links">
      <a href="#" data-url="${repoUrl}">GitHub</a>
      <span class="sep">•</span>
      <a href="#" data-url="${repoUrl}/issues">Issues</a>
      <span class="sep">•</span>
      <a href="#" data-url="${repoUrl}/discussions">Discussions</a>
    </div>
  </div>

  <div class="section">
    <h2>Resources</h2>
    <div class="links">
      <a href="#" data-url="${repoUrl}/blob/main/packages/json-explorer-ext/CHANGELOG.md">Changelog</a>
      <span class="sep">•</span>
      <a href="#" data-url="${repoUrl}/blob/main/LICENSE">License (${pkg.license})</a>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('a[data-url]').forEach(function(a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        vscode.postMessage({ type: 'openLink', url: a.dataset.url });
      });
    });
  </script>
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
