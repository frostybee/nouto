import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type { CookieJarService } from '@hivefetch/core/services';
import type { EnvFileService } from '../../services/EnvFileService';
import type { EnvironmentsData, EnvironmentVariable } from '../../services/types';
import { generateId } from './CollectionTreeOps';

export interface IEnvironmentsPanelContext {
  environments: EnvironmentsData;
  storageService: {
    saveEnvironments(data: EnvironmentsData): Promise<any>;
  };
  envFileService: EnvFileService;
  cookieJarService: CookieJarService;
  extensionUri: vscode.Uri;
  getNonce(): string;
  notifyEnvironmentsUpdated(): void;
  setEnvironments(data: EnvironmentsData): void;
}

export class EnvironmentsPanelHandler {
  private _panel: vscode.WebviewPanel | undefined;

  constructor(private readonly ctx: IEnvironmentsPanelContext) {}

  async open(): Promise<void> {
    // Singleton: reveal if already open
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.environments',
      'Environments & Cookies',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist'),
        ],
      }
    );

    this._panel = panel;

    panel.webview.html = this._getHtml(panel.webview);

    const disposable = panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready': {
          const envData = this.ctx.environments;
          const envFileVars = this.ctx.envFileService.getVariables();
          const cookieData = await this.ctx.cookieJarService.getAllByDomain();
          panel.webview.postMessage({
            type: 'initEnvironments',
            data: {
              environments: envData.environments,
              activeId: envData.activeId,
              globalVariables: envData.globalVariables || [],
              envFilePath: envData.envFilePath ?? null,
              envFileVariables: envFileVars,
              cookieJarData: cookieData,
            },
          });
          break;
        }

        case 'saveEnvironments': {
          const incoming = message.data;
          this.ctx.environments.environments = incoming.environments ?? this.ctx.environments.environments;
          this.ctx.environments.activeId = incoming.activeId ?? this.ctx.environments.activeId;
          if (incoming.globalVariables !== undefined) {
            this.ctx.environments.globalVariables = incoming.globalVariables;
          }
          await this.ctx.storageService.saveEnvironments(this.ctx.environments);
          this.ctx.setEnvironments({ ...this.ctx.environments });
          this.ctx.notifyEnvironmentsUpdated();
          break;
        }

        case 'linkEnvFile': {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Environment Files': ['env'], 'All Files': ['*'] },
            title: 'Select .env File',
          });
          if (!result || result.length === 0) break;
          const filePath = result[0].fsPath;
          await this.ctx.envFileService.setFilePath(filePath);
          this.ctx.environments.envFilePath = filePath;
          await this.ctx.storageService.saveEnvironments(this.ctx.environments);
          panel.webview.postMessage({
            type: 'envFileVariablesUpdated',
            data: { variables: this.ctx.envFileService.getVariables(), filePath },
          });
          break;
        }

        case 'unlinkEnvFile': {
          await this.ctx.envFileService.setFilePath(null);
          this.ctx.environments.envFilePath = null;
          await this.ctx.storageService.saveEnvironments(this.ctx.environments);
          panel.webview.postMessage({
            type: 'envFileVariablesUpdated',
            data: { variables: [], filePath: null },
          });
          break;
        }

        case 'getCookieJar': {
          const cookies = await this.ctx.cookieJarService.getAllByDomain();
          panel.webview.postMessage({ type: 'cookieJarData', data: cookies });
          break;
        }

        case 'deleteCookie': {
          const { name, domain, path } = message.data;
          await this.ctx.cookieJarService.deleteCookie(name, domain, path);
          const updated = await this.ctx.cookieJarService.getAllByDomain();
          panel.webview.postMessage({ type: 'cookieJarData', data: updated });
          break;
        }

        case 'deleteCookieDomain': {
          await this.ctx.cookieJarService.deleteDomain(message.data.domain);
          const updated = await this.ctx.cookieJarService.getAllByDomain();
          panel.webview.postMessage({ type: 'cookieJarData', data: updated });
          break;
        }

        case 'clearCookieJar': {
          await this.ctx.cookieJarService.clearAll();
          panel.webview.postMessage({ type: 'cookieJarData', data: {} });
          break;
        }

        case 'exportEnvironment': {
          const env = this.ctx.environments.environments.find(e => e.id === message.data.id);
          if (!env) break;
          const exportData = {
            name: env.name,
            variables: this._mapVariables(env.variables),
            exportedAt: new Date().toISOString(),
            _type: 'hivefetch-environment',
          };
          const safeName = env.name.replace(/[^a-zA-Z0-9]/g, '_');
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(safeName + '.env.json'),
            filters: { 'JSON Files': ['json'] },
            title: `Export Environment: ${env.name}`,
          });
          if (uri) {
            await fs.writeFile(uri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');
            vscode.window.showInformationMessage(`Environment "${env.name}" exported successfully.`);
          }
          break;
        }

        case 'exportAllEnvironments': {
          const exportData = {
            globalVariables: this._mapVariables(this.ctx.environments.globalVariables || []),
            environments: this.ctx.environments.environments.map(env => ({
              id: env.id,
              name: env.name,
              variables: this._mapVariables(env.variables),
            })),
            exportedAt: new Date().toISOString(),
            _type: 'hivefetch-environments',
          };
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('environments.json'),
            filters: { 'JSON Files': ['json'] },
            title: 'Export All Environments',
          });
          if (uri) {
            await fs.writeFile(uri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');
            vscode.window.showInformationMessage('All environments exported successfully.');
          }
          break;
        }

        case 'importEnvironments': {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'JSON Files': ['json'] },
            title: 'Import Environments',
          });
          if (!result || result.length === 0) break;

          let importData: any;
          try {
            const raw = await fs.readFile(result[0].fsPath, 'utf8');
            importData = JSON.parse(raw);
          } catch {
            vscode.window.showErrorMessage('Failed to read the file. Make sure it is a valid JSON file.');
            break;
          }

          const pushEnvUpdate = async () => {
            await this.ctx.storageService.saveEnvironments(this.ctx.environments);
            this.ctx.setEnvironments({ ...this.ctx.environments });
            this.ctx.notifyEnvironmentsUpdated();
            panel.webview.postMessage({
              type: 'initEnvironments',
              data: {
                environments: this.ctx.environments.environments,
                activeId: this.ctx.environments.activeId,
                globalVariables: this.ctx.environments.globalVariables || [],
                envFilePath: this.ctx.environments.envFilePath ?? null,
                envFileVariables: this.ctx.envFileService.getVariables(),
                cookieJarData: await this.ctx.cookieJarService.getAllByDomain(),
              },
            });
          };

          const mapVars = (vars: any[]): EnvironmentVariable[] =>
            (vars || []).map((v: any) => ({
              key: v.key ?? '',
              value: v.value ?? '',
              enabled: v.enabled ?? true,
              ...(v.description ? { description: v.description } : {}),
            }));

          if (importData._type === 'hivefetch-environment') {
            const existingNames = new Set(this.ctx.environments.environments.map(e => e.name));
            const name = existingNames.has(importData.name)
              ? `${importData.name} (imported)`
              : importData.name;
            this.ctx.environments.environments.push({
              id: generateId(),
              name,
              variables: mapVars(importData.variables),
            });
            await pushEnvUpdate();
            vscode.window.showInformationMessage(`Environment "${name}" imported successfully.`);
            break;
          }

          if (importData._type === 'hivefetch-environments') {
            const incomingGlobals: any[] = importData.globalVariables || [];
            if (incomingGlobals.length > 0) {
              const globalChoice = await vscode.window.showQuickPick(
                [
                  { label: 'Merge', description: 'Add new keys, skip keys that already exist', value: 'merge' },
                  { label: 'Overwrite', description: 'Replace all global variables with the imported set', value: 'overwrite' },
                  { label: 'Skip', description: 'Keep existing global variables unchanged', value: 'skip' },
                ],
                { title: 'Import: Global Variables', placeHolder: 'How should global variables be handled?' }
              );
              if (!globalChoice) break;

              if (globalChoice.value === 'overwrite') {
                this.ctx.environments.globalVariables = mapVars(incomingGlobals);
              } else if (globalChoice.value === 'merge') {
                const existingKeys = new Set((this.ctx.environments.globalVariables || []).map(v => v.key));
                this.ctx.environments.globalVariables = this.ctx.environments.globalVariables || [];
                for (const v of incomingGlobals) {
                  if (!existingKeys.has(v.key)) {
                    this.ctx.environments.globalVariables.push({
                      key: v.key ?? '',
                      value: v.value ?? '',
                      enabled: v.enabled ?? true,
                      ...(v.description ? { description: v.description } : {}),
                    });
                  }
                }
              }
            }

            const existingNames = new Set(this.ctx.environments.environments.map(e => e.name));
            const importedEnvs: any[] = importData.environments || [];
            for (const env of importedEnvs) {
              const name = existingNames.has(env.name) ? `${env.name} (imported)` : env.name;
              this.ctx.environments.environments.push({
                id: generateId(),
                name,
                variables: mapVars(env.variables),
              });
            }

            await pushEnvUpdate();
            const count = importedEnvs.length;
            vscode.window.showInformationMessage(
              `Imported ${count} environment${count !== 1 ? 's' : ''} successfully.`
            );
            break;
          }

          vscode.window.showErrorMessage('Unrecognized format. Only HiveFetch environment exports (.env.json) are supported.');
          break;
        }
      }
    });

    // Subscribe to .env file changes while panel is open
    const envFileDisposable = this.ctx.envFileService.onDidChange((variables) => {
      panel.webview.postMessage({
        type: 'envFileVariablesUpdated',
        data: { variables, filePath: this.ctx.envFileService.getFilePath() },
      });
    });

    panel.onDidDispose(() => {
      disposable.dispose();
      envFileDisposable.dispose();
      this._panel = undefined;
    });
  }

  private _mapVariables(vars: EnvironmentVariable[]) {
    return vars.map(v => ({
      key: v.key,
      value: v.value,
      enabled: v.enabled,
      ...(v.description ? { description: v.description } : {}),
    }));
  }

  private _getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'environments.js'));
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
  <title>Environments &amp; Cookies</title>
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
