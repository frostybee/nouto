import * as vscode from 'vscode';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { RequestPanelManager } from './providers/RequestPanelManager';
import { CommandPaletteManager } from './providers/CommandPaletteManager';
import { registerAllCommands } from './commands';
import { OpenApiDiagnosticsManager } from './providers/OpenApiDiagnosticsManager';
import { OpenApiSymbolProvider } from './providers/OpenApiSymbolProvider';
import { OpenApiDefinitionProvider } from './providers/OpenApiDefinitionProvider';
import { OpenApiPreviewPanelManager } from './providers/OpenApiPreviewPanelManager';
import { registerOpenApiPreviewCommand } from './commands/openapi';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Nouto extension is now active!');

  // Global storage path - correct in both normal and portable VS Code
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
    'nouto.requestPanel',
    {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
        panelManager.revivePanel(panel, state);
      },
    }
  );

  // Initialize Command Palette Manager (with panelManager for modal routing)
  const paletteManager = CommandPaletteManager.getInstance(context, sidebarProvider, panelManager);

  // Register all commands
  const commands = registerAllCommands(panelManager, sidebarProvider, paletteManager, context);

  const openApiDiagnostics = new OpenApiDiagnosticsManager();
  openApiDiagnostics.start();
  const openApiSelector = [{ language: 'json' }, { language: 'yaml' }, { language: 'jsonc' }];
  const openApiSymbols = vscode.languages.registerDocumentSymbolProvider(
    openApiSelector,
    new OpenApiSymbolProvider()
  );
  const openApiDefinitions = vscode.languages.registerDefinitionProvider(
    openApiSelector,
    new OpenApiDefinitionProvider()
  );

  const openApiPreview = new OpenApiPreviewPanelManager(context.extensionUri);
  openApiPreview.start();
  const openApiPreviewCommand = registerOpenApiPreviewCommand(openApiPreview);
  const openApiPreviewSerializer = vscode.window.registerWebviewPanelSerializer(
    OpenApiPreviewPanelManager.viewType,
    {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
        await openApiPreview.revivePreview(panel, state);
      },
    }
  );

  // Add all disposables to subscriptions
  // Note: panelManager is NOT added here - its lifecycle is managed by deactivate()
  // to ensure flushDrafts() runs before dispose()
  context.subscriptions.push(
    sidebarView,
    serializer,
    sidebarProvider,
    ...commands,
    openApiDiagnostics,
    openApiSymbols,
    openApiDefinitions,
    openApiPreview,
    openApiPreviewCommand,
    openApiPreviewSerializer
  );

  // Load drafts from previous session (used by revivePanel for crash recovery)
  await panelManager.loadDrafts();
  // Clean up orphaned drafts after the serializer has restored all panels.
  // VS Code calls deserializeWebviewPanel synchronously during activation,
  // so by the time this timeout fires, all serializer restorations are complete.
  setTimeout(() => { panelManager.cleanupOrphanedDrafts(); }, 5000);
}

export async function deactivate() {
  // Flush any pending draft writes before extension shuts down
  const panelManager = RequestPanelManager.getExistingInstance();
  if (panelManager) {
    await panelManager.flushDrafts();
    panelManager.dispose();
  }
  // Note: SidebarViewProvider.dispose() handles mock server cleanup
  console.log('Nouto extension is now deactivated!');
}
