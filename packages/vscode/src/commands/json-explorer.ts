import * as vscode from 'vscode';
import type { RequestPanelManager } from '../providers/RequestPanelManager';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function registerOpenInJsonExplorerCommand(
  panelManager: RequestPanelManager,
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openInJsonExplorer', async (uri?: vscode.Uri) => {
    // Resolve URI: from context menu arg, active editor, or prompt user
    if (!uri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && (activeEditor.document.languageId === 'json' || activeEditor.document.languageId === 'jsonc')) {
        uri = activeEditor.document.uri;
      }
    }

    if (!uri) {
      vscode.window.showWarningMessage('No JSON file selected. Open a .json file or right-click one in the explorer.');
      return;
    }

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE) {
        vscode.window.showWarningMessage(
          `File is too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). The JSON Explorer supports files up to 20 MB in VS Code. Use the desktop app for larger files.`
        );
        return;
      }

      const raw = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(raw).toString('utf-8');
      const json = JSON.parse(text);
      const fileName = uri.path.split('/').pop() || 'Untitled';

      panelManager.openJsonFile(json, fileName);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        vscode.window.showErrorMessage(`Invalid JSON: ${err.message}`);
      } else {
        vscode.window.showErrorMessage(`Failed to open file: ${err.message || err}`);
      }
    }
  });
}
