import * as vscode from 'vscode';
import { registerNewRequestCommand, registerOpenRequestCommand, registerCreateRequestFromUrlCommand } from './request';
import { registerNewCollectionCommand, registerDuplicateSelectedRequestCommand } from './collection';
import {
  registerImportPostmanCommand, registerExportPostmanCommand, registerImportOpenApiCommand,
  registerImportInsomniaCommand, registerImportHoppscotchCommand, registerImportCurlCommand, registerImportFromUrlCommand,
  registerImportThunderClientCommand, registerBulkExportCommand,
  registerExportNativeCommand, registerImportNativeCommand,
} from './import-export';
import { registerSwitchToGitFriendlyCommand, registerSwitchToMonolithicCommand } from './storage';
import {
  registerSwitchToWorkspaceCollectionsCommand,
  registerSwitchToGlobalCollectionsCommand,
  registerSwitchToBothCollectionsCommand,
  registerExportToWorkspaceCommand,
  registerImportFromWorkspaceCommand,
} from './collection-mode';
import { registerOpenMockServerCommand } from './mock-server';
import { registerBenchmarkCommand } from './benchmark';
import { registerOpenCommandPaletteCommand } from './palette';
import { registerExportHistoryCommand, registerImportHistoryCommand } from './history';
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
    registerDuplicateSelectedRequestCommand(sidebarProvider),
    registerImportPostmanCommand(storageService, onCollectionsUpdated),
    registerExportPostmanCommand(() => sidebarProvider.getCollections()),
    registerBulkExportCommand(() => sidebarProvider.getCollections()),
    registerImportOpenApiCommand(storageService, onCollectionsUpdated),
    registerImportInsomniaCommand(storageService, onCollectionsUpdated),
    registerImportHoppscotchCommand(storageService, onCollectionsUpdated),
    registerImportCurlCommand(storageService, onCollectionsUpdated),
    registerImportFromUrlCommand(storageService, onCollectionsUpdated),
    registerImportThunderClientCommand(storageService, onCollectionsUpdated),
    registerExportNativeCommand(() => sidebarProvider.getCollections()),
    registerImportNativeCommand(storageService, onCollectionsUpdated),
    registerSwitchToGitFriendlyCommand(storageService, onCollectionsUpdated),
    registerSwitchToMonolithicCommand(storageService, onCollectionsUpdated),
    registerSwitchToWorkspaceCollectionsCommand(storageService, onCollectionsUpdated),
    registerSwitchToGlobalCollectionsCommand(storageService, onCollectionsUpdated),
    registerSwitchToBothCollectionsCommand(storageService, onCollectionsUpdated),
    registerExportToWorkspaceCommand(storageService, onCollectionsUpdated),
    registerImportFromWorkspaceCommand(storageService, onCollectionsUpdated),
    registerOpenMockServerCommand(() => sidebarProvider._openMockServerPanel()),
    registerBenchmarkCommand((requestId, collectionId) => sidebarProvider._openBenchmarkPanel(requestId, collectionId)),
    registerExportHistoryCommand(() => sidebarProvider.getHistoryService()),
    registerImportHistoryCommand(
      () => sidebarProvider.getHistoryService(),
      () => sidebarProvider.broadcastHistoryUpdate()
    ),
  ];

  // Add palette command if manager provided
  if (paletteManager) {
    commands.push(registerOpenCommandPaletteCommand(paletteManager));
  }

  // Settings command: open in active panel or open a new panel first
  commands.push(vscode.commands.registerCommand('hivefetch.openSettings', () => {
    const activePanel = panelManager.getActivePanel();
    if (activePanel) {
      activePanel.panel.webview.postMessage({ type: 'openSettings' });
    } else {
      panelManager.openNewRequest({ openSettingsOnReady: true });
    }
  }));

  return commands;
}

export {
  registerNewRequestCommand,
  registerOpenRequestCommand,
  registerCreateRequestFromUrlCommand,
  registerNewCollectionCommand,
  registerDuplicateSelectedRequestCommand,
  registerImportPostmanCommand,
  registerExportPostmanCommand,
  registerImportOpenApiCommand,
  registerImportInsomniaCommand,
  registerImportHoppscotchCommand,
  registerImportCurlCommand,
  registerImportFromUrlCommand,
  registerImportThunderClientCommand,
  registerBulkExportCommand,
  registerExportNativeCommand,
  registerImportNativeCommand,
  registerSwitchToGitFriendlyCommand,
  registerSwitchToMonolithicCommand,
  registerSwitchToWorkspaceCollectionsCommand,
  registerSwitchToGlobalCollectionsCommand,
  registerSwitchToBothCollectionsCommand,
  registerExportToWorkspaceCommand,
  registerImportFromWorkspaceCommand,
  registerOpenMockServerCommand,
  registerBenchmarkCommand,
  registerOpenCommandPaletteCommand,
};
