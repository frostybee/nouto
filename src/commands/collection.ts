import * as vscode from 'vscode';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';

/**
 * Register the newCollection command - prompts user to create a new collection
 */
export function registerNewCollectionCommand(sidebarProvider: SidebarViewProvider): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.newCollection', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Collection name',
      placeHolder: 'My Collection',
    });
    if (name) {
      await sidebarProvider.createEmptyCollection(name);
    }
  });
}
