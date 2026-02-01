import * as vscode from 'vscode';
import { registerNewRequestCommand, registerOpenRequestCommand } from './request';
import { registerOpenHistoryEntryCommand, registerRunHistoryEntryCommand } from './history';
import { registerNewCollectionCommand } from './collection';
import { registerImportPostmanCommand, registerExportPostmanCommand } from './import-export';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';
import type { RequestPanelManager } from '../providers/RequestPanelManager';

/**
 * Register all HiveFetch commands
 */
export function registerAllCommands(
  panelManager: RequestPanelManager,
  sidebarProvider: SidebarViewProvider
): vscode.Disposable[] {
  const commands: vscode.Disposable[] = [
    registerNewRequestCommand(panelManager),
    registerOpenRequestCommand(panelManager),
    registerOpenHistoryEntryCommand(panelManager),
    registerRunHistoryEntryCommand(panelManager),
    registerNewCollectionCommand(),
    registerImportPostmanCommand(
      sidebarProvider.getStorageService(),
      () => sidebarProvider.notifyCollectionsUpdated()
    ),
    registerExportPostmanCommand(
      () => sidebarProvider.getCollections()
    ),
  ];

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
