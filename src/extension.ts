import * as vscode from 'vscode';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { RequestPanelManager } from './providers/RequestPanelManager';
import { registerAllCommands } from './commands';

export async function activate(context: vscode.ExtensionContext) {
  console.log('HiveFetch extension is now active!');

  // Initialize sidebar view provider
  const sidebarProvider = new SidebarViewProvider(context.extensionUri);

  // Register sidebar webview
  const sidebarView = vscode.window.registerWebviewViewProvider(
    SidebarViewProvider.viewType,
    sidebarProvider
  );

  // Initialize RequestPanelManager (replaces CustomTextEditorProvider)
  const panelManager = RequestPanelManager.getInstance(context, sidebarProvider);

  // Register panel serializer for persistence across VS Code reload
  const serializer = vscode.window.registerWebviewPanelSerializer(
    'hivefetch.requestPanel',
    {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
        panelManager.revivePanel(panel, state);
      },
    }
  );

  // Register all commands
  const commands = registerAllCommands(panelManager, sidebarProvider);

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
  }
  console.log('HiveFetch extension is now deactivated!');
}
