import * as vscode from 'vscode';
import type { BenchmarkService, MockServerService, MockStorageService } from '@hivefetch/core/services';
import { MockStorageService as MockStorageServiceClass } from '@hivefetch/core/services';
import type { Collection, SavedRequest } from '../../services/types';
import { findFolderRecursive, findRequestAcrossCollections } from './CollectionTreeOps';

export interface ISpecialPanelContext {
  collections: Collection[];
  storageService: {
    saveCollections(collections: Collection[]): Promise<any>;
    loadEnvironments(): Promise<any>;
  };
  extensionUri: vscode.Uri;
  getNonce(): string;
  notifyCollectionsUpdated(): void;
}

export class SpecialPanelHandler {
  constructor(
    private readonly ctx: ISpecialPanelContext,
    private readonly benchmarkService: BenchmarkService,
    private readonly mockServerService: MockServerService,
    private readonly mockStorageService: MockStorageService
  ) {}

  // ============================================
  // Collection/Folder Settings Panel
  // ============================================
  async openSettingsPanel(entityType: 'collection' | 'folder', collectionId: string, folderId?: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) return;

    let entityName: string;
    let initialAuth: any;
    let initialHeaders: any;
    let initialVariables: any;
    let initialScripts: any;
    let initialNotes: string;

    if (entityType === 'folder' && folderId) {
      const folder = findFolderRecursive(collection.items, folderId);
      if (!folder) return;
      entityName = folder.name;
      initialAuth = folder.auth;
      initialHeaders = folder.headers;
      initialVariables = folder.variables;
      initialScripts = folder.scripts;
      initialNotes = folder.description ?? '';
    } else {
      entityName = collection.name;
      initialAuth = collection.auth;
      initialHeaders = collection.headers;
      initialVariables = collection.variables;
      initialScripts = collection.scripts;
      initialNotes = collection.description ?? '';
    }

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.settings',
      `Settings: ${entityName}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this.getSettingsHtml(panel.webview);

    const settingsMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initSettings',
            data: {
              entityType,
              entityName,
              collectionId,
              folderId,
              initialAuth,
              initialHeaders,
              initialVariables,
              initialScripts,
              initialNotes,
            },
          });
          break;

        case 'saveCollectionSettings': {
          const col = this.ctx.collections.find(c => c.id === message.data.collectionId);
          if (!col) break;
          col.auth = message.data.auth;
          col.headers = message.data.headers;
          col.variables = message.data.variables;
          col.scripts = message.data.scripts;
          col.description = message.data.notes ?? '';
          col.updatedAt = new Date().toISOString();
          await this.ctx.storageService.saveCollections(this.ctx.collections);
          this.ctx.notifyCollectionsUpdated();
          panel.dispose();
          break;
        }

        case 'saveFolderSettings': {
          const col = this.ctx.collections.find(c => c.id === message.data.collectionId);
          if (!col) break;
          const folder = findFolderRecursive(col.items, message.data.folderId);
          if (!folder) break;
          folder.auth = message.data.auth;
          folder.headers = message.data.headers;
          folder.variables = message.data.variables;
          folder.scripts = message.data.scripts;
          folder.description = message.data.notes ?? '';
          col.updatedAt = new Date().toISOString();
          await this.ctx.storageService.saveCollections(this.ctx.collections);
          this.ctx.notifyCollectionsUpdated();
          panel.dispose();
          break;
        }

        case 'closeSettingsPanel':
          panel.dispose();
          break;
      }
    });

    panel.onDidDispose(() => settingsMsgDisposable.dispose());
  }

  // ============================================
  // Mock Server Panel
  // ============================================
  async openMockServerPanel(): Promise<void> {
    const mockConfig = await this.mockStorageService.load();

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.mockServer',
      'Mock Server',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this.getMockHtml(panel.webview);

    this.mockServerService.setStatusChangeHandler((status) => {
      panel.webview.postMessage({ type: 'mockStatusChanged', data: { status } });
    });

    this.mockServerService.setLogHandler((log) => {
      panel.webview.postMessage({ type: 'mockLogAdded', data: log });
    });

    const mockMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initMockServer',
            data: {
              config: mockConfig,
              status: this.mockServerService.getStatus(),
            },
          });
          break;

        case 'startMockServer':
          try {
            await this.mockServerService.start(message.data.config);
            await this.mockStorageService.save(message.data.config);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Mock server failed to start: ${err.message}`);
          }
          break;

        case 'stopMockServer':
          await this.mockServerService.stop();
          break;

        case 'updateMockRoutes':
          this.mockServerService.updateRoutes(message.data.config.routes);
          await this.mockStorageService.save(message.data.config);
          break;

        case 'clearMockLogs':
          this.mockServerService.clearLogs();
          break;

        case 'importCollectionAsMocks': {
          const collections = this.ctx.collections;
          if (collections.length === 0) {
            vscode.window.showInformationMessage('No collections available to import.');
            break;
          }
          const items = collections.map(c => ({ label: c.name, id: c.id }));
          const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a collection to import' });
          if (!picked) break;
          const col = collections.find(c => c.id === picked.id);
          if (!col) break;
          const routes = MockStorageServiceClass.collectionToRoutes(col);
          panel.webview.postMessage({
            type: 'initMockServer',
            data: {
              config: { port: mockConfig.port, routes: [...mockConfig.routes, ...routes] },
              status: this.mockServerService.getStatus(),
            },
          });
          break;
        }
      }
    });

    panel.onDidDispose(() => {
      mockMsgDisposable.dispose();
      this.mockServerService.setStatusChangeHandler(undefined as any);
      this.mockServerService.setLogHandler(undefined as any);
    });
  }

  // ============================================
  // Benchmark Panel
  // ============================================
  async openBenchmarkPanel(requestId: string, collectionId?: string): Promise<void> {
    const found = findRequestAcrossCollections(this.ctx.collections, requestId);
    if (!found) {
      vscode.window.showErrorMessage('Request not found for benchmarking.');
      return;
    }
    const { request } = found;

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.benchmark',
      `Benchmark: ${request.name}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this.getBenchmarkHtml(panel.webview);

    const benchMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initBenchmark',
            data: {
              requestId,
              requestName: request.name,
              requestMethod: request.method,
              requestUrl: request.url,
              collectionId,
            },
          });
          break;

        case 'startBenchmark': {
          const config = message.data.config;
          const envData = await this.ctx.storageService.loadEnvironments();

          this.benchmarkService.run(
            request,
            config,
            envData,
            (current, total) => {
              panel.webview.postMessage({
                type: 'benchmarkProgress',
                data: { current, total },
              });
            },
            (iteration) => {
              panel.webview.postMessage({
                type: 'benchmarkIterationComplete',
                data: iteration,
              });
            },
          ).then((result) => {
            panel.webview.postMessage({ type: 'benchmarkComplete', data: result });
          }).catch(() => {
            panel.webview.postMessage({ type: 'benchmarkCancelled' });
          });
          break;
        }

        case 'cancelBenchmark':
          this.benchmarkService.cancel();
          panel.webview.postMessage({ type: 'benchmarkCancelled' });
          break;

        case 'exportBenchmarkResults': {
          const format = message.data.format;
          vscode.window.showInformationMessage(`Benchmark export (${format}) — use the iteration data shown in the panel.`);
          break;
        }
      }
    });

    panel.onDidDispose(() => {
      benchMsgDisposable.dispose();
      this.benchmarkService.cancel();
    });
  }

  // ============================================
  // HTML Generators
  // ============================================
  private getSettingsHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'settings.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'settings.css'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const kvEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'KeyValueEditor.css'));
    const scriptEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'ScriptEditor.css'));
    const notesEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'NotesEditor.css'));
    const tooltipUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'Tooltip.css'));

    const nonce = this.ctx.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${kvEditorUri}" rel="stylesheet">
  <link href="${scriptEditorUri}" rel="stylesheet">
  <link href="${notesEditorUri}" rel="stylesheet">
  <link href="${tooltipUri}" rel="stylesheet">
  <title>Settings</title>
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

  private getMockHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'mock.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'mock.css'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const nonce = this.ctx.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <title>Mock Server</title>
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

  private getBenchmarkHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'benchmark.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'benchmark.css'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const nonce = this.ctx.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <title>Performance Benchmark</title>
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
}
