import * as vscode from 'vscode';
import type { CookieJarService } from '@hivefetch/core/services';
import type { EnvFileService } from '../../services/EnvFileService';
import type { EnvironmentsData } from '../../services/types';

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
