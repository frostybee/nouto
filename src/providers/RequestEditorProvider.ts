import * as vscode from 'vscode';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { SidebarViewProvider } from './SidebarViewProvider';
import { StorageService } from '../services/StorageService';
import type { SavedRequest, HistoryEntry, EnvironmentsData } from '../services/types';

export class RequestEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'hivefetch.requestEditor';

  // Store abort controllers for each webview to support request cancellation
  private abortControllers: Map<vscode.Webview, AbortController> = new Map();
  private storageService: StorageService;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sidebarProvider: SidebarViewProvider
  ) {
    this.storageService = new StorageService(vscode.workspace.workspaceFolders?.[0]);
  }

  public static register(
    context: vscode.ExtensionContext,
    sidebarProvider: SidebarViewProvider
  ): vscode.Disposable {
    const provider = new RequestEditorProvider(
      context,
      sidebarProvider
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
          // Also send environments
          const envData = await this.storageService.loadEnvironments();
          webviewPanel.webview.postMessage({
            type: 'loadEnvironments',
            data: envData,
          });
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
            data: this.sidebarProvider.getCollections(),
          });
          break;

        case 'cancelRequest':
          this.handleCancelRequest(webviewPanel.webview);
          break;

        case 'saveEnvironments':
          await this.storageService.saveEnvironments(message.data);
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
    // Cancel any existing request for this webview
    const existingController = this.abortControllers.get(webview);
    if (existingController) {
      existingController.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    this.abortControllers.set(webview, abortController);

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
        signal: abortController.signal,
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

      const responseData = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        duration,
        size,
      };

      // Send response to webview
      webview.postMessage({
        type: 'requestResponse',
        data: responseData,
      });

      // Send response context for request chaining
      // This allows {{$response.body.xxx}} in subsequent requests
      webview.postMessage({
        type: 'storeResponseContext',
        data: {
          requestId: requestData.id || this.generateId(),
          response: responseData,
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
      await this.sidebarProvider.addHistoryEntry(historyEntry);
    } catch (error) {
      // Check if request was cancelled
      if (axios.isCancel(error) || (error as Error).name === 'CanceledError') {
        webview.postMessage({
          type: 'requestCancelled',
        });
        return;
      }

      let errorData: any = {
        status: 0,
        statusText: 'Error',
        headers: {},
        data: '',
        duration: 0,
        size: 0,
        error: true,
        errorInfo: null,
      };

      let errorMessage = '';

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = axiosError.message || '';
        const statusCode = axiosError.response?.status;

        errorData = {
          ...errorData,
          status: statusCode || 0,
          statusText: axiosError.response?.statusText || 'Network Error',
          headers: axiosError.response?.headers || {},
          data: axiosError.response?.data || axiosError.message,
          errorInfo: this.categorizeError(errorMessage, statusCode),
        };
      } else {
        errorMessage = (error as Error).message;
        errorData.data = errorMessage;
        errorData.statusText = 'Error';
        errorData.errorInfo = this.categorizeError(errorMessage);
      }

      webview.postMessage({
        type: 'requestResponse',
        data: errorData,
      });
    } finally {
      // Clean up abort controller
      this.abortControllers.delete(webview);
    }
  }

  private handleCancelRequest(webview: vscode.Webview) {
    const controller = this.abortControllers.get(webview);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(webview);
    }
  }

  private async handleSaveToCollection(data: {
    collectionId: string;
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>;
  }) {
    try {
      await this.sidebarProvider.addRequest(data.collectionId, data.request);
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

  private categorizeError(errorMessage: string, statusCode?: number): {
    category: string;
    message: string;
    suggestion: string;
  } {
    const lowerMessage = errorMessage.toLowerCase();

    // Timeout errors
    if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout') || lowerMessage.includes('timed out')) {
      return {
        category: 'timeout',
        message: 'Request timed out',
        suggestion: 'The server took too long to respond. Try increasing the timeout or check if the server is under heavy load.',
      };
    }

    // DNS errors
    if (lowerMessage.includes('enotfound') || lowerMessage.includes('getaddrinfo') || lowerMessage.includes('dns')) {
      return {
        category: 'dns',
        message: 'Could not resolve hostname',
        suggestion: 'Check if the URL is correct. The domain name could not be resolved to an IP address.',
      };
    }

    // SSL/TLS errors
    if (lowerMessage.includes('ssl') || lowerMessage.includes('certificate') || lowerMessage.includes('cert') ||
        lowerMessage.includes('self signed') || lowerMessage.includes('unable to verify')) {
      return {
        category: 'ssl',
        message: 'SSL/TLS certificate error',
        suggestion: 'The server has an invalid or self-signed certificate. For development, you may need to configure certificate trust.',
      };
    }

    // Connection errors
    if (lowerMessage.includes('econnrefused') || lowerMessage.includes('connection refused')) {
      return {
        category: 'connection',
        message: 'Connection refused',
        suggestion: 'The server is not accepting connections. Check if the server is running and listening on the correct port.',
      };
    }

    if (lowerMessage.includes('econnreset') || lowerMessage.includes('connection reset')) {
      return {
        category: 'connection',
        message: 'Connection was reset',
        suggestion: 'The connection was unexpectedly closed by the server. This might be a firewall issue or server crash.',
      };
    }

    if (lowerMessage.includes('enetunreach') || lowerMessage.includes('network unreachable')) {
      return {
        category: 'network',
        message: 'Network unreachable',
        suggestion: 'Check your internet connection. The target network cannot be reached.',
      };
    }

    // General network errors
    if (lowerMessage.includes('network') || lowerMessage.includes('socket') || lowerMessage.includes('epipe')) {
      return {
        category: 'network',
        message: 'Network error',
        suggestion: 'A network error occurred. Check your internet connection and firewall settings.',
      };
    }

    // Server errors based on status code
    if (statusCode && statusCode >= 500) {
      return {
        category: 'server',
        message: `Server error (${statusCode})`,
        suggestion: 'The server encountered an error. This is typically a server-side issue that needs to be fixed by the API provider.',
      };
    }

    // Unknown error
    return {
      category: 'unknown',
      message: errorMessage || 'An unknown error occurred',
      suggestion: 'An unexpected error occurred. Check the error details for more information.',
    };
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
