import * as vscode from 'vscode';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { HistoryTreeProvider } from './HistoryTreeProvider';
import { CollectionsTreeProvider } from './CollectionsTreeProvider';
import type { SavedRequest, HistoryEntry } from '../services/types';

export class RequestEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'hivefetch.requestEditor';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly historyProvider: HistoryTreeProvider,
    private readonly collectionsProvider: CollectionsTreeProvider
  ) {}

  public static register(
    context: vscode.ExtensionContext,
    historyProvider: HistoryTreeProvider,
    collectionsProvider: CollectionsTreeProvider
  ): vscode.Disposable {
    const provider = new RequestEditorProvider(
      context,
      historyProvider,
      collectionsProvider
    );
    return vscode.window.registerCustomEditorProvider(
      RequestEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'dist'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Send initial document data
    const updateWebview = () => {
      const text = document.getText();
      let requestData: SavedRequest;
      try {
        requestData = text ? JSON.parse(text) : this.getDefaultRequest();
      } catch {
        requestData = this.getDefaultRequest();
      }

      webviewPanel.webview.postMessage({
        type: 'loadRequest',
        data: requestData,
      });
    };

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          updateWebview();
          break;

        case 'updateDocument':
          await this.updateDocument(document, message.data);
          break;

        case 'sendRequest':
          await this.handleSendRequest(webviewPanel.webview, message.data);
          break;

        case 'saveToCollection':
          await this.handleSaveToCollection(message.data);
          break;

        case 'getCollections':
          webviewPanel.webview.postMessage({
            type: 'collections',
            data: this.collectionsProvider.getCollections(),
          });
          break;
      }
    });

    // Update webview when document changes externally
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      }
    );

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });
  }

  private async updateDocument(
    document: vscode.TextDocument,
    data: SavedRequest
  ) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      JSON.stringify(data, null, 2)
    );
    await vscode.workspace.applyEdit(edit);
  }

  private async handleSendRequest(webview: vscode.Webview, requestData: any) {
    try {
      const startTime = Date.now();

      // Build headers from array format
      const headers: Record<string, string> = {};
      if (requestData.headers && Array.isArray(requestData.headers)) {
        for (const h of requestData.headers) {
          if (h.enabled && h.key) {
            headers[h.key] = h.value;
          }
        }
      } else if (requestData.headers) {
        Object.assign(headers, requestData.headers);
      }

      // Build params from array format
      const params: Record<string, string> = {};
      if (requestData.params && Array.isArray(requestData.params)) {
        for (const p of requestData.params) {
          if (p.enabled && p.key) {
            params[p.key] = p.value;
          }
        }
      } else if (requestData.params) {
        Object.assign(params, requestData.params);
      }

      const config: any = {
        method: requestData.method || 'GET',
        url: requestData.url,
        headers,
        params,
        timeout: 30000,
        validateStatus: () => true,
      };

      if (
        requestData.body &&
        requestData.body.type !== 'none' &&
        ['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())
      ) {
        if (requestData.body.type === 'json' && requestData.body.content) {
          try {
            config.data = JSON.parse(requestData.body.content);
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          } catch {
            config.data = requestData.body.content;
          }
        } else if (requestData.body.type === 'text' && requestData.body.content) {
          config.data = requestData.body.content;
          headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
        } else if (requestData.body.type === 'x-www-form-urlencoded' && requestData.body.content) {
          // Parse form data from JSON array and convert to URLSearchParams
          try {
            const formItems = JSON.parse(requestData.body.content);
            const formData = new URLSearchParams();
            for (const item of formItems) {
              if (item.enabled && item.key) {
                formData.append(item.key, item.value || '');
              }
            }
            config.data = formData.toString();
            headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
          } catch {
            config.data = requestData.body.content;
          }
        } else if (requestData.body.type === 'form-data' && requestData.body.content) {
          // Parse form data from JSON array - for now, send as JSON
          // Full multipart/form-data support would require FormData handling
          try {
            const formItems = JSON.parse(requestData.body.content);
            const formData: Record<string, string> = {};
            for (const item of formItems) {
              if (item.enabled && item.key) {
                formData[item.key] = item.value || '';
              }
            }
            config.data = formData;
            // Note: axios will handle multipart/form-data with the data as an object
            headers['Content-Type'] = headers['Content-Type'] || 'multipart/form-data';
          } catch {
            config.data = requestData.body.content;
          }
        } else if (requestData.body.content) {
          config.data = requestData.body.content;
        }
      }

      if (requestData.auth) {
        if (requestData.auth.type === 'bearer' && requestData.auth.token) {
          headers['Authorization'] = `Bearer ${requestData.auth.token}`;
        } else if (
          requestData.auth.type === 'basic' &&
          requestData.auth.username
        ) {
          config.auth = {
            username: requestData.auth.username,
            password: requestData.auth.password || '',
          };
        }
      }

      config.headers = headers;

      const response: AxiosResponse = await axios(config);
      const duration = Date.now() - startTime;
      const size = this.calculateSize(response.data);

      // Send response to webview
      webview.postMessage({
        type: 'requestResponse',
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          duration,
          size,
        },
      });

      // Add to history
      const historyEntry: HistoryEntry = {
        id: this.generateId(),
        method: requestData.method,
        url: requestData.url,
        params: requestData.params || [],
        headers: requestData.headers || [],
        auth: requestData.auth || { type: 'none' },
        body: requestData.body || { type: 'none', content: '' },
        status: response.status,
        statusText: response.statusText,
        duration,
        size,
        timestamp: new Date().toISOString(),
      };
      await this.historyProvider.addEntry(historyEntry);
    } catch (error) {
      let errorData: any = {
        status: 0,
        statusText: 'Error',
        headers: {},
        data: '',
        duration: 0,
        size: 0,
        error: true,
      };

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorData = {
          ...errorData,
          status: axiosError.response?.status || 0,
          statusText: axiosError.response?.statusText || 'Network Error',
          headers: axiosError.response?.headers || {},
          data: axiosError.response?.data || axiosError.message,
        };
      } else {
        errorData.data = (error as Error).message;
        errorData.statusText = 'Error';
      }

      webview.postMessage({
        type: 'requestResponse',
        data: errorData,
      });
    }
  }

  private async handleSaveToCollection(data: {
    collectionId: string;
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>;
  }) {
    try {
      await this.collectionsProvider.addRequest(data.collectionId, data.request);
      vscode.window.showInformationMessage('Request saved to collection');
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save request: ${(error as Error).message}`
      );
    }
  }

  private calculateSize(data: any): number {
    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    }
    return Buffer.byteLength(JSON.stringify(data), 'utf8');
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private getDefaultRequest(): SavedRequest {
    return {
      id: this.generateId(),
      name: 'New Request',
      method: 'GET',
      url: '',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', content: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'src',
      'webview',
      'dist'
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'bundle.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'bundle.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src https: http:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>HiveFetch Request</title>
</head>
<body>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
