import * as vscode from 'vscode';
import { JsonEditorProvider } from './JsonEditorProvider';
import { JsonExplorerSidebarProvider } from './JsonExplorerSidebarProvider';

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new JsonExplorerSidebarProvider(context);
  const provider = new JsonEditorProvider(context, sidebarProvider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      JsonExplorerSidebarProvider.viewType,
      sidebarProvider,
    ),

    vscode.window.registerCustomEditorProvider('noutoJsonExplorer.view', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand('noutoJsonExplorer.openFile', () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (uri) {
        sidebarProvider.addRecentFile(uri);
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
      sidebarProvider.addRecentFile(uris[0]);
      await vscode.commands.executeCommand('vscode.openWith', uris[0], 'noutoJsonExplorer.view');
    }),

    vscode.commands.registerCommand('noutoJsonExplorer.showAbout', () => {
      sidebarProvider.openAbout();
    }),

    vscode.commands.registerCommand('noutoJsonExplorer.clearRecent', async () => {
      const answer = await vscode.window.showWarningMessage(
        'Clear all recent files?',
        { modal: true },
        'Clear',
      );
      if (answer === 'Clear') {
        sidebarProvider.clearRecent();
      }
    }),
  );
}

export function deactivate() {}
