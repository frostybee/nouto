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
import { registerOpenCommandPaletteCommand } from './palette';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import type { CommandPaletteManager } from '../providers/CommandPaletteManager';

/**
 * Register all HiveFetch commands
 */
export function registerAllCommands(
  panelManager: RequestPanelManager,
  sidebarProvider: SidebarViewProvider,
  paletteManager?: CommandPaletteManager
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

  // Add palette command if manager provided
  if (paletteManager) {
    commands.push(registerOpenCommandPaletteCommand(paletteManager));
  }

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
  registerOpenCommandPaletteCommand,
};
