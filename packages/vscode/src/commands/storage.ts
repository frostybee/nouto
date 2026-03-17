import * as vscode from 'vscode';
import type { StorageService } from '../services/StorageService';

export function registerSwitchToGlobalStorageCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.switchToGlobalStorage', async () => {
    const confirm = await vscode.window.showInformationMessage(
      'Switch to global storage? All collections will be stored in a single file in VS Code global storage.',
      { modal: true },
      'Switch'
    );

    if (confirm !== 'Switch') return;

    const success = await storageService.switchStorageMode('global');
    if (success) {
      vscode.window.showInformationMessage('Switched to global storage mode.');
      await onSwitch();
    } else {
      vscode.window.showErrorMessage('Failed to switch storage mode.');
    }
  });
}

export function registerSwitchToWorkspaceStorageCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.switchToWorkspaceStorage', async () => {
    const confirm = await vscode.window.showInformationMessage(
      'Switch to workspace storage? Each request will be stored as an individual file in .nouto/collections/ for clean git diffs.',
      { modal: true },
      'Switch'
    );

    if (confirm !== 'Switch') return;

    const success = await storageService.switchStorageMode('workspace');
    if (success) {
      vscode.window.showInformationMessage('Switched to workspace storage mode.');
      await onSwitch();
    } else {
      vscode.window.showErrorMessage('Failed to switch storage mode.');
    }
  });
}
