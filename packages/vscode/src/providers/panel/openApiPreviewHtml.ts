import * as vscode from 'vscode';

/**
 * HTML shell for the documentation-preview webview. `frame-src blob:` hosts
 * the sandboxed renderer iframe. No connect-src is granted: the preview never
 * talks to the network.
 */
export function buildPreviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  sourceUri: string
): string {
  const distPath = vscode.Uri.joinPath(extensionUri, 'webview-dist');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'openapi-preview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));
  const nonce = getNonce();

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

function getNonce(): string {
  return require('crypto').randomBytes(24).toString('base64url');
}
