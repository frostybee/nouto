import * as vscode from 'vscode';
import type { StorageService } from '../services/StorageService';

export function registerSwitchToGitFriendlyCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.switchToGitFriendlyStorage', async () => {
    const confirm = await vscode.window.showInformationMessage(
      'Switch to git-friendly storage? Collections will be stored as individual files under .hivefetch/collections/ for better merge conflict resolution.',
      { modal: true },
      'Switch'
    );

    if (confirm !== 'Switch') return;

    const success = await storageService.switchStorageMode('git-friendly');
    if (success) {
      vscode.window.showInformationMessage('Switched to git-friendly storage mode.');
      await onSwitch();
    } else {
      vscode.window.showErrorMessage('Failed to switch storage mode.');
    }
  });
}

export function registerSwitchToMonolithicCommand(
  storageService: StorageService,
  onSwitch: () => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.switchToMonolithicStorage', async () => {
    const confirm = await vscode.window.showInformationMessage(
      'Switch to monolithic storage? All collections will be stored in a single collections.json file.',
      { modal: true },
      'Switch'
    );

    if (confirm !== 'Switch') return;

    const success = await storageService.switchStorageMode('monolithic');
    if (success) {
      vscode.window.showInformationMessage('Switched to monolithic storage mode.');
      await onSwitch();
    } else {
      vscode.window.showErrorMessage('Failed to switch storage mode.');
    }
  });
}
