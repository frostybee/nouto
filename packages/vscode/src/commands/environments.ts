import * as vscode from 'vscode';

export function registerOpenEnvironmentsCommand(
  openFn: () => Promise<void>
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openEnvironments', openFn);
}
