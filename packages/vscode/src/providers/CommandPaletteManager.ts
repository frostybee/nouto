import * as vscode from 'vscode';
import { SidebarViewProvider } from './SidebarViewProvider';
import { RequestPanelManager } from './RequestPanelManager';
import { StorageService } from '../services/StorageService';

/**
 * Manages the command palette webview panel lifecycle.
 * Singleton pattern - only one palette instance can be open at a time.
 */
export class CommandPaletteManager {
  private static instance: CommandPaletteManager | null = null;
  private panel: vscode.WebviewPanel | null = null;
  private storageService: StorageService;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sidebarProvider?: SidebarViewProvider
  ) {
    this.storageService = new StorageService(vscode.workspace.workspaceFolders?.[0]);
  }

  public static getInstance(
    context: vscode.ExtensionContext,
    sidebarProvider?: SidebarViewProvider
  ): CommandPaletteManager {
    if (!CommandPaletteManager.instance) {
      CommandPaletteManager.instance = new CommandPaletteManager(context, sidebarProvider);
    }
    return CommandPaletteManager.instance;
  }

  /**
   * Show the command palette. Creates a new panel if needed, or reveals existing one.
   */
  public show(): void {
    if (this.panel) {
      // Panel exists - just reveal it
      this.panel.reveal();
      return;
    }

    // Create new panel
    this.panel = vscode.window.createWebviewPanel(
      'hivefetch.commandPalette',
      'Command Palette',
      {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: false, // Palette is ephemeral - no need to retain
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist'),
        ],
      }
    );

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    // Set up message handler
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready':
            // Send initial data (collections, history, etc.)
            await this.sendInitialData();
            break;

          case 'selectRequest':
            // Open the selected request in RequestPanelManager
            this.handleSelectRequest(message.requestId, message.collectionId);
            break;

          case 'executeAction':
            // Execute a palette action
            await this.handleExecuteAction(message.actionId, message.context);
            break;

          case 'close':
            // Close the palette
            this.panel?.dispose();
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  /**
   * Send collections and environments data to the palette webview
   */
  private async sendInitialData(): Promise<void> {
    if (!this.panel) return;

    try {
      const collections = await this.storageService.loadCollections();
      const environments = await this.storageService.loadEnvironments();

      this.panel.webview.postMessage({
        type: 'initialData',
        data: {
          collections,
          environments,
        },
      });
    } catch (error) {
      console.error('Failed to load data for command palette:', error);
    }
  }

  /**
   * Handle request selection - open via VSCode command
   */
  private async handleSelectRequest(requestId: string, collectionId: string): Promise<void> {
    try {
      // Load collections to find the request
      const collections = await this.storageService.loadCollections();

      // Find the request in collections
      let foundRequest: any = null;
      const searchInItems = (items: any[]): boolean => {
        for (const item of items) {
          if (item.type === 'request' && item.id === requestId) {
            foundRequest = item;
            return true;
          }
          if (item.type === 'folder' && item.children) {
            if (searchInItems(item.children)) {
              return true;
            }
          }
        }
        return false;
      };

      for (const collection of collections) {
        if (collection.id === collectionId && collection.items) {
          if (searchInItems(collection.items)) {
            break;
          }
        }
      }

      if (foundRequest) {
        // Execute the openRequest command with the found request
        await vscode.commands.executeCommand('hivefetch.openRequest', foundRequest, collectionId);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open request: ${error}`);
    }

    // Close the palette after selection
    this.panel?.dispose();
  }

  /**
   * Handle action execution
   */
  private async handleExecuteAction(actionId: string, context?: any): Promise<void> {
    // Map action IDs to VSCode commands
    const actionCommandMap: Record<string, string> = {
      'create.http': 'hivefetch.newRequest',
      'create.graphql': 'hivefetch.newGraphQLRequest',
      'create.websocket': 'hivefetch.newWebSocketRequest',
      'create.sse': 'hivefetch.newSSERequest',
      'create.folder': 'hivefetch.createFolder',
      'create.collection': 'hivefetch.createCollection',
      'create.environment': 'hivefetch.createEnvironment',
      'import.openapi': 'hivefetch.importOpenApi',
      'import.postman': 'hivefetch.importPostman',
      'import.insomnia': 'hivefetch.importInsomnia',
      'import.hoppscotch': 'hivefetch.importHoppscotch',
      'import.curl': 'hivefetch.importCurl',
      'import.url': 'hivefetch.importFromUrl',
      'export.collection': 'hivefetch.exportCollection',
      'export.all': 'hivefetch.exportAllCollections',
      'run.collection': 'hivefetch.runCollection',
      'run.folder': 'hivefetch.runFolder',
      'run.mock': 'hivefetch.startMockServer',
      'run.benchmark': 'hivefetch.benchmarkRequest',
      'settings.storage': 'hivefetch.storage.switchMode',
      'settings.clear': 'hivefetch.clearHistory',
    };

    const command = actionCommandMap[actionId];
    if (command) {
      try {
        await vscode.commands.executeCommand(command, context);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to execute action: ${error}`);
      }
    }

    // Close the palette after action
    this.panel?.dispose();
  }

  /**
   * Generate HTML for the palette webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'webview-dist'
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'palette.js')
    );
    const themeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'theme.css')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'palette.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <title>Command Palette</title>
</head>
<body>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
