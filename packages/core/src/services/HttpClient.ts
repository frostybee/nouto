import * as http from 'http';
import * as https from 'https';
import * as http2 from 'http2';
import * as tls from 'tls';
import * as zlib from 'zlib';
import { URL } from 'url';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { TimingData, TimelineEvent } from '../types';

export interface HttpRequestConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  data?: any;
  formData?: any; // form-data instance for multipart file uploads
  timeout: number;
  signal?: AbortSignal;
  auth?: { username: string; password: string };
  maxRedirects?: number;
  ssl?: { rejectUnauthorized?: boolean; cert?: Buffer; key?: Buffer; passphrase?: string };
  proxy?: { protocol: string; host: string; port: number; username?: string; password?: string; noProxy?: string };
  onDownloadProgress?: (loaded: number, total: number | null) => void;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  httpVersion: string;
  remoteAddress?: string;
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

async function decompressBody(buf: Buffer, encoding: string | undefined): Promise<Buffer> {
  if (!encoding) { return buf; }
  const enc = encoding.toLowerCase();
  if (enc === 'gzip') {
    return new Promise((resolve, reject) => zlib.gunzip(buf, (err, result) => err ? reject(err) : resolve(result)));
  }
  if (enc === 'deflate') {
    // Try zlib-wrapped deflate first; fall back to raw deflate (many servers send raw despite the spec)
    return new Promise((resolve, reject) =>
      zlib.inflate(buf, (err, result) =>
        err ? zlib.inflateRaw(buf, (err2, result2) => err2 ? reject(err2) : resolve(result2))
            : resolve(result)
      )
    );
  }
  if (enc === 'br') {
    return new Promise((resolve, reject) => zlib.brotliDecompress(buf, (err, result) => err ? reject(err) : resolve(result)));
  }
  return buf;
}

// ---------- Proxy helpers ----------

type ProxyOptions = NonNullable<HttpRequestConfig['proxy']>;

export function shouldBypassProxy(hostname: string, noProxy?: string): boolean {
  if (!noProxy) return false;
  const entries = noProxy.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const host = hostname.toLowerCase();
  for (const entry of entries) {
    if (entry === '*') return true;
    // Exact match or suffix match (e.g., .example.com matches sub.example.com)
    if (host === entry || host.endsWith('.' + entry) || entry.startsWith('.') && host.endsWith(entry)) return true;
  }
  return false;
}

