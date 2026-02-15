import * as http from 'http';
import * as https from 'https';
import * as http2 from 'http2';
import * as tls from 'tls';
import * as zlib from 'zlib';
import { URL } from 'url';
import type { TimingData, TimelineEvent } from './TimingInterceptor';

export interface HttpRequestConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  data?: any;
  formData?: any; // form-data instance for multipart file uploads
  timeout: number;
  signal: AbortSignal;
  auth?: { username: string; password: string };
  maxRedirects?: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  httpVersion: string;
  timing: TimingData;
  timeline: TimelineEvent[];
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
  304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
  409: 'Conflict', 410: 'Gone', 422: 'Unprocessable Entity',
  429: 'Too Many Requests', 500: 'Internal Server Error',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

function buildRequestUrl(baseUrl: string, params: Record<string, string>): URL {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (key) {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

function serializeBody(data: any): Buffer | undefined {
  if (data === undefined || data === null) { return undefined; }
  if (Buffer.isBuffer(data)) { return data; }
  if (typeof data === 'string') { return Buffer.from(data, 'utf8'); }
  return Buffer.from(JSON.stringify(data), 'utf8');
}

function decompressBody(buf: Buffer, encoding: string | undefined): Buffer {
  if (!encoding) { return buf; }
  const enc = encoding.toLowerCase();
  if (enc === 'gzip') { return zlib.gunzipSync(buf); }
  if (enc === 'deflate') { return zlib.inflateSync(buf); }
  if (enc === 'br') { return zlib.brotliDecompressSync(buf); }
  return buf;
}

function parseResponseBody(buf: Buffer, contentType: string | undefined): any {
  const text = buf.toString('utf8');
  if (contentType && (contentType.includes('application/json') || contentType.includes('+json'))) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

function flattenHeaders(rawHeaders: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (k.startsWith(':')) { continue; }
    if (v === undefined) { continue; }
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

// ---------- HTTP/2 path ----------

function executeHttp2(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  timeout: number,
  signal: AbortSignal,
  timestamps: { start: number; dnsEnd: number; tcpEnd: number; tlsEnd: number; firstByte: number; end: number },
  timeline: TimelineEvent[],
): Promise<{ status: number; headers: Record<string, string>; body: Buffer; httpVersion: string }> {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname;
    const port = parseInt(url.port, 10) || 443;

    timestamps.start = Date.now();

    const socket = tls.connect(port, hostname, {
      ALPNProtocols: ['h2', 'http/1.1'],
      servername: hostname,
    });

    socket.once('lookup', (_err: Error | null, address: string) => {
      timestamps.dnsEnd = Date.now();
      const ms = timestamps.dnsEnd - timestamps.start;
      timeline.push({ category: 'dns', text: `${hostname} \u2192 ${address || 'unknown'} (${ms}ms)`, timestamp: timestamps.dnsEnd });
    });

    socket.once('connect', () => {
      if (!timestamps.dnsEnd) { timestamps.dnsEnd = timestamps.start; }
      timestamps.tcpEnd = Date.now();
      const ms = timestamps.tcpEnd - (timestamps.dnsEnd || timestamps.start);
      timeline.push({ category: 'connection', text: `TCP connection established (${ms}ms)`, timestamp: timestamps.tcpEnd });
    });

    socket.once('error', (err) => {
      reject(err);
    });

    if (signal.aborted) {
      socket.destroy();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const onAbort = () => {
      socket.destroy();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    socket.once('secureConnect', () => {
      timestamps.tlsEnd = Date.now();
      const ms = timestamps.tlsEnd - timestamps.tcpEnd;
      timeline.push({ category: 'tls', text: `TLS handshake complete (${ms}ms)`, timestamp: timestamps.tlsEnd });

      const negotiated = socket.alpnProtocol;

      if (negotiated === 'h2') {
        // HTTP/2 path
        const session = http2.connect(url.origin, {
          createConnection: () => socket as any,
        });

        session.once('error', (err) => {
          signal.removeEventListener('abort', onAbort);
          session.close();
          reject(err);
        });

        const h2Headers: Record<string, string> = {
          [http2.constants.HTTP2_HEADER_METHOD]: method.toUpperCase(),
          [http2.constants.HTTP2_HEADER_PATH]: url.pathname + url.search,
          ...headers,
        };

        const stream = session.request(h2Headers);
        stream.setTimeout(timeout);

        if (body && body.length > 0) {
          stream.end(body);
        } else {
          stream.end();
        }

        const chunks: Buffer[] = [];
        let responseStatus = 0;
        let responseHeaders: Record<string, string> = {};

        stream.on('response', (hdrs) => {
          timestamps.firstByte = Date.now();
          responseStatus = hdrs[':status'] as number || 0;
          responseHeaders = flattenHeaders(hdrs as Record<string, string | string[] | undefined>);
        });

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on('end', () => {
          timestamps.end = Date.now();
          signal.removeEventListener('abort', onAbort);
          session.close();
          resolve({
            status: responseStatus,
            headers: responseHeaders,
            body: Buffer.concat(chunks),
            httpVersion: '2.0',
          });
        });

        stream.on('error', (err) => {
          signal.removeEventListener('abort', onAbort);
          session.close();
          reject(err);
        });

        // Wire abort to HTTP/2 stream
        signal.removeEventListener('abort', onAbort);
        const onAbortH2 = () => {
          stream.close(http2.constants.NGHTTP2_CANCEL);
          session.close();
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        signal.addEventListener('abort', onAbortH2, { once: true });

        stream.once('timeout', () => {
          signal.removeEventListener('abort', onAbortH2);
          stream.close(http2.constants.NGHTTP2_CANCEL);
          session.close();
          reject(new Error('timeout of ' + timeout + 'ms exceeded'));
        });

        stream.once('end', () => signal.removeEventListener('abort', onAbortH2));
        stream.once('error', () => signal.removeEventListener('abort', onAbortH2));
      } else {
        // ALPN negotiated HTTP/1.1 — fall back
        signal.removeEventListener('abort', onAbort);
        socket.destroy();
        reject(new Error('__FALLBACK_HTTP11__'));
      }
    });
  });
}

// ---------- HTTP/1.1 path ----------

function executeHttp1(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  timeout: number,
  signal: AbortSignal,
  timestamps: { start: number; dnsEnd: number; tcpEnd: number; tlsEnd: number; firstByte: number; end: number },
  timeline: TimelineEvent[],
): Promise<{ status: number; headers: Record<string, string>; body: Buffer; httpVersion: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;

    timestamps.start = Date.now();

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers,
      timeout,
    };

    const req = requestFn(options, (res) => {
      timestamps.firstByte = Date.now();

      const statusCode = res.statusCode || 0;
      const resHeaders = flattenHeaders(res.headers as Record<string, string | string[] | undefined>);
      const httpVersion = res.httpVersion || '1.1';

      // Response line
      timeline.push({ category: 'response', text: `HTTP/${httpVersion} ${statusCode} ${res.statusMessage || ''}`, timestamp: Date.now() });

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        timestamps.end = Date.now();
        resolve({
          status: statusCode,
          headers: resHeaders,
          body: Buffer.concat(chunks),
          httpVersion,
        });
      });
      res.on('error', reject);
    });

    // Socket-level timing
    req.once('socket', (socket: any) => {
      if (socket.connecting) {
        socket.once('lookup', (_err: Error | null, address: string) => {
          timestamps.dnsEnd = Date.now();
          const ms = timestamps.dnsEnd - timestamps.start;
          timeline.push({ category: 'dns', text: `${url.hostname} \u2192 ${address || 'unknown'} (${ms}ms)`, timestamp: timestamps.dnsEnd });
        });
        socket.once('connect', () => {
          if (!timestamps.dnsEnd) { timestamps.dnsEnd = timestamps.start; }
          timestamps.tcpEnd = Date.now();
          const ms = timestamps.tcpEnd - (timestamps.dnsEnd || timestamps.start);
          timeline.push({ category: 'connection', text: `TCP connection established (${ms}ms)`, timestamp: timestamps.tcpEnd });
        });
        socket.once('secureConnect', () => {
          timestamps.tlsEnd = Date.now();
          const ms = timestamps.tlsEnd - timestamps.tcpEnd;
          timeline.push({ category: 'tls', text: `TLS handshake complete (${ms}ms)`, timestamp: timestamps.tlsEnd });
        });
      } else {
        timestamps.dnsEnd = timestamps.start;
        timestamps.tcpEnd = timestamps.start;
        if (socket.encrypted) { timestamps.tlsEnd = timestamps.start; }
        timeline.push({ category: 'info', text: 'Reusing existing connection', timestamp: timestamps.start });
      }
    });

    req.on('error', reject);

    req.on('timeout', () => {
      req.destroy(new Error('timeout of ' + timeout + 'ms exceeded'));
    });

    // Abort handling
    if (signal.aborted) {
      req.destroy();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const onAbort = () => {
      req.destroy();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    req.once('close', () => signal.removeEventListener('abort', onAbort));

    if (body && body.length > 0) {
      req.end(body);
    } else {
      req.end();
    }
  });
}

// ---------- Public API ----------

export async function executeRequest(config: HttpRequestConfig): Promise<HttpResponse> {
  const url = buildRequestUrl(config.url, config.params);
  const method = config.method.toUpperCase();
  const headers = { ...config.headers };
  const maxRedirects = config.maxRedirects ?? 5;

  // Basic auth → Authorization header
  if (config.auth) {
    const encoded = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  }

  let body: Buffer | undefined;
  if (config.formData && typeof config.formData.getBuffer === 'function') {
    // form-data package: get Buffer and let its headers through
    body = config.formData.getBuffer();
  } else {
    body = serializeBody(config.data);
  }
  if (body && !headers['content-length'] && !headers['Content-Length']) {
    headers['Content-Length'] = String(body.length);
  }

  const timestamps = { start: 0, dnsEnd: 0, tcpEnd: 0, tlsEnd: 0, firstByte: 0, end: 0 };
  const timeline: TimelineEvent[] = [];

  let currentUrl = url;
  let currentMethod = method;
  let currentBody = body;
  let redirectCount = 0;
  let result: { status: number; headers: Record<string, string>; body: Buffer; httpVersion: string };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const isHttps = currentUrl.protocol === 'https:';

    if (isHttps) {
      try {
        result = await executeHttp2(currentUrl, currentMethod, headers, currentBody, config.timeout, config.signal, timestamps, timeline);
      } catch (err: any) {
        if (err.message === '__FALLBACK_HTTP11__') {
          // ALPN negotiated HTTP/1.1, retry with HTTP/1.1 client
          result = await executeHttp1(currentUrl, currentMethod, headers, currentBody, config.timeout, config.signal, timestamps, timeline);
        } else {
          throw err;
        }
      }
    } else {
      result = await executeHttp1(currentUrl, currentMethod, headers, currentBody, config.timeout, config.signal, timestamps, timeline);
    }

    // Handle redirects
    if (result.status >= 300 && result.status < 400 && result.headers['location'] && redirectCount < maxRedirects) {
      const location = result.headers['location'];
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, currentUrl);
      } catch {
        timeline.push({ category: 'warning', text: `Invalid redirect Location header: ${location}`, timestamp: Date.now() });
        break;
      }
      currentUrl = redirectUrl;
      redirectCount++;
      timeline.push({ category: 'info', text: `Redirect ${result.status} \u2192 ${currentUrl.href}`, timestamp: Date.now() });

      // 303 always becomes GET, 301/302 change to GET for non-GET/HEAD
      if (result.status === 303 || ((result.status === 301 || result.status === 302) && currentMethod !== 'GET' && currentMethod !== 'HEAD')) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      continue;
    }

    break;
  }

  // Decompress body
  const contentEncoding = result.headers['content-encoding'];
  let rawBody = result.body;
  try {
    rawBody = decompressBody(rawBody, contentEncoding);
  } catch {
    // If decompression fails, use the raw body
  }

  // Parse body
  const contentType = result.headers['content-type'];
  const parsedData = parseResponseBody(rawBody, contentType);

  // Compute timing
  const start = timestamps.start || Date.now();
  const dnsEnd = timestamps.dnsEnd || start;
  const tcpEnd = timestamps.tcpEnd || dnsEnd;
  const tlsEnd = timestamps.tlsEnd || tcpEnd;
  const firstByte = timestamps.firstByte || tlsEnd;
  const end = timestamps.end || Date.now();

  const timing: TimingData = {
    dnsLookup: Math.max(0, dnsEnd - start),
    tcpConnection: Math.max(0, tcpEnd - dnsEnd),
    tlsHandshake: Math.max(0, tlsEnd - tcpEnd),
    ttfb: Math.max(0, firstByte - (tlsEnd || tcpEnd)),
    contentTransfer: Math.max(0, end - firstByte),
    total: Math.max(0, end - start),
  };

  return {
    status: result.status,
    statusText: HTTP_STATUS_TEXT[result.status] || '',
    headers: result.headers,
    data: parsedData,
    httpVersion: result.httpVersion,
    timing,
    timeline,
  };
}
