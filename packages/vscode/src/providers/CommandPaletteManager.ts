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
    private readonly sidebarProvider?: SidebarViewProvider,
    private readonly requestPanelManager?: RequestPanelManager
  ) {
    this.storageService = new StorageService(vscode.workspace.workspaceFolders?.[0]);
  }

  public static getInstance(
    context: vscode.ExtensionContext,
    sidebarProvider?: SidebarViewProvider,
    requestPanelManager?: RequestPanelManager
  ): CommandPaletteManager {
    if (!CommandPaletteManager.instance) {
      CommandPaletteManager.instance = new CommandPaletteManager(context, sidebarProvider, requestPanelManager);
    }
    return CommandPaletteManager.instance;
  }

  /**
   * Show the command palette. Routes to either modal or dedicated tab.
   */
  public async show(): Promise<void> {
    // Check if a request panel is currently active
    const activeRequestPanel = this.requestPanelManager?.getActivePanel();

    if (activeRequestPanel) {
      // Route 1: Show modal inside existing request panel
      await this.showInRequestPanel(activeRequestPanel.panel);
    } else {
      // Route 2: Open dedicated palette tab
      this.showDedicatedTab();
    }
  }

  /**
   * Show palette as modal overlay inside a request panel
   */
  private async showInRequestPanel(panel: vscode.WebviewPanel): Promise<void> {
    try {
      const collections = await this.storageService.loadCollections();
      const environments = await this.storageService.loadEnvironments();

      // Send message to request webview to show palette modal
      panel.webview.postMessage({
        type: 'showCommandPalette',
        data: {
          collections,
          environments,
        },
      });
    } catch (error) {
      console.error('Failed to show command palette modal:', error);
    }
  }

  /**
   * Show palette as dedicated tab
   */
  private showDedicatedTab(): void {
    if (this.panel) {
      // Panel exists - just reveal it
      this.panel.reveal();
      return;
    }

    // Create new panel
    this.panel = vscode.window.createWebviewPanel(
      'hivefetch.commandPalette',
      'Search Requests',
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
    const msgDisposable = this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready':
            // Send initial data (collections, etc.)
            await this.sendInitialData();
            break;

          case 'selectRequest':
            // Open the selected request
            this.handleSelectRequest(message.requestId, message.collectionId);
            break;

          case 'close':
            // Close the palette
            this.panel?.dispose();
            break;
        }
      },
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => {
      msgDisposable.dispose();
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
      vscode.Uri.joinPath(distPath, 'CommandPaletteApp.css')
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
  <title>Search Requests</title>
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
    return require('crypto').randomBytes(24).toString('base64url');
  }
}
