import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  executeRequest, evaluateAssertions, resolveRequestWithInheritance,
  parseDigestChallenge, computeDigestAuth, resolveAssertionsForRequest,
} from '@hivefetch/core/services';
import type { CookieJarService } from '@hivefetch/core/services';
import { HistoryStorageService } from '../../services/HistoryStorageService';
import type { TimelineEvent, ConnectionMode } from '../../services/types';
import type { IPanelContext, PanelInfo } from './PanelTypes';
import type { RequestBodyBuilder } from './RequestBodyBuilder';
import type { RequestAuthHandler } from './RequestAuthHandler';
import type { ScriptRunner } from './ScriptRunner';

function buildFullUrl(baseUrl: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return baseUrl;
  try {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (key) url.searchParams.append(key, value);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

export class RequestExecutor {
  constructor(
    private readonly ctx: IPanelContext,
    private readonly bodyBuilder: RequestBodyBuilder,
    private readonly authHandler: RequestAuthHandler,
    private readonly scriptRunner: ScriptRunner,
    private readonly cookieJarService: CookieJarService
  ) {}

  async handleSendRequest(webview: vscode.Webview, panelId: string, requestData: any): Promise<boolean> {
    const panelInfo = this.ctx.panels.get(panelId);

    // Cancel any existing request for this panel
    if (panelInfo?.abortController) {
      panelInfo.abortController.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    if (panelInfo) {
      panelInfo.abortController = abortController;
    }

    const timeline: TimelineEvent[] = [];
    const startTime = Date.now();

    try {
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
        timeout: requestData.timeout ?? 30000,
        signal: abortController.signal,
        maxRedirects: requestData.followRedirects === false ? 0 : (requestData.maxRedirects ?? undefined),
      };

      // Build request body
      if (
        requestData.body &&
        requestData.body.type !== 'none'
      ) {
        const bodyResult = await this.bodyBuilder.build(requestData.body, headers);
        if (bodyResult.error) {
          webview.postMessage({
            type: 'requestResponse',
            data: {
              status: 0, statusText: 'Validation Error', headers: {}, data: '', duration: 0, size: 0, error: true,
              errorInfo: bodyResult.error,
            },
          });
          return false;
        }
        if (bodyResult.data !== undefined) config.data = bodyResult.data;
        if (bodyResult.formData) config.formData = bodyResult.formData;
        Object.assign(headers, bodyResult.headerUpdates);
      }

      // Resolve auth inheritance: if the request inherits auth, resolve from collection/folder chain
      let effectiveAuth = requestData.auth;
      if (requestData.authInheritance === 'inherit' && panelInfo?.collectionId) {
        const collections = this.ctx.sidebarProvider.getCollections();
        const collection = collections.find((c: any) => c.id === panelInfo.collectionId);
        if (collection && panelInfo.requestId) {
          const resolved = resolveRequestWithInheritance(collection, panelInfo.requestId, 'inherit');
          if (resolved) {
            effectiveAuth = resolved.auth;
          }
        }
      } else if (requestData.authInheritance === 'none') {
        effectiveAuth = { type: 'none' };
      }

      // Apply auth
      if (effectiveAuth) {
        const authResult = await this.authHandler.applyAuth(effectiveAuth, headers, params, config);
        Object.assign(headers, authResult.headerUpdates);
        Object.assign(params, authResult.paramUpdates);
        config.params = params;
        if (authResult.authConfig) config.auth = authResult.authConfig;
        if (authResult.ntlmAuth) config._ntlmAuth = authResult.ntlmAuth;
        if (authResult.digestAuth) config._digestAuth = authResult.digestAuth;
        if (authResult.tokenRefreshed) {
          webview.postMessage({ type: 'oauthTokenRefreshed', data: authResult.tokenRefreshed });
        }
        if (authResult.warning) {
          this.ctx.panels.get(panelId)?.uiService?.showWarning(authResult.warning);
        }
      }

      config.headers = headers;

      // --- Pre-request script execution ---
      await this.scriptRunner.runPreRequestScripts(webview, panelId, panelInfo, requestData, config, headers);

      // Warn if sending credentials over unencrypted HTTP
      if (
        config.url?.startsWith('http://') &&
        !config.url.includes('localhost') &&
        !config.url.includes('127.0.0.1') &&
        (headers['Authorization'] || config.auth || requestData.auth?.type === 'apikey')
      ) {
        webview.postMessage({
          type: 'securityWarning',
          data: { message: 'Sending credentials over unencrypted HTTP connection' },
        });
      }

      // Auto-inject cookies from cookie jar
      const cookieHeader = await this.cookieJarService.buildCookieHeader(config.url);
      if (cookieHeader && !headers['Cookie'] && !headers['cookie']) {
        headers['Cookie'] = cookieHeader;
      }

      // Build pre-request timeline events
      const now = () => Date.now();
      timeline.push({ category: 'config', text: `redirects = ${config.maxRedirects !== 0}`, timestamp: now() });
      timeline.push({ category: 'config', text: `timeout = ${config.timeout || 'Infinity'}`, timestamp: now() });

      // Request line
      let pathname = config.url || '';
      try {
        const urlObj = new URL(config.url!);
        pathname = urlObj.pathname + urlObj.search;
      } catch { /* keep full url */ }
      timeline.push({ category: 'request', text: `${(config.method || 'GET').toUpperCase()} ${pathname}`, timestamp: now() });

      // Request headers
      for (const [key, value] of Object.entries(config.headers || {})) {
        if (value !== undefined && value !== null) {
          timeline.push({ category: 'request', text: `${key}: ${value}`, timestamp: now() });
        }
      }

      timeline.push({ category: 'info', text: 'Sending request to server', timestamp: now() });

      // Build SSL options (per-request > global stored settings > defaults)
      const storedSettingsForSsl = this.ctx.extensionContext.globalState.get<Record<string, any>>('hivefetch.settings') ?? {};
      let sslOptions: { rejectUnauthorized?: boolean; cert?: Buffer; key?: Buffer; passphrase?: string } | undefined;
      if (requestData.ssl) {
        sslOptions = { rejectUnauthorized: requestData.ssl.rejectUnauthorized };
        if (requestData.ssl.certPath) {
          try { sslOptions.cert = fs.readFileSync(requestData.ssl.certPath); } catch { /* ignore missing cert */ }
        }
        if (requestData.ssl.keyPath) {
          try { sslOptions.key = fs.readFileSync(requestData.ssl.keyPath); } catch { /* ignore missing key */ }
        }
        if (requestData.ssl.passphrase) {
          sslOptions.passphrase = requestData.ssl.passphrase;
        }
      } else {
        // Fall back to global SSL settings
        const globalRejectUnauthorized = storedSettingsForSsl.sslRejectUnauthorized ?? true;
        const globalClientCert = storedSettingsForSsl.globalClientCert as any;
        sslOptions = {};
        if (!globalRejectUnauthorized) {
          sslOptions.rejectUnauthorized = false;
        }
        if (globalClientCert?.certPath) {
          try { sslOptions.cert = fs.readFileSync(globalClientCert.certPath); } catch { /* ignore missing cert */ }
        }
        if (globalClientCert?.keyPath) {
          try { sslOptions.key = fs.readFileSync(globalClientCert.keyPath); } catch { /* ignore missing key */ }
        }
        if (globalClientCert?.passphrase) {
          sslOptions.passphrase = globalClientCert.passphrase;
        }
        // Only set sslOptions if there's something meaningful
        if (sslOptions.rejectUnauthorized === undefined && !sslOptions.cert && !sslOptions.key) {
          sslOptions = undefined;
        }
      }

      // Build proxy options
      let proxyOptions: { protocol: string; host: string; port: number; username?: string; password?: string; noProxy?: string } | undefined;
      if (requestData.proxy?.enabled) {
        proxyOptions = {
          protocol: requestData.proxy.protocol || 'http',
          host: requestData.proxy.host,
          port: requestData.proxy.port,
          username: requestData.proxy.username,
          password: requestData.proxy.password,
          noProxy: requestData.proxy.noProxy,
        };
      } else {
        // Fall back to global proxy setting from stored settings
        const storedSettings = this.ctx.extensionContext.globalState.get<Record<string, any>>('hivefetch.settings') ?? {};
        const globalProxy = storedSettings.globalProxy as any;
        if (globalProxy?.enabled && globalProxy?.host) {
          proxyOptions = {
            protocol: globalProxy.protocol || 'http',
            host: globalProxy.host,
            port: globalProxy.port || 8080,
            username: globalProxy.username,
            password: globalProxy.password,
            noProxy: globalProxy.noProxy,
          };
        }
      }

      // Execute request (with download progress reporting)
      let lastProgressTime = 0;
      const onDownloadProgress = (loaded: number, total: number | null) => {
        const now = Date.now();
        if (now - lastProgressTime < 100) return; // Throttle to 100ms
        lastProgressTime = now;
        if (this.ctx.isWebviewAlive(panelId)) {
          webview.postMessage({ type: 'downloadProgress', data: { loaded, total } });
        }
      };

      const execConfig = {
        method: config.method,
        url: config.url,
        headers: config.headers,
        params: config.params,
        data: config.data,
        formData: config.formData,
        timeout: config.timeout,
        maxRedirects: config.maxRedirects,
        signal: abortController.signal,
        auth: config.auth,
        ssl: sslOptions,
        proxy: proxyOptions,
        onDownloadProgress,
      };

      let result;
      if (config._ntlmAuth) {
        result = await this.authHandler.executeNtlmRequest(config, sslOptions);
      } else if (config._digestAuth) {
        // Digest auth: send initial request, parse 401 challenge, resend with auth
        const initialResult = await executeRequest(execConfig);
        if (initialResult.status === 401 && initialResult.headers['www-authenticate']) {
          const challenge = parseDigestChallenge(initialResult.headers['www-authenticate']);
          if (challenge) {
            let uri: string;
            try {
              const urlObj = new URL(config.url);
              uri = urlObj.pathname + urlObj.search;
            } catch {
              uri = config.url;
            }
            const authHeader = computeDigestAuth({
              username: config._digestAuth.username,
              password: config._digestAuth.password,
              method: config.method,
              uri,
              challenge,
            });
            timeline.push({ category: 'info', text: 'Received digest challenge, resending with credentials', timestamp: Date.now() });
            const retryHeaders = { ...config.headers, Authorization: authHeader };
            result = await executeRequest({ ...execConfig, headers: retryHeaders });
          } else {
            result = initialResult;
          }
        } else {
          result = initialResult;
        }
      } else {
        result = await executeRequest(execConfig);
      }

      const duration = Date.now() - startTime;
      const size = calculateSize(result.data);
      const timing = result.timing;
      timing.total = duration;

      // Store Set-Cookie headers in cookie jar
      this.cookieJarService.storeFromResponse(result.headers, config.url).catch(() => {});

      // Merge network-level timeline events
      timeline.push(...result.timeline);

      // Response status line
      const httpVersion = `HTTP/${result.httpVersion}`;
      timeline.push({ category: 'response', text: `${httpVersion} ${result.status} ${result.statusText}`, timestamp: now() });

      // Response headers
      for (const [key, value] of Object.entries(result.headers || {})) {
        if (value !== undefined && value !== null) {
          timeline.push({ category: 'response', text: `${key}: ${value}`, timestamp: now() });
        }
      }

      // Data received
      timeline.push({ category: 'data', text: `${formatBytes(size)} chunk received`, timestamp: now() });

      // Detect content category
      const rawContentType = (result.headers['content-type'] || '') as string;
      const contentCategory = categorizeContentType(rawContentType);

      // Compute size breakdown
      const responseHeadersSize = calculateHeadersSize(result.headers);
      const requestHeadersSize = calculateHeadersSize(config.headers);
      const requestBodySize = config.data ? calculateSize(config.data) : 0;

      const responseData: any = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        data: (contentCategory === 'image' || contentCategory === 'pdf' || contentCategory === 'binary')
          ? (Buffer.isBuffer(result.data) ? result.data.toString('base64') : Buffer.from(result.data).toString('base64'))
          : result.data,
        duration,
        size,
        timing,
        contentCategory,
        timeline,
        httpVersion: result.httpVersion,
        remoteAddress: result.remoteAddress,
        requestHeaders: { ...config.headers } as Record<string, string>,
        requestUrl: buildFullUrl(config.url, config.params),
        sizeBreakdown: {
          responseHeadersSize,
          responseBodySize: size,
          requestHeadersSize,
          requestBodySize,
        },
      };

      // Evaluate assertions (inherited from collection/folder + request-level)
      let allAssertions = requestData.assertions || [];
      if (panelInfo?.collectionId && panelInfo?.requestId) {
        const collections = this.ctx.sidebarProvider.getCollections();
        const collection = collections.find((c: any) => c.id === panelInfo.collectionId);
        if (collection) {
          allAssertions = resolveAssertionsForRequest(collection, panelInfo.requestId);
        }
      }

      if (allAssertions.length > 0) {
        const assertionResponse = {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers as Record<string, string>,
          data: result.data,
          duration,
        };
        const { results: assertionResults, variablesToSet } = evaluateAssertions(allAssertions, assertionResponse);
        responseData.assertionResults = assertionResults;

        if (variablesToSet.length > 0 && this.ctx.isWebviewAlive(panelId)) {
          webview.postMessage({
            type: 'setVariables',
            data: variablesToSet,
          });
        }
      }

      // --- Post-response script execution ---
      await this.scriptRunner.runPostResponseScripts(webview, panelId, panelInfo, requestData, config, result, duration);

      // Tag response with auth inheritance source
      if (requestData.authInheritance === 'inherit' && panelInfo?.collectionId) {
        const collections = this.ctx.sidebarProvider.getCollections();
        const collection = collections.find((c: any) => c.id === panelInfo.collectionId);
        if (collection && panelInfo.requestId) {
          const resolved = resolveRequestWithInheritance(collection, panelInfo.requestId, 'inherit');
          if (resolved?.inheritedFrom) {
            responseData.inheritedAuthFrom = resolved.inheritedFrom;
          }
        }
      }

      // Send response to webview
      webview.postMessage({
        type: 'requestResponse',
        data: responseData,
      });

      // Send response context for request chaining
      webview.postMessage({
        type: 'storeResponseContext',
        data: {
          requestId: requestData.id || this.ctx.generateId(),
          requestName: requestData.name || undefined,
          response: responseData,
        },
      });

      // Log to history - every send, unconditionally
      // Use templateUrl (original with placeholders) for display, not the resolved URL
      const storedSettingsForHistory = this.ctx.extensionContext.globalState.get<Record<string, any>>('hivefetch.settings') ?? {};
      const saveResponseBody = storedSettingsForHistory.saveResponseBody ?? true;
      let cappedBody: string | undefined;
      let truncated = false;
      if (saveResponseBody) {
        const responseBodyStr = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
        ({ body: cappedBody, truncated } = HistoryStorageService.capResponseBody(responseBodyStr));
      }
      this.ctx.sidebarProvider.logHistory({
        id: this.ctx.generateId(),
        timestamp: new Date().toISOString(),
        method: requestData.method || 'GET',
        url: requestData.templateUrl || requestData.url,
        headers: requestData.headers || [],
        params: requestData.params || [],
        pathParams: requestData.pathParams || [],
        body: requestData.body,
        auth: requestData.auth,
        responseStatus: result.status,
        responseHeaders: result.headers,
        responseBody: cappedBody,
        bodyTruncated: truncated,
        responseDuration: duration,
        responseSize: size,
        workspaceName: vscode.workspace.name,
        collectionId: panelInfo?.collectionId || undefined,
        collectionName: panelInfo?.collectionId ? this.ctx.getCollectionName(panelInfo.collectionId) : undefined,
        requestId: panelInfo?.requestId || undefined,
        requestName: panelInfo?.requestName || requestData.name || undefined,
      }).catch(err => console.error('[HiveFetch] History log failed:', err));

      // Only add to Drafts for unsaved requests or requests already in Drafts
      const panelCollectionId = panelInfo?.collectionId;
      if (!panelCollectionId || panelCollectionId === '__drafts__') {
        await this.ctx.sidebarProvider.addToDraftsCollection(
          {
            method: requestData.method,
            url: requestData.templateUrl || requestData.url,
            params: requestData.params || [],
            pathParams: requestData.pathParams || [],
            headers: requestData.headers || [],
            auth: requestData.auth || { type: 'none' },
            body: requestData.body || { type: 'none', content: '' },
            connectionMode: panelInfo?.connectionMode as ConnectionMode | undefined,
          },
          {
            status: result.status,
            duration,
            size,
          }
        );
      } else if (panelInfo?.requestId) {
        await this.ctx.sidebarProvider.updateRequestResponse(
          panelInfo.requestId,
          panelCollectionId,
          result.status,
          duration,
          requestData.templateUrl || requestData.url,
          requestData.method
        );
      }
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        webview.postMessage({ type: 'requestCancelled' });
        return false;
      }

      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message || '';
      const errorData: any = {
        status: 0,
        statusText: 'Error',
        headers: {},
        data: errorMessage,
        duration,
        size: 0,
        error: true,
        errorInfo: categorizeError(errorMessage),
        timeline,
      };

      webview.postMessage({
        type: 'requestResponse',
        data: errorData,
      });

      // Log failed request to history - use templateUrl for display
      this.ctx.sidebarProvider.logHistory({
        id: this.ctx.generateId(),
        timestamp: new Date().toISOString(),
        method: requestData.method || 'GET',
        url: requestData.templateUrl || requestData.url,
        headers: requestData.headers || [],
        params: requestData.params || [],
        pathParams: requestData.pathParams || [],
        body: requestData.body,
        auth: requestData.auth,
        responseStatus: 0,
        responseBody: errorMessage,
        responseDuration: duration,
        responseSize: 0,
        workspaceName: vscode.workspace.name,
        collectionId: panelInfo?.collectionId || undefined,
        collectionName: panelInfo?.collectionId ? this.ctx.getCollectionName(panelInfo.collectionId) : undefined,
        requestId: panelInfo?.requestId || undefined,
        requestName: panelInfo?.requestName || requestData.name || undefined,
      }).catch(err => console.error('[HiveFetch] History log failed:', err));

      if (panelInfo?.requestId && panelInfo?.collectionId && panelInfo.collectionId !== '__drafts__') {
        await this.ctx.sidebarProvider.updateRequestResponse(
          panelInfo.requestId,
          panelInfo.collectionId,
          0,
          duration,
          requestData.templateUrl || requestData.url,
          requestData.method
        );
      }
      return true;
    } finally {
      const info = this.ctx.panels.get(panelId);
      if (info && info.abortController === abortController) {
        info.abortController = null;
      }
    }
  }

  handleCancelRequest(panelId: string): void {
    const panelInfo = this.ctx.panels.get(panelId);
    if (panelInfo?.abortController) {
      panelInfo.abortController.abort();
      panelInfo.abortController = null;
    }
  }
}

