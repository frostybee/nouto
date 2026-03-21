import * as vscode from 'vscode';
import type { BenchmarkService, MockServerService, MockStorageService } from '@nouto/core/services';
import { MockStorageService as MockStorageServiceClass } from '@nouto/core/services';
import type { Collection, SavedRequest } from '../../services/types';
import type { UIService } from '../../services/UIService';
import { findFolderRecursive, findRequestAcrossCollections } from './CollectionTreeOps';

export interface ISpecialPanelContext {
  collections: Collection[];
  storageService: {
    saveCollections(collections: Collection[]): Promise<any>;
    loadEnvironments(): Promise<any>;
    saveEnvironments(data: any): Promise<any>;
  };
  extensionUri: vscode.Uri;
  getNonce(): string;
  notifyCollectionsUpdated(): void;
  getEnvironments(): any;
  setActiveEnvironment(id: string | null): Promise<void>;
  registerAuxPanel(panel: vscode.WebviewPanel): void;
  unregisterAuxPanel(panel: vscode.WebviewPanel): void;
  openEnvironmentsPanel?(): Promise<void>;
  uiService?: UIService;
}

export class SpecialPanelHandler {
  constructor(
    private readonly ctx: ISpecialPanelContext,
    private readonly benchmarkService: BenchmarkService,
    private readonly mockServerService: MockServerService,
    private readonly mockStorageService: MockStorageService
  ) {}

  private get ui(): UIService | undefined {
    return this.ctx.uiService;
  }

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
    let initialAssertions: any;
    let initialNotes: string;

    if (entityType === 'folder' && folderId) {
      const folder = findFolderRecursive(collection.items, folderId);
      if (!folder) return;
      entityName = folder.name;
      initialAuth = folder.auth;
      initialHeaders = folder.headers;
      initialVariables = folder.variables;
      initialScripts = folder.scripts;
      initialAssertions = folder.assertions;
      initialNotes = folder.description ?? '';
    } else {
      entityName = collection.name;
      initialAuth = collection.auth;
      initialHeaders = collection.headers;
      initialVariables = collection.variables;
      initialScripts = collection.scripts;
      initialAssertions = collection.assertions;
      initialNotes = collection.description ?? '';
    }

    const panel = vscode.window.createWebviewPanel(
      'nouto.settings',
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
      try {
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
                initialAssertions,
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
            col.assertions = message.data.assertions;
            col.description = message.data.notes ?? '';
            col.updatedAt = new Date().toISOString();
            await this.ctx.storageService.saveCollections(this.ctx.collections);
            this.ctx.notifyCollectionsUpdated();
            panel.webview.postMessage({ type: 'settingsSaved' });
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
            folder.assertions = message.data.assertions;
            folder.description = message.data.notes ?? '';
            col.updatedAt = new Date().toISOString();
            await this.ctx.storageService.saveCollections(this.ctx.collections);
            this.ctx.notifyCollectionsUpdated();
            panel.webview.postMessage({ type: 'settingsSaved' });
            break;
          }

          case 'closeSettingsPanel':
            panel.dispose();
            break;
        }
      } catch (err) {
        console.error('[Nouto] Error in settings panel message handler:', err);
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
      'nouto.mockServer',
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

    this.ctx.registerAuxPanel(panel);

    const mockMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message.type) {
          case 'ready':
            panel.webview.postMessage({
              type: 'initMockServer',
              data: {
                config: mockConfig,
                status: this.mockServerService.getStatus(),
              },
            });
            panel.webview.postMessage({
              type: 'loadEnvironments',
              data: this.ctx.getEnvironments(),
            });
            break;

          case 'setActiveEnvironment':
            await this.ctx.setActiveEnvironment(message.data?.id ?? null);
            break;

          case 'saveEnvironments':
            if (message.data?.activeId !== undefined) {
              await this.ctx.setActiveEnvironment(message.data.activeId);
            }
            break;

          case 'openEnvironmentsPanel':
            this.ctx.openEnvironmentsPanel?.();
            break;

          case 'startMockServer':
            try {
              await this.mockServerService.start(message.data.config);
              await this.mockStorageService.save(message.data.config);
            } catch (err: any) {
              this.ui?.showError(`Mock server failed to start: ${err.message}`);
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
              this.ui?.showInfo('No collections available to import.');
              break;
            }
            const pickerItems = collections.map(c => ({ label: c.name, id: c.id }));
            const picked = await vscode.window.showQuickPick(pickerItems, { placeHolder: 'Select a collection to import' });
            if (!picked) break;
            const pickedId = picked.id;
            const col = collections.find(c => c.id === pickedId);
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
      } catch (err) {
        console.error('[Nouto] Error in mock server panel message handler:', err);
      }
    });

    panel.onDidDispose(() => {
      mockMsgDisposable.dispose();
      this.ctx.unregisterAuxPanel(panel);
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
      this.ui?.showError('Request not found for benchmarking.');
      return;
    }
    const { request } = found;

    const panel = vscode.window.createWebviewPanel(
      'nouto.benchmark',
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

    this.ctx.registerAuxPanel(panel);

    const benchMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      try {
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
            panel.webview.postMessage({
              type: 'loadEnvironments',
              data: this.ctx.getEnvironments(),
            });
            break;

          case 'setActiveEnvironment':
            await this.ctx.setActiveEnvironment(message.data?.id ?? null);
            break;

          case 'saveEnvironments':
            if (message.data?.activeId !== undefined) {
              await this.ctx.setActiveEnvironment(message.data.activeId);
            }
            break;

          case 'openEnvironmentsPanel':
            this.ctx.openEnvironmentsPanel?.();
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
            this.ui?.showInfo(`Benchmark export (${format}) - use the iteration data shown in the panel.`);
            break;
          }
        }
      } catch (err) {
        console.error('[Nouto] Error in benchmark panel message handler:', err);
      }
    });

    panel.onDidDispose(() => {
      benchMsgDisposable.dispose();
      this.ctx.unregisterAuxPanel(panel);
      this.benchmarkService.cancel();
    });
  }

  // ============================================
  // HTML Generators
  // ============================================
  private getSettingsHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'settings.js'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));

    const nonce = this.ctx.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
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
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));
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
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));
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
