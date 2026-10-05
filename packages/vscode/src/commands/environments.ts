import * as vscode from 'vscode';

export function registerOpenEnvironmentsCommand(
  openFn: () => Promise<void>
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openEnvironments', openFn);
}

export function registerOpenCookieJarsCommand(
  openFn: () => Promise<void>
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openCookieJars', openFn);
}
