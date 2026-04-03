import * as vscode from 'vscode';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export class JsonEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

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

    const fileName = uri.path.split('/').pop() ?? 'Unknown';

    // Handle messages from the webview
    const msgDisposable = webviewPanel.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'ready':
          webviewPanel.webview.postMessage({
            type: 'initJsonExplorer',
            data: {
              json: jsonContent,
              contentType: 'application/json',
              requestName: fileName,
              timestamp: new Date().toISOString(),
            },
          });
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
