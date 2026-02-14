import * as vscode from 'vscode';
import { registerNewRequestCommand, registerOpenRequestCommand, registerCreateRequestFromUrlCommand } from './request';
import { registerNewCollectionCommand } from './collection';
import {
  registerImportPostmanCommand, registerExportPostmanCommand, registerImportOpenApiCommand,
  registerImportInsomniaCommand, registerImportHoppscotchCommand, registerImportCurlCommand, registerImportFromUrlCommand,
  registerImportThunderClientCommand, registerBulkExportCommand,
} from './import-export';
import { registerSwitchToGitFriendlyCommand, registerSwitchToMonolithicCommand } from './storage';
import { registerOpenMockServerCommand } from './mock-server';
import { registerBenchmarkCommand } from './benchmark';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';
import type { RequestPanelManager } from '../providers/RequestPanelManager';

/**
 * Register all HiveFetch commands
 */
export function registerAllCommands(
  panelManager: RequestPanelManager,
  sidebarProvider: SidebarViewProvider
): vscode.Disposable[] {
  const storageService = sidebarProvider.getStorageService();
  const onCollectionsUpdated = () => sidebarProvider.notifyCollectionsUpdated();

  const commands: vscode.Disposable[] = [
    registerNewRequestCommand(panelManager, sidebarProvider),
    registerOpenRequestCommand(panelManager),
    registerCreateRequestFromUrlCommand(sidebarProvider),
    registerNewCollectionCommand(sidebarProvider),
    registerImportPostmanCommand(storageService, onCollectionsUpdated),
    registerExportPostmanCommand(() => sidebarProvider.getCollections()),
    registerBulkExportCommand(() => sidebarProvider.getCollections()),
    registerImportOpenApiCommand(storageService, onCollectionsUpdated),
    registerImportInsomniaCommand(storageService, onCollectionsUpdated),
    registerImportHoppscotchCommand(storageService, onCollectionsUpdated),
    registerImportCurlCommand(storageService, onCollectionsUpdated),
    registerImportFromUrlCommand(storageService, onCollectionsUpdated),
    registerImportThunderClientCommand(storageService, onCollectionsUpdated),
    registerSwitchToGitFriendlyCommand(storageService, onCollectionsUpdated),
    registerSwitchToMonolithicCommand(storageService, onCollectionsUpdated),
    registerOpenMockServerCommand(() => sidebarProvider._openMockServerPanel()),
    registerBenchmarkCommand((requestId, collectionId) => sidebarProvider._openBenchmarkPanel(requestId, collectionId)),
  ];

  return commands;
}

export {
  registerNewRequestCommand,
  registerOpenRequestCommand,
  registerCreateRequestFromUrlCommand,
  registerNewCollectionCommand,
  registerImportPostmanCommand,
  registerExportPostmanCommand,
  registerImportOpenApiCommand,
  registerImportInsomniaCommand,
  registerImportHoppscotchCommand,
  registerImportCurlCommand,
  registerImportFromUrlCommand,
  registerImportThunderClientCommand,
  registerBulkExportCommand,
  registerSwitchToGitFriendlyCommand,
  registerSwitchToMonolithicCommand,
  registerOpenMockServerCommand,
  registerBenchmarkCommand,
};
