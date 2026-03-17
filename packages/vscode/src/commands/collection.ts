import * as vscode from 'vscode';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';

/**
 * Register the newCollection command - prompts user to create a new collection
 */
export function registerNewCollectionCommand(sidebarProvider: SidebarViewProvider): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.newCollection', async () => {
    const ui = sidebarProvider.uiService;
    let name: string | null | undefined;
    if (ui) {
      name = await ui.showInputBox({ prompt: 'Collection name', placeholder: 'My Collection', validateNotEmpty: true });
    } else {
      name = await vscode.window.showInputBox({ prompt: 'Collection name', placeHolder: 'My Collection' });
    }
    if (name) {
      await sidebarProvider.createEmptyCollection(name);
    }
  });
}

/**
 * Register the duplicateSelectedRequest command - duplicates the currently selected request
 */
export function registerDuplicateSelectedRequestCommand(sidebarProvider: SidebarViewProvider): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.duplicateSelectedRequest', () => {
    sidebarProvider.triggerDuplicateSelected();
  });
}
