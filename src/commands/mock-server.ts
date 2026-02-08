import * as vscode from 'vscode';

export function registerOpenMockServerCommand(
  openPanel: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.openMockServer', async () => {
    await openPanel();
  });
}
