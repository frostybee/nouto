import * as vscode from 'vscode';
import { parseJsonOrJsonl } from '@nouto/json-explorer/src/lib/jsonl';
import type { JsonExplorerSidebarProvider } from './JsonExplorerSidebarProvider';

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Show an open dialog, read and parse the picked JSON file, and post the
 * parsed value back to the webview as a comparison document.
 */
export async function pickAndPostCompareFile(webview: vscode.Webview): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: false,
    filters: { 'JSON Files': ['json', 'jsonl', 'ndjson'] },
    title: 'Choose JSON File to Compare',
  });
  if (!uris || uris.length === 0) return;

  let text: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uris[0]);
    text = new TextDecoder().decode(bytes);
  } catch {
    vscode.window.showErrorMessage(`Failed to read file: ${uris[0].fsPath}`);
    return;
  }

  const result = parseJsonOrJsonl(text);
  if (result.error !== undefined) {
    vscode.window.showErrorMessage(`Not valid JSON: ${result.error}`);
    return;
  }
  webview.postMessage({ type: 'compareWithJson', data: { json: result.data } });
}

export class JsonEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sidebarProvider?: JsonExplorerSidebarProvider,
  ) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const uri = document.uri;

    // Check file size
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > MAX_FILE_SIZE) {
      vscode.window.showWarningMessage(
        `File is too large for JSON Explorer (${(stat.size / 1024 / 1024).toFixed(1)} MB). Opening in default editor.`,
      );
      vscode.commands.executeCommand('vscode.openWith', uri, 'default');
      return;
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist'),
      ],
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    let jsonContent: string | undefined;

    // Read the file content
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      jsonContent = new TextDecoder().decode(bytes);
    } catch {
      vscode.window.showErrorMessage(`Failed to read file: ${uri.fsPath}`);
      return;
    }

    this.sidebarProvider?.addRecentFile(uri);

    const fileName = uri.path.split('/').pop() ?? 'Unknown';

    const reportParseError = (content: string) => {
      if (!/\.(jsonl|ndjson)$/i.test(uri.path)) return;
      const result = parseJsonOrJsonl(content);
      if (result.error) {
        vscode.window.showErrorMessage(`${fileName}: ${result.error}`);
      }
    };
    reportParseError(jsonContent);

    // Handle messages from the webview
    const msgDisposable = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          webviewPanel.webview.postMessage({
            type: 'initJsonExplorer',
            data: {
              json: jsonContent,
              contentType: 'application/json',
              requestName: fileName,
              timestamp: new Date().toISOString(),
              arrayPageSize: vscode.workspace.getConfiguration('noutoJsonExplorer').get<number>('arrayPageSize'),
            },
          });
          break;

        case 'saveToFile': {
          const { content, format, extension: ext } = message as { content: string; format: string; extension: string };
          const filters: Record<string, string[]> = {};
          if (format === 'json' || format === 'minified') filters['JSON'] = ['json'];
          else if (format === 'yaml') filters['YAML'] = ['yaml', 'yml'];
          else if (format === 'csv') filters['CSV'] = ['csv'];
          else filters['All Files'] = ['*'];

          const baseName = uri.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'export';
          const defaultUri = vscode.Uri.joinPath(uri, '..', `${baseName}${ext}`);
          const saveUri = await vscode.window.showSaveDialog({ defaultUri, filters });
          if (saveUri) {
            await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(content));
          }
          break;
        }

        case 'openSubtreePanel': {
          const { json, path } = message.data as { json: string; path: string };
          this.sidebarProvider?.openJsonPanel(json, path, path);
          break;
        }

        case 'pickCompareFile':
          await pickAndPostCompareFile(webviewPanel.webview);
          break;

        // Nouto-specific messages: no-op in standalone
        case 'focusRequest':
        case 'createAssertion':
        case 'saveToEnvironment':
          break;
      }
    });

    // Watch for file changes and update the explorer
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(uri, '*'),
    );

    const updateFromDisk = async () => {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const updated = new TextDecoder().decode(bytes);
        jsonContent = updated;
        reportParseError(updated);
        webviewPanel.webview.postMessage({
          type: 'updateJsonData',
          data: {
            json: updated,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        // File may have been deleted or moved
      }
    };

    const changeDisposable = watcher.onDidChange(updateFromDisk);

    // Also watch for saves from VS Code text editors on the same file
    const saveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.toString() === uri.toString()) {
        jsonContent = doc.getText();
        webviewPanel.webview.postMessage({
          type: 'updateJsonData',
          data: {
            json: jsonContent,
            timestamp: new Date().toISOString(),
          },
        });
      }
    });

    webviewPanel.onDidDispose(() => {
      msgDisposable.dispose();
      changeDisposable.dispose();
      saveDisposable.dispose();
      watcher.dispose();
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'json-explorer.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'style.css'));
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

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }
}
