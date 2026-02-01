import * as vscode from 'vscode';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { RequestPanelManager } from './providers/RequestPanelManager';
import { registerAllCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
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
  context.subscriptions.push(sidebarView, serializer, ...commands);
}

export function deactivate() {
  console.log('HiveFetch extension is now deactivated!');
}
