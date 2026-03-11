import * as vscode from 'vscode';
import { registerNewRequestCommand, registerOpenRequestCommand, registerCreateRequestFromUrlCommand } from './request';
import { registerNewCollectionCommand, registerDuplicateSelectedRequestCommand } from './collection';
import {
  registerImportPostmanCommand, registerExportPostmanCommand, registerImportOpenApiCommand,
  registerImportInsomniaCommand, registerImportHoppscotchCommand, registerImportCurlCommand, registerImportFromUrlCommand,
  registerImportThunderClientCommand, registerBulkExportCommand, registerBulkExportNativeCommand,
  registerExportNativeCommand, registerImportNativeCommand, registerImportAutoCommand,
  registerImportHarCommand, registerExportHarCommand, registerImportBrunoCommand,
  registerImportPostmanEnvironmentCommand,
} from './import-export';
import { registerSwitchToGlobalStorageCommand, registerSwitchToWorkspaceStorageCommand } from './storage';
import { registerOpenMockServerCommand } from './mock-server';
import { registerBenchmarkCommand } from './benchmark';
import { registerOpenCommandPaletteCommand } from './palette';
import { registerExportHistoryCommand, registerImportHistoryCommand } from './history';
import { registerOpenEnvironmentsCommand } from './environments';
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
    registerCreateRequestFromUrlCommand(panelManager, sidebarProvider),
    registerNewCollectionCommand(sidebarProvider),
    registerDuplicateSelectedRequestCommand(sidebarProvider),
    registerImportPostmanCommand(storageService, onCollectionsUpdated),
    registerExportPostmanCommand(() => sidebarProvider.getCollections()),
    registerBulkExportCommand(() => sidebarProvider.getCollections()),
    registerBulkExportNativeCommand(() => sidebarProvider.getCollections()),
    registerImportOpenApiCommand(storageService, onCollectionsUpdated),
    registerImportInsomniaCommand(storageService, onCollectionsUpdated),
    registerImportHoppscotchCommand(storageService, onCollectionsUpdated),
    registerImportCurlCommand(storageService, onCollectionsUpdated),
    registerImportFromUrlCommand(storageService, onCollectionsUpdated),
    registerImportThunderClientCommand(storageService, onCollectionsUpdated),
    registerExportNativeCommand(() => sidebarProvider.getCollections()),
    registerImportNativeCommand(storageService, onCollectionsUpdated),
    registerImportAutoCommand(storageService, onCollectionsUpdated),
    registerImportHarCommand(storageService, onCollectionsUpdated),
    registerExportHarCommand(storageService),
    registerImportBrunoCommand(storageService, onCollectionsUpdated),
    registerImportPostmanEnvironmentCommand(storageService, () => {
      storageService.loadEnvironments().then(envData => sidebarProvider.updateEnvironments(envData));
    }),
    registerSwitchToGlobalStorageCommand(storageService, onCollectionsUpdated),
    registerSwitchToWorkspaceStorageCommand(storageService, onCollectionsUpdated),
    registerOpenMockServerCommand(() => sidebarProvider._openMockServerPanel()),
    registerBenchmarkCommand((requestId, collectionId) => sidebarProvider._openBenchmarkPanel(requestId, collectionId)),
    registerOpenEnvironmentsCommand(() => sidebarProvider._openEnvironmentsPanel()),
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
  registerBulkExportNativeCommand,
  registerExportNativeCommand,
  registerImportNativeCommand,
  registerImportAutoCommand,
  registerImportHarCommand,
  registerExportHarCommand,
  registerImportBrunoCommand,
  registerImportPostmanEnvironmentCommand,
  registerSwitchToGlobalStorageCommand,
  registerSwitchToWorkspaceStorageCommand,
  registerOpenMockServerCommand,
  registerBenchmarkCommand,
  registerOpenCommandPaletteCommand,
};
