import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { EnvFileService } from '../../services/EnvFileService';
import type { EnvironmentsData, EnvironmentVariable } from '../../services/types';
import { generateId } from './CollectionTreeOps';

export interface ICookieJarHandler {
  handleGetCookieJar(webview: vscode.Webview): Promise<void>;
  handleGetCookieJars(webview: vscode.Webview): Promise<void>;
  handleCreateCookieJar(webview: vscode.Webview, data: { name: string }): Promise<void>;
  handleRenameCookieJar(webview: vscode.Webview, data: { id: string; name: string }): Promise<void>;
  handleDeleteCookieJar(webview: vscode.Webview, data: { id: string }): Promise<void>;
  handleSetActiveCookieJar(webview: vscode.Webview, data: { id: string | null }): Promise<void>;
  handleAddCookie(webview: vscode.Webview, data: any): Promise<void>;
  handleUpdateCookie(webview: vscode.Webview, data: any): Promise<void>;
  handleDeleteCookie(webview: vscode.Webview, data: { name: string; domain: string; path: string }): Promise<void>;
  handleDeleteCookieDomain(webview: vscode.Webview, data: { domain: string }): Promise<void>;
  handleClearCookieJar(webview: vscode.Webview): Promise<void>;
  addExternalWebview(webview: vscode.Webview): void;
  removeExternalWebview(webview: vscode.Webview): void;
}

export interface IEnvironmentsPanelContext {
  environments: EnvironmentsData;
  storageService: {
    saveEnvironments(data: EnvironmentsData): Promise<any>;
  };
  envFileService: EnvFileService;
  extensionUri: vscode.Uri;
  getNonce(): string;
  notifyEnvironmentsUpdated(): void;
  setEnvironments(data: EnvironmentsData): void;
  cookieJarHandler?: ICookieJarHandler;
  hydrateSecrets?(data: EnvironmentsData): Promise<void>;
  persistSecrets?(data: EnvironmentsData): Promise<void>;
}

export class EnvironmentsPanelHandler {
  private _panel: vscode.WebviewPanel | undefined;

  constructor(private readonly ctx: IEnvironmentsPanelContext) {}

