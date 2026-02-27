import * as vscode from 'vscode';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { RequestPanelManager } from './providers/RequestPanelManager';
import { CommandPaletteManager } from './providers/CommandPaletteManager';
import { registerAllCommands } from './commands';

export async function activate(context: vscode.ExtensionContext) {
  console.log('HiveFetch extension is now active!');

  // Global storage path — correct in both normal and portable VS Code
  const globalStorageDir = context.globalStorageUri.fsPath;

  // Initialize sidebar view provider
  const sidebarProvider = new SidebarViewProvider(context.extensionUri, globalStorageDir);

  // Register sidebar webview
  const sidebarView = vscode.window.registerWebviewViewProvider(
    SidebarViewProvider.viewType,
    sidebarProvider
  );

  // Initialize RequestPanelManager (replaces CustomTextEditorProvider)
  const panelManager = RequestPanelManager.getInstance(context, sidebarProvider);

  // Give sidebar provider access to panel manager (for creating quick requests with URLs)
  sidebarProvider.setPanelManager(panelManager);

  // Register panel serializer for persistence across VS Code reload
  const serializer = vscode.window.registerWebviewPanelSerializer(
    'hivefetch.requestPanel',
    {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
        panelManager.revivePanel(panel, state);
      },
    }
  );

  // Initialize Command Palette Manager (with panelManager for modal routing)
  const paletteManager = CommandPaletteManager.getInstance(context, sidebarProvider, panelManager);

  // Register all commands
  const commands = registerAllCommands(panelManager, sidebarProvider, paletteManager);

  // Add all disposables to subscriptions
  context.subscriptions.push(sidebarView, serializer, sidebarProvider, ...commands);

  // Load and restore drafts from previous session
  await panelManager.loadDrafts();
  panelManager.restoreDrafts();
}

export async function deactivate() {
  // Flush any pending draft writes before extension shuts down
  const panelManager = RequestPanelManager.getExistingInstance();
  if (panelManager) {
    await panelManager.flushDrafts();
    panelManager.dispose();
  }
  // Note: SidebarViewProvider.dispose() handles mock server cleanup
  console.log('HiveFetch extension is now deactivated!');
}
