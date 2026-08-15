import { executeRequest } from '@nouto/core/services';
import type { HttpRequestConfig, HttpResponse } from '@nouto/core/services';
import type { ProxyHttpRequest, ProxyHttpResponse } from '@nouto/transport';

const PROXY_TIMEOUT_MS = 30000;

/** Headers the renderer may send that the host client manages itself or must not forward. */
const PROXY_DROP_HEADERS = new Set(['host', 'content-length', 'connection']);

/** What the proxy needs from the preview panel entry that owns the request. */
export interface ProxyHost {
  /** Posts to the panel's webview; must no-op once the panel is disposed. */
  post(message: unknown): void;
  /** In-flight requests keyed by requestId, for cancellation. */
  controllers: Map<string, AbortController>;
  tryItEnabled(): boolean;
}

/**
 * Executes a renderer "Try it out" request on behalf of the sandboxed frame.
 *
 * The frame cannot reach the network (`connect-src 'none'`), so its shimmed
 * `window.fetch` forwards each request here; it runs through the shared Node
 * HTTP client (no browser CORS) and the response is posted back. The result
 * is addressed only by `requestId` and never retargets anything, so a renderer
 * cannot use this to reach beyond what its own fetch call requested.
 */
export async function runProxyRequest(
  host: ProxyHost,
  requestId: string,
  request: ProxyHttpRequest
): Promise<void> {
  if (!host.tryItEnabled()) {
    host.post({ type: 'openApiProxyResponse', data: { requestId, error: 'Try It is disabled.' } });
    return;
  }

  const controller = new AbortController();
  host.controllers.set(requestId, controller);
  try {
    const config: HttpRequestConfig = {
      method: (request.method || 'GET').toUpperCase(),
      url: request.url,
      headers: sanitizeProxyHeaders(request.headers),
      params: {},
      data: request.body,
      timeout: PROXY_TIMEOUT_MS,
      signal: controller.signal,
    };
    const result = await executeRequest(config);
    host.post({
      type: 'openApiProxyResponse',
      data: { requestId, response: serializeProxyResponse(result, request.url) },
    });
  } catch (error) {
    // AbortError included: the frame that issued it is gone, so a best-effort
    // error post is harmless (dropped by the disposed guard or channel mismatch).
    host.post({
      type: 'openApiProxyResponse',
      data: { requestId, error: error instanceof Error ? error.message : String(error) },
    });
  } finally {
    host.controllers.delete(requestId);
  }
}

/** Drops headers the host HTTP client sets itself or must not forward verbatim. */
function sanitizeProxyHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    if (!key || PROXY_DROP_HEADERS.has(key.toLowerCase())) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * Serializes an {@link HttpResponse} for postMessage. Binary bodies arrive as a
 * Buffer (not structured-clone-safe) and are base64-encoded, mirroring the main
 * request panel's convention; text/JSON bodies travel as UTF-8.
 */
function serializeProxyResponse(result: HttpResponse, requestUrl: string): ProxyHttpResponse {
  let body: string;
  let bodyEncoding: 'utf8' | 'base64';
  const data = result.data;
  if (Buffer.isBuffer(data)) {
    body = data.toString('base64');
    bodyEncoding = 'base64';
  } else if (data == null) {
    body = '';
    bodyEncoding = 'utf8';
  } else if (typeof data === 'string') {
    body = data;
    bodyEncoding = 'utf8';
  } else {
    body = JSON.stringify(data);
    bodyEncoding = 'utf8';
  }
  return {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
    body,
    bodyEncoding,
    url: requestUrl,
  };
}
