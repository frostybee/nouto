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
  );
}

export function deactivate() {}
