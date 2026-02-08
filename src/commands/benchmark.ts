import * as vscode from 'vscode';

export function registerBenchmarkCommand(
  openPanel: (requestId: string, collectionId?: string) => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.benchmarkRequest', async (requestId?: string, collectionId?: string) => {
    if (!requestId) {
      vscode.window.showErrorMessage('No request specified for benchmarking.');
      return;
    }
    await openPanel(requestId, collectionId);
  });
}