export function buildProxyUrl(proxy: ProxyOptions): string {
  const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@` : '';
  return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
}

export function buildProxyAgent(proxyUrl: string, isTargetHttps: boolean): http.Agent | https.Agent {
  const url = new URL(proxyUrl);
  if (url.protocol === 'socks5:') {
    return new SocksProxyAgent(proxyUrl);
  }
  return isTargetHttps ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
}

function parseResponseBody(buf: Buffer, contentType: string | undefined): any {
  // Return raw Buffer for binary content types to avoid UTF-8 corruption
  if (contentType && (
    contentType.includes('image/') ||
    contentType.includes('application/pdf') ||
    contentType.includes('audio/') ||
    contentType.includes('video/') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/zip') ||
    contentType.includes('application/gzip')
  )) {
    return buf;
  }
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
  ssl?: { rejectUnauthorized?: boolean; cert?: Buffer; key?: Buffer; passphrase?: string },
  onDownloadProgress?: (loaded: number, total: number | null) => void,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer; httpVersion: string; remoteAddress?: string }> {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname;
    const port = parseInt(url.port, 10) || 443;
    let remoteAddress: string | undefined;

    timestamps.start = Date.now();

    const socket = tls.connect(port, hostname, {
      ALPNProtocols: ['h2', 'http/1.1'],
      servername: hostname,
      rejectUnauthorized: ssl?.rejectUnauthorized ?? true,
      cert: ssl?.cert,
      key: ssl?.key,
      passphrase: ssl?.passphrase,
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
      const ms = timestamps.tlsEnd - (timestamps.tcpEnd || timestamps.start);
      timeline.push({ category: 'tls', text: `TLS handshake complete (${ms}ms)`, timestamp: timestamps.tlsEnd });

      // Capture remote address from socket
      if (socket.remoteAddress) {
        remoteAddress = socket.remotePort ? `${socket.remoteAddress}:${socket.remotePort}` : socket.remoteAddress;
      }

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
        let h2BytesLoaded = 0;

        stream.on('response', (hdrs) => {
          timestamps.firstByte = Date.now();
          responseStatus = hdrs[':status'] as number || 0;
          responseHeaders = flattenHeaders(hdrs as Record<string, string | string[] | undefined>);
        });

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          if (onDownloadProgress) {
            h2BytesLoaded += chunk.length;
            const cl = responseHeaders['content-length'];
            const total = cl ? parseInt(cl, 10) : null;
            onDownloadProgress(h2BytesLoaded, total && !isNaN(total) ? total : null);
          }
        });

        // Wire abort to HTTP/2 stream (replace socket-level handler)
        signal.removeEventListener('abort', onAbort);
        const onAbortH2 = () => {
          stream.close(http2.constants.NGHTTP2_CANCEL);
          session.close();
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        signal.addEventListener('abort', onAbortH2, { once: true });

        stream.on('end', () => {
          timestamps.end = Date.now();
          signal.removeEventListener('abort', onAbortH2);
          session.close();
          resolve({
            status: responseStatus,
            headers: responseHeaders,
            body: Buffer.concat(chunks),
            httpVersion: '2.0',
            remoteAddress,
          });
        });

        stream.on('error', (err) => {
          signal.removeEventListener('abort', onAbortH2);
          session.close();
          reject(err);
        });

        stream.once('timeout', () => {
          signal.removeEventListener('abort', onAbortH2);
          stream.close(http2.constants.NGHTTP2_CANCEL);
          session.close();
          reject(new Error('timeout of ' + timeout + 'ms exceeded'));
        });
      } else {
        // ALPN negotiated HTTP/1.1 - fall back
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
  ssl?: { rejectUnauthorized?: boolean; cert?: Buffer; key?: Buffer; passphrase?: string },
  onDownloadProgress?: (loaded: number, total: number | null) => void,
  proxyAgent?: http.Agent | https.Agent,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer; httpVersion: string; remoteAddress?: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;
    let remoteAddress: string | undefined;

    timestamps.start = Date.now();

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers,
      timeout,
      ...(isHttps && ssl ? {
        rejectUnauthorized: ssl.rejectUnauthorized ?? true,
        cert: ssl.cert,
        key: ssl.key,
        passphrase: ssl.passphrase,
      } : {}),
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    };

    const req = requestFn(options, (res) => {
      timestamps.firstByte = Date.now();

      const statusCode = res.statusCode || 0;
      const resHeaders = flattenHeaders(res.headers as Record<string, string | string[] | undefined>);
      const httpVersion = res.httpVersion || '1.1';

      // Response line
      timeline.push({ category: 'response', text: `HTTP/${httpVersion} ${statusCode} ${res.statusMessage || ''}`, timestamp: Date.now() });

      const chunks: Buffer[] = [];
      let h1BytesLoaded = 0;
      const h1ContentLength = resHeaders['content-length'];
      const h1Total = h1ContentLength ? parseInt(h1ContentLength, 10) : null;
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        if (onDownloadProgress) {
          h1BytesLoaded += chunk.length;
          onDownloadProgress(h1BytesLoaded, h1Total && !isNaN(h1Total) ? h1Total : null);
        }
      });
      res.on('end', () => {
        timestamps.end = Date.now();
        resolve({
          status: statusCode,
          headers: resHeaders,
          body: Buffer.concat(chunks),
          httpVersion,
          remoteAddress,
        });
      });
      res.on('error', reject);
    });

    // Socket-level timing
    req.once('socket', (socket: any) => {
      // Capture remote address once connected
      const captureRemote = () => {
        if (socket.remoteAddress) {
          remoteAddress = socket.remotePort ? `${socket.remoteAddress}:${socket.remotePort}` : socket.remoteAddress;
        }
      };
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
          captureRemote();
        });
        socket.once('secureConnect', () => {
          timestamps.tlsEnd = Date.now();
          const ms = timestamps.tlsEnd - timestamps.tcpEnd;
          timeline.push({ category: 'tls', text: `TLS handshake complete (${ms}ms)`, timestamp: timestamps.tlsEnd });
          captureRemote();
        });
      } else {
        timestamps.dnsEnd = timestamps.start;
        timestamps.tcpEnd = timestamps.start;
        if (socket.encrypted) { timestamps.tlsEnd = timestamps.start; }
        captureRemote();
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

  // Set default User-Agent if not provided by the user
  const hasUserAgent = Object.keys(headers).some(k => k.toLowerCase() === 'user-agent');
  if (!hasUserAgent) {
    headers['User-Agent'] = 'Nouto';
  }

  // Default to a never-aborting signal if none provided
  const signal: AbortSignal = config.signal ?? new AbortController().signal;

  // Basic auth → Authorization header
  if (config.auth) {
    const encoded = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  }

  let body: Buffer | undefined;
  if (config.formData && typeof config.formData.getBuffer === 'function') {
    // form-data package: get Buffer and merge multipart boundary headers
    body = config.formData.getBuffer();
    const formHeaders = config.formData.getHeaders();
    for (const [key, value] of Object.entries(formHeaders)) {
      if (!headers[key]) { headers[key] = value as string; }
    }
  } else {
    body = serializeBody(config.data);
  }
  if (body && !headers['content-length'] && !headers['Content-Length']) {
    headers['Content-Length'] = String(body.length);
  }

  const timestamps = { start: 0, dnsEnd: 0, tcpEnd: 0, tlsEnd: 0, firstByte: 0, end: 0 };
  const timeline: TimelineEvent[] = [];

  // Build proxy agent if configured and target is not bypassed
  const useProxy = config.proxy && !shouldBypassProxy(url.hostname, config.proxy.noProxy);
  let proxyAgent: http.Agent | https.Agent | undefined;
  if (useProxy && config.proxy) {
    const proxyUrl = buildProxyUrl(config.proxy);
    proxyAgent = buildProxyAgent(proxyUrl, url.protocol === 'https:');
    timeline.push({ category: 'info', text: `Using ${config.proxy.protocol} proxy ${config.proxy.host}:${config.proxy.port}`, timestamp: Date.now() });
  }

  let currentUrl = url;
  let currentMethod = method;
  let currentBody = body;
  let redirectCount = 0;
  let result: { status: number; headers: Record<string, string>; body: Buffer; httpVersion: string; remoteAddress?: string };

  // Accumulate Set-Cookie headers from intermediate redirect responses
  const redirectSetCookies: string[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const isHttps = currentUrl.protocol === 'https:';

    if (isHttps && !proxyAgent) {
      // HTTP/2 only when no proxy (proxy agents work with HTTP/1.1)
      try {
        result = await executeHttp2(currentUrl, currentMethod, headers, currentBody, config.timeout, signal, timestamps, timeline, config.ssl, config.onDownloadProgress);
      } catch (err: any) {
        if (err.message === '__FALLBACK_HTTP11__') {
          result = await executeHttp1(currentUrl, currentMethod, headers, currentBody, config.timeout, signal, timestamps, timeline, config.ssl, config.onDownloadProgress);
        } else {
          throw err;
        }
      }
    } else {
      result = await executeHttp1(currentUrl, currentMethod, headers, currentBody, config.timeout, signal, timestamps, timeline, config.ssl, config.onDownloadProgress, proxyAgent);
    }

    // Handle redirects
    if (result.status >= 300 && result.status < 400 && result.headers['location'] && redirectCount < maxRedirects) {
      // Capture Set-Cookie headers from redirect responses before following
      if (result.headers['set-cookie']) {
        redirectSetCookies.push(result.headers['set-cookie']);
      }

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

    // If we're here with a redirect status, the limit was exceeded; return the last redirect response as-is
    break;
  }

  // Merge Set-Cookie headers from redirect responses into the final result
  if (redirectSetCookies.length > 0) {
    const finalSetCookie = result.headers['set-cookie'];
    if (finalSetCookie) {
      redirectSetCookies.push(finalSetCookie);
    }
    result.headers['set-cookie'] = redirectSetCookies.join('\n');
  }

  // Decompress body
  const contentEncoding = result.headers['content-encoding'];
  let rawBody = result.body;
  try {
    rawBody = await decompressBody(rawBody, contentEncoding);
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
    remoteAddress: result.remoteAddress,
    timing,
    timeline,
  };
}
