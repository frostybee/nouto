import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type { CollectionRunnerService } from '@hivefetch/core/services';
import { resolveVariablesForRequest } from '@hivefetch/core/services';
import type { Collection, SavedRequest, Folder, EnvironmentVariable, DataRow } from '../../services/types';
import { findFolderRecursive, getAllRequestsFromItems } from './CollectionTreeOps';

export interface IRunnerContext {
  collections: Collection[];
  storageService: {
    loadEnvironments(): Promise<any>;
  };
  extensionUri: vscode.Uri;
  getNonce(): string;
}

export class RunnerPanelHandler {
  constructor(
    private readonly ctx: IRunnerContext,
    private readonly runnerService: CollectionRunnerService
  ) {}

  async openCollectionRunner(collectionId: string, folderId?: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) return;

    let requests: SavedRequest[];
    let panelTitle: string;

    if (folderId) {
      const folder = findFolderRecursive(collection.items, folderId);
      if (!folder) return;
      requests = getAllRequestsFromItems(folder.children);
      panelTitle = `Runner: ${folder.name}`;
    } else {
      requests = getAllRequestsFromItems(collection.items);
      panelTitle = `Runner: ${collection.name}`;
    }

    if (requests.length === 0) {
      vscode.window.showInformationMessage('No requests to run');
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.collectionRunner',
      panelTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this.getRunnerHtml(panel.webview);

    const runnerMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initRunner',
            data: {
              collectionId,
              collectionName: collection.name,
              folderId,
              requests: requests.map(r => ({ id: r.id, name: r.name, method: r.method, url: r.url })),
            },
          });
          break;

        case 'startCollectionRun': {
          const config = message.data.config;
          const envData = await this.ctx.storageService.loadEnvironments();

          let requestsToRun = requests;
          if (message.data.requestIds && Array.isArray(message.data.requestIds)) {
            const idOrder: string[] = message.data.requestIds;
            const idMap = new Map(requests.map(r => [r.id, r]));
            requestsToRun = idOrder.map(id => idMap.get(id)).filter(Boolean) as typeof requests;
          }

          const scopedVars = this.resolveCollectionScopedVariables(collection, folderId);

          let dataRows: DataRow[] | undefined;
          if (config.dataFile && config.dataFileType) {
            try {
              const { parseDataFile } = await import('../../services/DataFileService');
              dataRows = await parseDataFile(config.dataFile, config.dataFileType);
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Unknown error';
              vscode.window.showErrorMessage(`Failed to parse data file: ${msg}`);
            }
          }

          this.runnerService.runCollection(
            requestsToRun,
            config,
            collection.name,
            envData,
            (progress) => {
              panel.webview.postMessage({ type: 'collectionRunProgress', data: progress });
            },
            (result) => {
              panel.webview.postMessage({ type: 'collectionRunRequestResult', data: result });
            },
            collection,
            scopedVars,
            dataRows,
          ).then((result) => {
            panel.webview.postMessage({ type: 'collectionRunComplete', data: result });
          }).catch(() => {});
          break;
        }

        case 'cancelCollectionRun':
          this.runnerService.cancel();
          panel.webview.postMessage({ type: 'collectionRunCancelled' });
          break;

        case 'retryFailedRequests': {
          const retryIds: string[] = message.data.requestIds || [];
          const retryConfig = message.data.config;
          const retryEnvData = await this.ctx.storageService.loadEnvironments();
          const idMap = new Map(requests.map(r => [r.id, r]));
          const retryRequests = retryIds.map(id => idMap.get(id)).filter(Boolean) as SavedRequest[];

          if (retryRequests.length > 0) {
            const retryScopedVars = this.resolveCollectionScopedVariables(collection, folderId);
            this.runnerService.runCollection(
              retryRequests,
              retryConfig,
              collection.name,
              retryEnvData,
              (progress) => {
                panel.webview.postMessage({ type: 'collectionRunProgress', data: progress });
              },
              (result) => {
                panel.webview.postMessage({ type: 'collectionRunRequestResult', data: result });
              },
              collection,
              retryScopedVars,
            ).then((result) => {
              panel.webview.postMessage({ type: 'collectionRunComplete', data: result });
            }).catch(() => {});
          }
          break;
        }

        case 'selectDataFile': {
          const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
              'Data Files': ['csv', 'json'],
              'CSV Files': ['csv'],
              'JSON Files': ['json'],
            },
            title: 'Select Data File for Iteration',
          });

          if (fileUris && fileUris.length > 0) {
            const filePath = fileUris[0].fsPath;
            const ext = filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
            try {
              const { parseDataFile } = await import('../../services/DataFileService');
              const rows = await parseDataFile(filePath, ext);
              const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
              panel.webview.postMessage({
                type: 'dataFileSelected',
                data: {
                  path: filePath,
                  type: ext,
                  rowCount: rows.length,
                  columns,
                },
              });
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Unknown error';
              vscode.window.showErrorMessage(`Failed to parse data file: ${msg}`);
            }
          }
          break;
        }

        case 'exportRunResults':
          await this.exportRunResults(message.data);
          break;
      }
    });

    panel.onDidDispose(() => {
      runnerMsgDisposable.dispose();
      this.runnerService.cancel();
    });
  }

  private async exportRunResults(data: { format: string; results: any[]; summary: any; collectionName: string }): Promise<void> {
    const { format, results, summary, collectionName } = data;

    let content: string;
    let defaultName: string;
    let filters: Record<string, string[]>;

    if (format === 'csv') {
      const header = '#,Name,Method,URL,Status,StatusText,Duration(ms),Pass/Fail,Error';
      const rows = results.map((r: any, i: number) =>
        `${i + 1},"${(r.requestName || '').replace(/"/g, '""')}",${r.method},"${(r.url || '').replace(/"/g, '""')}",${r.status},${r.statusText || ''},${r.duration},${r.passed ? 'Pass' : 'Fail'},"${(r.error || '').replace(/"/g, '""')}"`
      );
      content = [header, ...rows].join('\n');
      defaultName = `${collectionName.replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`;
      filters = { 'CSV Files': ['csv'] };
    } else {
      content = JSON.stringify({ collectionName, summary, results }, null, 2);
      defaultName = `${collectionName.replace(/[^a-zA-Z0-9]/g, '_')}_results.json`;
      filters = { 'JSON Files': ['json'] };
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultName),
      filters,
      title: `Export Results (${format.toUpperCase()})`,
    });

    if (uri) {
      await fs.writeFile(uri.fsPath, content, 'utf8');
      vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
    }
  }

  private resolveCollectionScopedVariables(collection: Collection, folderId?: string): EnvironmentVariable[] {
    const ancestors: (Collection | Folder)[] = [collection];
    if (folderId) {
      const folder = findFolderRecursive(collection.items, folderId);
      if (folder) {
        ancestors.push(folder);
      }
    }
    return resolveVariablesForRequest(collection, ancestors);
  }

  private getRunnerHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'runner.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'runner.css'));
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
  <title>Collection Runner</title>
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
