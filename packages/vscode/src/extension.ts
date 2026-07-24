import * as vscode from 'vscode';
import { SidebarViewProvider } from './providers/SidebarViewProvider';
import { RequestPanelManager } from './providers/RequestPanelManager';
import { CommandPaletteManager } from './providers/CommandPaletteManager';
import { registerAllCommands } from './commands';
import { OpenApiDiagnosticsManager } from './providers/OpenApiDiagnosticsManager';
import { OpenApiSymbolProvider } from './providers/OpenApiSymbolProvider';
import { OpenApiDefinitionProvider } from './providers/OpenApiDefinitionProvider';
import { OpenApiCodeActionProvider } from './providers/OpenApiCodeActionProvider';
import { OpenApiCompletionProvider } from './providers/OpenApiCompletionProvider';
import { OpenApiHoverProvider } from './providers/OpenApiHoverProvider';
import { OpenApiPreviewPanelManager } from './providers/OpenApiPreviewPanelManager';
import { OpenApiCodeLensProvider } from './providers/OpenApiCodeLensProvider';
import { OpenApiOutlineProvider } from './providers/OpenApiOutlineProvider';
import { createOpenApiActionService } from './services/OpenApiActionService';
import { OpenApiDocsSnapshotManager } from './services/openapi';
import {
  registerGenerateCollectionFromOpenApiCommand,
  registerOpenApiDocsInBrowserCommand,
  registerOpenApiPreviewCommand,
  registerTryOpenApiOperationCommand,
} from './commands/openapi';
import {
  registerOpenApiOutlineCloseSpecCommand,
  registerOpenApiOutlineOpenSpecCommand,
  registerOpenApiOutlineRefreshCommand,
  registerOpenApiOutlineRevealCommand,
  registerOpenApiOutlineSaveAsCommand,
  registerOpenApiOutlineSortAlphabeticalCommand,
  registerOpenApiOutlineSortDocumentOrderCommand,
  registerOpenApiOutlineTryOperationCommand,
} from './commands/openapi-outline';
import { registerOpenApiOutlineEditCommands } from './commands/openapi-outline-edit';

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

  // One workflow instance backs every OpenAPI action (CodeLens, preview,
  // commands, import) so their per-document serialization is shared.
  const openApiActions = createOpenApiActionService(panelManager, sidebarProvider);

  // Register all commands
  const commands = registerAllCommands(
    panelManager,
    sidebarProvider,
    paletteManager,
    context,
    openApiActions
  );

  const openApiDiagnostics = new OpenApiDiagnosticsManager(context);
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

  const openApiCodeLenses = vscode.languages.registerCodeLensProvider(
    openApiSelector,
    new OpenApiCodeLensProvider()
  );
  const openApiCodeActions = vscode.languages.registerCodeActionsProvider(
    openApiSelector,
    new OpenApiCodeActionProvider(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
  );
  const openApiCompletions = vscode.languages.registerCompletionItemProvider(
    openApiSelector,
    new OpenApiCompletionProvider(context),
    ':',
    ' ',
    '"',
    '\n',
    '-'
  );
  const openApiHovers = vscode.languages.registerHoverProvider(
    openApiSelector,
    new OpenApiHoverProvider(context)
  );
  const openApiTryCommand = registerTryOpenApiOperationCommand(openApiActions);
  const openApiGenerateCommand = registerGenerateCollectionFromOpenApiCommand(openApiActions);

  const openApiPreview = new OpenApiPreviewPanelManager(context.extensionUri, openApiActions);
  openApiPreview.start();
  const openApiPreviewCommand = registerOpenApiPreviewCommand(openApiPreview);

  const openApiDocsSnapshots = new OpenApiDocsSnapshotManager();
  openApiDocsSnapshots.start();
  const openApiDocsCommand = registerOpenApiDocsInBrowserCommand(context, openApiDocsSnapshots);

  const openApiOutline = new OpenApiOutlineProvider(context);
  openApiOutline.start();
  const openApiOutlineRefreshCommand = registerOpenApiOutlineRefreshCommand(openApiOutline);
  const openApiOutlineRevealCommand = registerOpenApiOutlineRevealCommand(openApiOutline);
  const openApiOutlineOpenSpecCommand = registerOpenApiOutlineOpenSpecCommand();
  const openApiOutlineSaveAsCommand = registerOpenApiOutlineSaveAsCommand(openApiOutline);
  const openApiOutlineCloseSpecCommand = registerOpenApiOutlineCloseSpecCommand(openApiOutline);
  const openApiOutlineSortAlphabeticalCommand = registerOpenApiOutlineSortAlphabeticalCommand(context);
  const openApiOutlineSortDocumentOrderCommand = registerOpenApiOutlineSortDocumentOrderCommand(context);
  const openApiOutlineTryCommand = registerOpenApiOutlineTryOperationCommand();
  const openApiOutlineEditCommands = registerOpenApiOutlineEditCommands(openApiOutline);
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
    openApiCodeLenses,
    openApiCodeActions,
    openApiCompletions,
    openApiHovers,
    openApiTryCommand,
    openApiGenerateCommand,
    openApiPreview,
    openApiPreviewCommand,
    openApiPreviewSerializer,
    openApiDocsSnapshots,
    openApiDocsCommand,
    openApiOutline,
    openApiOutlineRefreshCommand,
    openApiOutlineRevealCommand,
    openApiOutlineOpenSpecCommand,
    openApiOutlineSaveAsCommand,
    openApiOutlineCloseSpecCommand,
    openApiOutlineSortAlphabeticalCommand,
    openApiOutlineSortDocumentOrderCommand,
    openApiOutlineTryCommand,
    ...openApiOutlineEditCommands
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
