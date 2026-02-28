import * as vscode from 'vscode';
import type { StorageService } from '../services/StorageService';
import type { CollectionMode } from '../services/types';

async function switchCollectionMode(
  storageService: StorageService,
  newMode: CollectionMode,
  onSwitch: () => Promise<void>,
): Promise<void> {
  const currentMode = storageService.getCollectionMode();
  if (currentMode === newMode) {
    vscode.window.showInformationMessage(`Already using "${newMode}" collection mode.`);
    return;
  }

  if (newMode !== 'global' && !storageService.getWorkspaceRoot()) {
    vscode.window.showWarningMessage(
      'No workspace folder is open. Workspace and combined collection modes require an open workspace.'
    );
    return;
  }

  // Update the setting — use Global scope so it persists even without a workspace
  const config = vscode.workspace.getConfiguration('hivefetch');
  const target = newMode === 'global' || !storageService.getWorkspaceRoot()
    ? vscode.ConfigurationTarget.Global
    : vscode.ConfigurationTarget.Workspace;
  await config.update('storage.collectionMode', newMode, target);

  // Reinitialize workspace strategy
  storageService.reinitializeWorkspaceStrategy();

  // If switching to workspace or both, ensure .fetchman/.gitignore exists
  if (newMode !== 'global') {
    const { WorkspaceStorageStrategy } = await import('../services/storage/WorkspaceStorageStrategy');
    const wsStrategy = new WorkspaceStorageStrategy(storageService.getWorkspaceRoot()!);
    await wsStrategy.ensureGitignore();
  }

  vscode.window.showInformationMessage(`Switched to "${newMode}" collection mode.`);
  await onSwitch();
}

export function registerSwitchToWorkspaceCollectionsCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.switchToWorkspaceCollections', async () => {
    const confirm = await vscode.window.showInformationMessage(
      'Switch to workspace collections? Collections will be stored in .fetchman/collections/ in your workspace root, making them version-controllable with git.',
      { modal: true },
      'Switch'
    );
    if (confirm !== 'Switch') return;
    await switchCollectionMode(storageService, 'workspace', onSwitch);
  });
}

export function registerSwitchToGlobalCollectionsCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.switchToGlobalCollections', async () => {
    const confirm = await vscode.window.showInformationMessage(
      'Switch to global collections? Collections will be stored in VS Code global storage, accessible from any workspace.',
      { modal: true },
      'Switch'
    );
    if (confirm !== 'Switch') return;
    await switchCollectionMode(storageService, 'global', onSwitch);
  });
}

export function registerSwitchToBothCollectionsCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.switchToBothCollections', async () => {
    const confirm = await vscode.window.showInformationMessage(
      'Use both global and workspace collections? Collections from VS Code global storage and .fetchman/ will be merged in the sidebar.',
      { modal: true },
      'Switch'
    );
    if (confirm !== 'Switch') return;
    await switchCollectionMode(storageService, 'both', onSwitch);
  });
}
