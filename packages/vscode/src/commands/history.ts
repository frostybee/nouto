import * as vscode from 'vscode';
import { HistoryExportService } from '../services/HistoryExportService';
import { HistoryStorageService } from '../services/HistoryStorageService';

export function registerExportHistoryCommand(
  getHistoryService: () => HistoryStorageService
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.exportHistory', async () => {
    const format = await vscode.window.showQuickPick(
      [
        { label: 'JSON', description: 'Full history with request/response data', id: 'json' as const },
        { label: 'CSV', description: 'Summary table (timestamp, method, url, status, duration)', id: 'csv' as const },
      ],
      { placeHolder: 'Select export format' }
    );
    if (!format) return;

    const service = new HistoryExportService(getHistoryService());
    const content = format.id === 'json'
      ? await service.exportJSON()
      : await service.exportCSV();

    const ext = format.id === 'json' ? 'json' : 'csv';
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`hivefetch-history.${ext}`),
      filters: { [format.label]: [ext] },
    });
    if (!uri) return;

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
    vscode.window.showInformationMessage(`History exported to ${uri.fsPath}`);
  });
}

export function registerImportHistoryCommand(
  getHistoryService: () => HistoryStorageService,
  onHistoryUpdated: () => Promise<void>
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importHistory', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON': ['json'] },
      openLabel: 'Import History',
    });
    if (!uris || uris.length === 0) return;

    const content = await vscode.workspace.fs.readFile(uris[0]);
    const text = new TextDecoder().decode(content);

    const service = new HistoryExportService(getHistoryService());
    try {
      const count = await service.importJSON(text);
      vscode.window.showInformationMessage(`Imported ${count} history entries.`);
      await onHistoryUpdated();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Import failed: ${err.message}`);
    }
  });
}
