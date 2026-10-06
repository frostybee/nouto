/**
 * Stands in for the VS Code extension host: answers the request panel's
 * startup handshake and replies to sendRequest with a canned response.
 * Message shapes mirror packages/vscode/src/providers/RequestPanelManager.ts
 * ('ready' handler) and providers/panel/RequestExecutor.ts ('requestResponse').
 */

export interface SceneResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  /** Total time shown in the status line, in ms. */
  duration: number;
  httpVersion?: string;
}

export interface Scene {
  /** Delay before the response arrives, so the loading state is visible. */
  responseDelayMs: number;
  response: SceneResponse;
}

type Message = { type: string; data?: any };

function post(type: string, data?: unknown): void {
  window.postMessage({ type, data }, '*');
}

function newRequest() {
  const now = new Date().toISOString();
  return {
    id: 'req-1',
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [{ id: 'h-1', key: 'User-Agent', value: 'Nouto', enabled: true }],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: now,
    updatedAt: now,
    _panelId: 'p1',
    _connectionMode: 'http',
  };
}

function buildResponse(scene: Scene, sent: any) {
  const { response } = scene;
  const text = JSON.stringify(response.body);
  const bodySize = new TextEncoder().encode(text).length;
  const headerText = Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
  const total = response.duration;
  const timing = {
    dnsLookup: Math.round(total * 0.08),
    tcpConnection: Math.round(total * 0.12),
    tlsHandshake: Math.round(total * 0.2),
    ttfb: Math.round(total * 0.5),
    contentTransfer: Math.round(total * 0.1),
    total,
  };
  const start = Date.now() - total;
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    data: response.body,
    duration: total,
    size: bodySize,
    timing,
    contentCategory: 'json',
    httpVersion: response.httpVersion ?? '2.0',
    remoteAddress: '104.21.32.1',
    requestUrl: sent?.url ?? '',
    requestHeaders: { 'User-Agent': 'Nouto', Accept: '*/*' },
    sizeBreakdown: {
      responseHeadersSize: headerText.length,
      responseBodySize: bodySize,
      requestHeadersSize: 64,
      requestBodySize: 0,
    },
    timeline: [
      { category: 'info', text: `Preparing request to ${sent?.url ?? ''}`, timestamp: start },
      { category: 'request', text: `${sent?.method ?? 'GET'} ${sent?.url ?? ''}`, timestamp: start + timing.dnsLookup },
      { category: 'response', text: `HTTP/${response.httpVersion ?? '2.0'} ${response.status} ${response.statusText}`, timestamp: start + total - timing.contentTransfer },
    ],
  };
}

export function createFakeHost(scene: Scene) {
  return {
    receive(message: Message): void {
      switch (message.type) {
        case 'ready':
          post('loadRequest', newRequest());
          post('loadEnvironments', { environments: [], activeId: null, globalVariables: [] });
          post('loadSettings', {});
          break;
        case 'getCollections':
          post('collections', []);
          break;
        case 'sendRequest':
          setTimeout(() => post('requestResponse', buildResponse(scene, message.data)), scene.responseDelayMs);
          break;
        default:
          // Drafts, dirty state, and other host notifications need no reply.
          break;
      }
    },
  };
}