// --- Utility functions (stateless) ---

export function categorizeContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return 'json';
  if (ct.includes('image/')) return 'image';
  if (ct.includes('text/html')) return 'html';
  if (ct.includes('application/pdf')) return 'pdf';
  if (ct.includes('text/xml') || ct.includes('application/xml') || ct.includes('+xml')) return 'xml';
  if (ct.includes('text/')) return 'text';
  if (ct.includes('audio/') || ct.includes('video/')) return 'binary';
  if (ct.includes('application/octet-stream') || ct.includes('application/zip') || ct.includes('application/gzip')) return 'binary';
  return 'text';
}

export function calculateHeadersSize(headers: Record<string, any>): number {
  let size = 0;
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) {
      // "Key: Value\r\n" format
      size += Buffer.byteLength(`${key}: ${value}\r\n`, 'utf8');
    }
  }
  return size;
}

export function calculateSize(data: any): number {
  if (Buffer.isBuffer(data)) {
    return data.length;
  }
  if (typeof data === 'string') {
    return Buffer.byteLength(data, 'utf8');
  }
  return Buffer.byteLength(JSON.stringify(data), 'utf8');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function categorizeError(errorMessage: string, statusCode?: number): {
  category: string;
  message: string;
  suggestion: string;
} {
  const lowerMessage = errorMessage.toLowerCase();

  if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout') || lowerMessage.includes('timed out')) {
    return {
      category: 'timeout',
      message: 'Request timed out',
      suggestion: 'The server took too long to respond. Try increasing the timeout or check if the server is under heavy load.',
    };
  }

  if (lowerMessage.includes('enotfound') || lowerMessage.includes('getaddrinfo') || lowerMessage.includes('dns')) {
    return {
      category: 'dns',
      message: 'Could not resolve hostname',
      suggestion: 'Check if the URL is correct. The domain name could not be resolved to an IP address.',
    };
  }

  if (lowerMessage.includes('ssl') || lowerMessage.includes('certificate') || lowerMessage.includes('cert') ||
      lowerMessage.includes('self signed') || lowerMessage.includes('unable to verify')) {
    return {
      category: 'ssl',
      message: 'SSL/TLS certificate error',
      suggestion: 'The server has an invalid or self-signed certificate. For development, you may need to configure certificate trust.',
    };
  }

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

  if (lowerMessage.includes('network') || lowerMessage.includes('socket') || lowerMessage.includes('epipe')) {
    return {
      category: 'network',
      message: 'Network error',
      suggestion: 'A network error occurred. Check your internet connection and firewall settings.',
    };
  }

  if (statusCode && statusCode >= 500) {
    return {
      category: 'server',
      message: `Server error (${statusCode})`,
      suggestion: 'The server encountered an error. This is typically a server-side issue that needs to be fixed by the API provider.',
    };
  }

  return {
    category: 'unknown',
    message: errorMessage || 'An unknown error occurred',
    suggestion: 'An unexpected error occurred. Check the error details for more information.',
  };
}
