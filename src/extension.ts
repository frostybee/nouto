import * as vscode from 'vscode';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { RequestEditorProvider } from './providers/RequestEditorProvider';
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

  // Register custom editor
  const editorProvider = RequestEditorProvider.register(
    context,
    sidebarProvider
  );

  // Register all commands (pass sidebarProvider for import/export)
  const commands = registerAllCommands(sidebarProvider);

  // Add all disposables to subscriptions
  context.subscriptions.push(sidebarView, editorProvider, ...commands);
}

export function deactivate() {
  console.log('HiveFetch extension is now deactivated!');
}
