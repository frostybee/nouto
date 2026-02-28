import * as vscode from 'vscode';
import type { StorageService } from '../services/StorageService';
import type { CollectionMode } from '../services/types';
import { WorkspaceStorageStrategy } from '../services/storage/WorkspaceStorageStrategy';

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
      'Switch to workspace collections? Collections will be stored in .hivefetch/collections/ in your workspace root, making them version-controllable with git.',
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
      'Use both global and workspace collections? Collections from VS Code global storage and .hivefetch/ will be merged in the sidebar.',
      { modal: true },
      'Switch'
    );
    if (confirm !== 'Switch') return;
    await switchCollectionMode(storageService, 'both', onSwitch);
  });
}

/**
 * Export global collections into the workspace `.hivefetch/collections/` directory.
 * This copies (not moves) collections, making them version-controllable with git.
 */
export function registerExportToWorkspaceCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.exportCollectionsToWorkspace', async () => {
    const workspaceRoot = storageService.getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showWarningMessage('No workspace folder is open. Open a workspace first.');
      return;
    }

    // Load global collections
    const globalCollections = await storageService.loadGlobalCollections();
    const nonBuiltin = globalCollections.filter(c => !c.builtin);

    if (nonBuiltin.length === 0) {
      vscode.window.showInformationMessage('No collections to export (only built-in collections found).');
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Export ${nonBuiltin.length} collection(s) to .hivefetch/collections/ in your workspace? Existing workspace collections will be preserved.`,
      { modal: true },
      'Export'
    );
    if (confirm !== 'Export') return;

    try {
      const wsStrategy = new WorkspaceStorageStrategy(workspaceRoot);
      await wsStrategy.ensureGitignore();

      // Load existing workspace collections to merge
      const existingWorkspace = await wsStrategy.loadCollections();
      const existingIds = new Set(existingWorkspace.map(c => c.id));

      // Only add collections that don't already exist in workspace
      const toExport = nonBuiltin.filter(c => !existingIds.has(c.id));

      if (toExport.length === 0) {
        vscode.window.showInformationMessage('All global collections already exist in workspace.');
        return;
      }

      const merged = [...existingWorkspace, ...toExport];
      const success = await wsStrategy.saveCollections(merged);

      if (success) {
        vscode.window.showInformationMessage(
          `Exported ${toExport.length} collection(s) to .hivefetch/collections/.`
        );
        await onSwitch();
      } else {
        vscode.window.showErrorMessage('Failed to export collections to workspace.');
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Export failed: ${error.message}`);
    }
  });
}

/**
 * Import workspace `.hivefetch/collections/` into global storage.
 * This copies (not moves) collections for portability across workspaces.
 */
export function registerImportFromWorkspaceCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importCollectionsFromWorkspace', async () => {
    const workspaceRoot = storageService.getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showWarningMessage('No workspace folder is open. Open a workspace first.');
      return;
    }

    const wsStrategy = new WorkspaceStorageStrategy(workspaceRoot);
    const workspaceCollections = await wsStrategy.loadCollections();

    if (workspaceCollections.length === 0) {
      vscode.window.showInformationMessage('No workspace collections found in .hivefetch/collections/.');
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Import ${workspaceCollections.length} collection(s) from .hivefetch/collections/ into global storage? Existing global collections will be preserved.`,
      { modal: true },
      'Import'
    );
    if (confirm !== 'Import') return;

    try {
      const globalCollections = await storageService.loadGlobalCollections();
      const existingIds = new Set(globalCollections.map(c => c.id));

      // Only add collections that don't already exist in global
      const toImport = workspaceCollections.filter(c => !existingIds.has(c.id));

      if (toImport.length === 0) {
        vscode.window.showInformationMessage('All workspace collections already exist in global storage.');
        return;
      }

      const merged = [...globalCollections, ...toImport];
      const success = await storageService.saveGlobalCollections(merged);

      if (success) {
        vscode.window.showInformationMessage(
          `Imported ${toImport.length} collection(s) into global storage.`
        );
        await onSwitch();
      } else {
        vscode.window.showErrorMessage('Failed to import collections into global storage.');
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Import failed: ${error.message}`);
    }
  });
}
