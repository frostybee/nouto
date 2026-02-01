import * as vscode from 'vscode';

/**
 * Register the newCollection command - prompts user to create a new collection
 */
export function registerNewCollectionCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.newCollection', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Collection name',
      placeHolder: 'My Collection',
    });
    if (name) {
      vscode.window.showInformationMessage(
        `Use the sidebar to manage collections.`
      );
    }
  });
}
