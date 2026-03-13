import * as vscode from 'vscode';

export interface IGlobalSettingsPanelContext {
  extensionUri: vscode.Uri;
  extensionContext: vscode.ExtensionContext;
  getNonce(): string;
  /** Called after settings are saved so request panels can reload */
  onSettingsUpdated(data: Record<string, any>): void;
  /** Get current storage mode from StorageService */
  getStorageMode(): string;
  hasWorkspace(): boolean;
  switchStorageMode(mode: 'global' | 'workspace'): Promise<boolean>;
  notifyCollectionsUpdated(): Promise<void>;
  openEnvironmentsPanel(tab?: string): Promise<void>;
}

const SETTINGS_KEY = 'hivefetch.settings';

export class GlobalSettingsPanelHandler {
  private _panel: vscode.WebviewPanel | undefined;

  constructor(private readonly ctx: IGlobalSettingsPanelContext) {}

  async open(): Promise<void> {
    // Singleton: reveal if already open
    if (this._panel) {
      try {
        this._panel.reveal();
        return;
      } catch {
        this._panel = undefined;
      }
    }

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.appSettings',
      'Settings',
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
          const data = this._getSettingsData();
          panel.webview.postMessage({ type: 'initSettings', data });
          break;
        }

        case 'updateSettings': {
          await this._handleUpdateSettings(message.data);
          // Re-send updated settings to keep the panel in sync
          const data = this._getSettingsData();
          panel.webview.postMessage({ type: 'initSettings', data });
          break;
        }

        case 'pickSslFile': {
          const isCert = message.data.field === 'cert' || message.data.field === 'global-cert';
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: isCert ? 'Select Certificate File' : 'Select Key File',
            filters: {
              'Certificate/Key files': ['pem', 'crt', 'cer', 'key', 'p12', 'pfx'],
              'All files': ['*'],
            },
          });
          if (uris && uris.length > 0) {
            panel.webview.postMessage({
              type: 'sslFilePicked',
              data: { field: message.data.field, path: uris[0].fsPath },
            });
          }
          break;
        }

        case 'openEnvironmentsPanel': {
          await this.ctx.openEnvironmentsPanel(message.data?.tab);
          break;
        }

        case 'openExternal': {
          const url = message.data?.url;
          if (url) { vscode.env.openExternal(vscode.Uri.parse(url)); }
          break;
        }
      }
    });

    panel.onDidDispose(() => {
      disposable.dispose();
      this._panel = undefined;
    });
  }

  private _getStoredSettings(): Record<string, any> {
    return this.ctx.extensionContext.globalState.get<Record<string, any>>(SETTINGS_KEY) ?? {};
  }

  private _getSettingsData() {
    const stored = this._getStoredSettings();
    return {
      autoCorrectUrls: (stored.autoCorrectUrls as boolean) ?? false,
      shortcuts: (stored.shortcuts as Record<string, string>) ?? {},
      minimap: (stored.minimap as string) ?? 'auto',
      saveResponseBody: (stored.saveResponseBody as boolean) ?? true,
      sslRejectUnauthorized: (stored.sslRejectUnauthorized as boolean) ?? true,
      storageMode: this.ctx.getStorageMode(),
      hasWorkspace: this.ctx.hasWorkspace(),
      globalProxy: (stored.globalProxy as any) ?? null,
      defaultTimeout: (stored.defaultTimeout as number) ?? null,
      defaultFollowRedirects: (stored.defaultFollowRedirects as boolean) ?? null,
      defaultMaxRedirects: (stored.defaultMaxRedirects as number) ?? null,
      globalClientCert: (stored.globalClientCert as any) ?? null,
    };
  }

  private async _handleUpdateSettings(data: Record<string, any>): Promise<void> {
    const currentStorageMode = this.ctx.getStorageMode();
    if (data.storageMode !== currentStorageMode) {
      const switched = await this.ctx.switchStorageMode(data.storageMode as 'global' | 'workspace');
      if (!switched) {
        data.storageMode = currentStorageMode;
      } else {
        await this.ctx.notifyCollectionsUpdated();
      }
    }

    data.storageMode = this.ctx.getStorageMode();
    await this.ctx.extensionContext.globalState.update(SETTINGS_KEY, data);

    // Notify request panels so their settings stay in sync
    this.ctx.onSettingsUpdated(data);
  }

  private _getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'app-settings.js'));
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
}
