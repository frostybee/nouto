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
import { registerExportBackupCommand, registerImportBackupCommand } from './backup';
import { registerOpenEnvironmentsCommand } from './environments';
import { registerOpenInJsonExplorerCommand } from './json-explorer';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import type { CommandPaletteManager } from '../providers/CommandPaletteManager';

/**
 * Register all Nouto commands
 */
export function registerAllCommands(
  panelManager: RequestPanelManager,
  sidebarProvider: SidebarViewProvider,
  paletteManager?: CommandPaletteManager,
  context?: vscode.ExtensionContext
): vscode.Disposable[] {
  const storageService = sidebarProvider.getStorageService();
  const onCollectionsUpdated = () => sidebarProvider.notifyCollectionsUpdated();
  const onEnvironmentsUpdated = () => {
    storageService.loadEnvironments()
      .then(envData => sidebarProvider.updateEnvironments(envData))
      .catch(err => console.error('[Nouto] Failed to reload environments:', err));
  };

  const commands: vscode.Disposable[] = [
    registerNewRequestCommand(panelManager, sidebarProvider),
    registerOpenRequestCommand(panelManager),
    registerCreateRequestFromUrlCommand(panelManager, sidebarProvider),
    registerNewCollectionCommand(sidebarProvider),
    registerDuplicateSelectedRequestCommand(sidebarProvider),
    registerImportPostmanCommand(storageService, onCollectionsUpdated, onEnvironmentsUpdated),
    registerExportPostmanCommand(() => sidebarProvider.getCollections()),
    registerBulkExportCommand(() => sidebarProvider.getCollections()),
    registerBulkExportNativeCommand(() => sidebarProvider.getCollections()),
    registerImportOpenApiCommand(storageService, onCollectionsUpdated),
    registerImportInsomniaCommand(storageService, onCollectionsUpdated),
    registerImportHoppscotchCommand(storageService, onCollectionsUpdated),
    registerImportCurlCommand(storageService, onCollectionsUpdated),
    registerImportFromUrlCommand(storageService, onCollectionsUpdated, onEnvironmentsUpdated),
    registerImportThunderClientCommand(storageService, onCollectionsUpdated),
    registerExportNativeCommand(() => sidebarProvider.getCollections()),
    registerImportNativeCommand(storageService, onCollectionsUpdated),
    registerImportAutoCommand(storageService, onCollectionsUpdated, onEnvironmentsUpdated),
    registerImportHarCommand(storageService, onCollectionsUpdated),
    registerExportHarCommand(storageService),
    registerImportBrunoCommand(storageService, onCollectionsUpdated),
    registerImportPostmanEnvironmentCommand(storageService, onEnvironmentsUpdated),
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
    registerExportBackupCommand(
      storageService.getStorageDir(),
      context?.globalState ?? { get: () => undefined, update: () => Promise.resolve() } as any,
    ),
    registerImportBackupCommand(
      storageService.getStorageDir(),
      context?.globalState ?? { get: () => undefined, update: () => Promise.resolve() } as any,
      () => sidebarProvider.reloadAllData(),
    ),
  ];

  // JSON Explorer: open .json files directly
  commands.push(registerOpenInJsonExplorerCommand(panelManager));

  // Add palette command if manager provided
  if (paletteManager) {
    commands.push(registerOpenCommandPaletteCommand(paletteManager));
  }

  // Settings command: open in a dedicated settings panel
  commands.push(vscode.commands.registerCommand('nouto.openSettings', () => {
    sidebarProvider.openGlobalSettings();
  }));

  // About command: open settings panel focused on the About section
  commands.push(vscode.commands.registerCommand('nouto.openAbout', () => {
    sidebarProvider.openGlobalSettings('about');
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
  registerExportBackupCommand,
  registerImportBackupCommand,
  registerOpenInJsonExplorerCommand,
};
