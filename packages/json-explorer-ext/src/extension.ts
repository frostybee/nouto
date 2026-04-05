import * as vscode from 'vscode';
import { JsonEditorProvider } from './JsonEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new JsonEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('noutoJsonExplorer.view', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand('noutoJsonExplorer.openFile', () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (uri) {
        vscode.commands.executeCommand('vscode.openWith', uri, 'noutoJsonExplorer.view');
      }
    }),

    vscode.commands.registerCommand('noutoJsonExplorer.openFromDisk', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: false,
        filters: { 'JSON Files': ['json'] },
        title: 'Open JSON File',
      });
      if (!uris || uris.length === 0) return;
      await vscode.commands.executeCommand('vscode.openWith', uris[0], 'noutoJsonExplorer.view');
    }),
  );
}

export function deactivate() {}