  async open(tab?: string): Promise<void> {
    // Singleton: reveal if already open
    if (this._panel) {
      try {
        this._panel.reveal();
        if (tab) {
          this._panel.webview.postMessage({ type: 'focusTab', data: { tab } });
        }
        return;
      } catch {
        // Panel was disposed externally; clear reference and create a new one
        this._panel = undefined;
      }
    }

    const panel = vscode.window.createWebviewPanel(
      'nouto.environments',
      'Environments',
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

    // Register for cookie jar broadcasts so this panel stays in sync
    // Capture webview ref early: panel.webview throws after disposal
    const webview = panel.webview;
    this.ctx.cookieJarHandler?.addExternalWebview(webview);

    const disposable = panel.webview.onDidReceiveMessage(async (message) => {
      try {
      switch (message.type) {
        case 'ready': {
          // Deep-clone so hydration doesn't leak into the sidebar's shared object
          const envData: EnvironmentsData = JSON.parse(JSON.stringify(this.ctx.environments));
          if (this.ctx.hydrateSecrets) {
            await this.ctx.hydrateSecrets(envData);
          }
          const envFileVars = this.ctx.envFileService.getVariables();
          panel.webview.postMessage({
            type: 'initEnvironments',
            data: {
              environments: envData.environments,
              activeId: envData.activeId,
              globalVariables: envData.globalVariables || [],
              envFilePath: envData.envFilePath ?? null,
              envFileVariables: envFileVars,
            },
          });
          if (tab) {
            panel.webview.postMessage({ type: 'focusTab', data: { tab } });
          }
          break;
        }

        case 'saveEnvironments': {
          // The environments panel edits env data (name, variables, color, globals)
          // but should NOT overwrite activeId, which may have changed in the
          // request panel since this panel was opened.
          const incoming = message.data;
          this.ctx.environments.environments = incoming.environments ?? this.ctx.environments.environments;
          if (incoming.globalVariables !== undefined) {
            this.ctx.environments.globalVariables = incoming.globalVariables;
          }
          if (this.ctx.persistSecrets) {
            await this.ctx.persistSecrets(this.ctx.environments);
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

        case 'exportGlobalVariables': {
          const exportData = {
            globalVariables: this._mapVariables(this.ctx.environments.globalVariables || []),
            exportedAt: new Date().toISOString(),
            _type: 'nouto-globals',
          };
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('global-variables.json'),
            filters: { 'JSON Files': ['json'] },
            title: 'Export Global Variables',
          });
          if (uri) {
            await fs.writeFile(uri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');
            vscode.window.showInformationMessage('Global variables exported successfully.');
          }
          break;
        }

        case 'importGlobalVariables': {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'JSON Files': ['json'] },
            title: 'Import Global Variables',
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

          // Detect Postman environment/globals files and convert to nouto-globals format
          if (!importData._type && Array.isArray(importData.values)) {
            importData = {
              _type: 'nouto-globals',
              globalVariables: importData.values.map((v: any) => ({
                key: v.key ?? '',
                value: v.value ?? '',
                enabled: v.enabled !== false,
              })),
            };
          }

          if (importData._type !== 'nouto-globals') {
            vscode.window.showErrorMessage('Unrecognized format. Supported: Nouto globals export, Postman environment/globals file.');
            break;
          }

          const incomingGlobals: any[] = importData.globalVariables || [];
          const globalChoice = await vscode.window.showQuickPick(
            [
              { label: 'Merge', description: 'Add new keys, skip keys that already exist', value: 'merge' },
              { label: 'Overwrite', description: 'Replace all global variables with the imported set', value: 'overwrite' },
              { label: 'Skip', description: 'Keep existing global variables unchanged', value: 'skip' },
            ],
            { title: 'Import Global Variables', placeHolder: 'How should global variables be handled?' }
          );
          if (!globalChoice) break;

          const mapVars = (vars: any[]): EnvironmentVariable[] =>
            (vars || []).map((v: any) => ({
              key: v.key ?? '',
              value: v.value ?? '',
              enabled: v.enabled ?? true,
              ...(v.description ? { description: v.description } : {}),
            }));

          if (globalChoice.value === 'overwrite') {
            this.ctx.environments.globalVariables = mapVars(incomingGlobals);
          } else if (globalChoice.value === 'merge') {
            const existingKeys = new Set((this.ctx.environments.globalVariables || []).map(v => v.key));
            this.ctx.environments.globalVariables = this.ctx.environments.globalVariables || [];
            for (const v of incomingGlobals) {
              if (!existingKeys.has(v.key)) {
                this.ctx.environments.globalVariables.push(mapVars([v])[0]);
              }
            }
          }

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
            },
          });
          vscode.window.showInformationMessage('Global variables imported successfully.');
          break;
        }

        case 'exportEnvironment': {
          const env = this.ctx.environments.environments.find(e => e.id === message.data.id);
          if (!env) break;
          const exportData = {
            name: env.name,
            variables: this._mapVariables(env.variables),
            ...(env.color ? { color: env.color } : {}),
            exportedAt: new Date().toISOString(),
            _type: 'nouto-environment',
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
            environments: this.ctx.environments.environments.map(env => ({
              id: env.id,
              name: env.name,
              variables: this._mapVariables(env.variables),
              ...(env.color ? { color: env.color } : {}),
            })),
            exportedAt: new Date().toISOString(),
            _type: 'nouto-environments',
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

          if (importData._type === 'nouto-environment') {
            const existingNames = new Set(this.ctx.environments.environments.map(e => e.name));
            const name = existingNames.has(importData.name)
              ? `${importData.name} (imported)`
              : importData.name;
            this.ctx.environments.environments.push({
              id: generateId(),
              name,
              variables: mapVars(importData.variables),
              ...(importData.color ? { color: importData.color } : {}),
            });
            await pushEnvUpdate();
            vscode.window.showInformationMessage(`Environment "${name}" imported successfully.`);
            break;
          }

          if (importData._type === 'nouto-environments') {
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
                ...(env.color ? { color: env.color } : {}),
              });
            }

            await pushEnvUpdate();
            const count = importedEnvs.length;
            vscode.window.showInformationMessage(
              `Imported ${count} environment${count !== 1 ? 's' : ''} successfully.`
            );
            break;
          }

          // Detect Postman environment/globals files and import as a single environment
          if (Array.isArray(importData.values)) {
            const basename = path.basename(result[0].fsPath, '.json');
            const fallbackName = basename.replace('.postman_environment', '').replace('.postman_globals', '');
            const envName = importData.name || fallbackName;
            const existingNames = new Set(this.ctx.environments.environments.map(e => e.name));
            const name = existingNames.has(envName) ? `${envName} (imported)` : envName;
            this.ctx.environments.environments.push({
              id: generateId(),
              name,
              variables: mapVars(importData.values),
            });
            await pushEnvUpdate();
            vscode.window.showInformationMessage(`Postman environment "${name}" imported successfully.`);
            break;
          }

          vscode.window.showErrorMessage('Unrecognized format. Supported: Nouto environment export, Postman environment/globals file.');
          break;
        }

        // Cookie Jar operations
        case 'getCookieJar':
          await this.ctx.cookieJarHandler?.handleGetCookieJar(panel.webview);
          break;
        case 'getCookieJars':
          await this.ctx.cookieJarHandler?.handleGetCookieJars(panel.webview);
          break;
        case 'createCookieJar':
          await this.ctx.cookieJarHandler?.handleCreateCookieJar(panel.webview, message.data);
          break;
        case 'renameCookieJar':
          await this.ctx.cookieJarHandler?.handleRenameCookieJar(panel.webview, message.data);
          break;
        case 'deleteCookieJar':
          await this.ctx.cookieJarHandler?.handleDeleteCookieJar(panel.webview, message.data);
          break;
        case 'setActiveCookieJar':
          await this.ctx.cookieJarHandler?.handleSetActiveCookieJar(panel.webview, message.data);
          break;
        case 'addCookie':
          await this.ctx.cookieJarHandler?.handleAddCookie(panel.webview, message.data);
          break;
        case 'updateCookie':
          await this.ctx.cookieJarHandler?.handleUpdateCookie(panel.webview, message.data);
          break;
        case 'deleteCookie':
          await this.ctx.cookieJarHandler?.handleDeleteCookie(panel.webview, message.data);
          break;
        case 'deleteCookieDomain':
          await this.ctx.cookieJarHandler?.handleDeleteCookieDomain(panel.webview, message.data);
          break;
        case 'clearCookieJar':
          await this.ctx.cookieJarHandler?.handleClearCookieJar(panel.webview);
          break;
      }
      } catch (err) {
        console.error('[Nouto] Error in environments panel message handler:', err);
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
      this.ctx.cookieJarHandler?.removeExternalWebview(webview);
      disposable.dispose();
      envFileDisposable.dispose();
      this._panel = undefined;
    });
  }

  private _mapVariables(vars: EnvironmentVariable[]) {
    return vars.map(v => ({
      key: v.key,
      value: v.isSecret ? '' : v.value,
      enabled: v.enabled,
      ...(v.description ? { description: v.description } : {}),
      ...(v.isSecret ? { isSecret: true } : {}),
    }));
  }

  private _getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'environments.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));
    const nonce = this.ctx.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Environments</title>
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
