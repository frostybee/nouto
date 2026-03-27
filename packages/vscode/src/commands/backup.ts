import * as vscode from 'vscode';
import { BackupService, type BackupOptions } from '../services/BackupService';

const ALL_SECTIONS = [
  { label: 'Collections', key: 'includeCollections', picked: true },
  { label: 'Environments', key: 'includeEnvironments', picked: true },
  { label: 'Cookies', key: 'includeCookies', picked: true },
  { label: 'History', key: 'includeHistory', picked: true },
  { label: 'Drafts', key: 'includeDrafts', picked: true },
  { label: 'Trash', key: 'includeTrash', picked: true },
  { label: 'Runner history', key: 'includeRunnerHistory', picked: true },
  { label: 'Mock server routes', key: 'includeMocks', picked: true },
  { label: 'Settings', key: 'includeSettings', picked: true },
] as const;

function formatDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function registerExportBackupCommand(
  storageDir: string,
  globalState: vscode.Memento,
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.exportBackup', async () => {
    // Let user pick which sections to include
    const picks = await vscode.window.showQuickPick(
      ALL_SECTIONS.map(s => ({ label: s.label, key: s.key, picked: s.picked })),
      {
        canPickMany: true,
        placeHolder: 'Select data to include in backup (all selected by default)',
        title: 'Export Backup',
      }
    );
    if (!picks || picks.length === 0) return;

    const options: BackupOptions = {
      includeCollections: false,
      includeEnvironments: false,
      includeCookies: false,
      includeHistory: false,
      includeDrafts: false,
      includeTrash: false,
      includeRunnerHistory: false,
      includeMocks: false,
      includeSettings: false,
    };
    for (const pick of picks) {
      (options as any)[pick.key] = true;
    }

    const service = new BackupService(storageDir, globalState);

    try {
      const content = await service.exportBackup(options);

      const defaultName = `nouto-backup-${formatDate()}.nouto-backup`;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: { 'Nouto Backup': ['nouto-backup'] },
        title: 'Save Backup',
      });
      if (!uri) return;

      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(content));

      const sizeKb = Math.round(content.length / 1024);
      vscode.window.showInformationMessage(
        `Backup saved to ${uri.fsPath} (${sizeKb} KB, ${picks.length} sections)`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Backup export failed: ${err.message}`);
    }
  });
}

export function registerImportBackupCommand(
  storageDir: string,
  globalState: vscode.Memento,
  onDataRestored: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.importBackup', async () => {
    // Pick backup file
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Nouto Backup': ['nouto-backup', 'json'] },
      openLabel: 'Restore Backup',
      title: 'Select Backup File',
    });
    if (!uris || uris.length === 0) return;

    // Read and validate
    const raw = await vscode.workspace.fs.readFile(uris[0]);
    const content = new TextDecoder().decode(raw);

    const service = new BackupService(storageDir, globalState);

    let backup;
    try {
      backup = service._parseAndValidate(content);
    } catch (err: any) {
      vscode.window.showErrorMessage(err.message);
      return;
    }

    // Show manifest summary
    const m = backup.manifest;
    const summary: string[] = [];
    if (m.collections.included) summary.push(`${m.collections.count} collections`);
    if (m.environments.included) summary.push(`${m.environments.count} environments`);
    if (m.cookies.included) summary.push(`${m.cookies.jarCount} cookie jars`);
    if (m.history.included) summary.push(`${m.history.count} history entries`);
    if (m.drafts.included) summary.push(`${m.drafts.count} drafts`);
    if (m.trash.included) summary.push(`${m.trash.count} trash items`);
    if (m.runnerHistory.included) summary.push(`${m.runnerHistory.count} runner results`);
    if (m.mocks.included) summary.push(`${m.mocks.routeCount} mock routes`);
    if (m.settings.included) summary.push('settings');

    const summaryText = summary.length > 0 ? summary.join(', ') : 'no data';

    // Confirm with user
    const confirm = await vscode.window.showWarningMessage(
      `This backup contains: ${summaryText}.\n\nRestoring will replace your current data. A snapshot of your current state will be saved first. Secrets will need to be re-entered.`,
      { modal: true },
      'Restore',
    );
    if (confirm !== 'Restore') return;

    try {
      const result = await service.importBackup(content);

      // Reload all in-memory state
      await onDataRestored();

      const parts = [`Restored: ${result.sectionsRestored.join(', ')}.`];
      if (result.collectionsCount > 0) parts.push(`${result.collectionsCount} collections`);
      if (result.historyCount > 0) parts.push(`${result.historyCount} history entries`);
      parts.push('Re-enter any secret variables in Environments.');

      vscode.window.showInformationMessage(parts.join(' '));
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Restore failed: ${err.message}. A pre-restore snapshot was saved in your Nouto storage directory.`
      );
    }
  });
}
