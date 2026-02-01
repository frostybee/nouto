import * as vscode from 'vscode';
import { registerNewRequestCommand, registerOpenRequestCommand } from './request';
import { registerOpenHistoryEntryCommand, registerRunHistoryEntryCommand } from './history';
import { registerNewCollectionCommand } from './collection';
import { registerImportPostmanCommand, registerExportPostmanCommand } from './import-export';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';

/**
 * Register all HiveFetch commands
 */
export function registerAllCommands(sidebarProvider?: SidebarViewProvider): vscode.Disposable[] {
  const commands: vscode.Disposable[] = [
    registerNewRequestCommand(),
    registerOpenRequestCommand(),
    registerOpenHistoryEntryCommand(),
    registerRunHistoryEntryCommand(),
    registerNewCollectionCommand(),
  ];

  // Register import/export commands if sidebarProvider is available
  if (sidebarProvider) {
    commands.push(
      registerImportPostmanCommand(
        sidebarProvider.getStorageService(),
        () => sidebarProvider.notifyCollectionsUpdated()
      ),
      registerExportPostmanCommand(
        () => sidebarProvider.getCollections()
      )
    );
  }

  return commands;
}

export {
  registerNewRequestCommand,
  registerOpenRequestCommand,
  registerOpenHistoryEntryCommand,
  registerRunHistoryEntryCommand,
  registerNewCollectionCommand,
  registerImportPostmanCommand,
  registerExportPostmanCommand,
};
