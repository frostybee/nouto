import * as http from 'http';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { shouldBypassProxy, buildProxyUrl, buildProxyAgent, executeRequest, HttpRequestConfig } from './HttpClient';

// ---------- shouldBypassProxy ----------

describe('shouldBypassProxy', () => {
  it('returns false when noProxy is undefined', () => {
    expect(shouldBypassProxy('example.com')).toBe(false);
  });

  it('returns false when noProxy is empty string', () => {
    expect(shouldBypassProxy('example.com', '')).toBe(false);
  });

  it('matches exact hostname', () => {
    expect(shouldBypassProxy('localhost', 'localhost')).toBe(true);
  });

  it('matches exact hostname case-insensitively', () => {
    expect(shouldBypassProxy('LocalHost', 'localhost')).toBe(true);
    expect(shouldBypassProxy('localhost', 'LOCALHOST')).toBe(true);
  });

  it('does not match partial hostname', () => {
    expect(shouldBypassProxy('notlocalhost', 'localhost')).toBe(false);
  });

  it('matches wildcard *', () => {
    expect(shouldBypassProxy('anything.com', '*')).toBe(true);
  });

  it('matches suffix (sub.example.com matches example.com)', () => {
    expect(shouldBypassProxy('sub.example.com', 'example.com')).toBe(true);
  });

  it('matches dot-prefixed suffix (.example.com matches sub.example.com)', () => {
    expect(shouldBypassProxy('sub.example.com', '.example.com')).toBe(true);
  });

  it('does not match unrelated domain', () => {
    expect(shouldBypassProxy('other.com', 'example.com')).toBe(false);
  });

  it('handles comma-separated list', () => {
    const noProxy = 'localhost, 127.0.0.1, .internal.corp';
    expect(shouldBypassProxy('localhost', noProxy)).toBe(true);
    expect(shouldBypassProxy('127.0.0.1', noProxy)).toBe(true);
    expect(shouldBypassProxy('api.internal.corp', noProxy)).toBe(true);
    expect(shouldBypassProxy('external.com', noProxy)).toBe(false);
  });

  it('ignores empty entries from extra commas/spaces', () => {
    expect(shouldBypassProxy('localhost', ',, localhost ,,')).toBe(true);
  });

  it('does not match when hostname is a suffix of an entry but not a subdomain', () => {
    // "notexample.com" should NOT match "example.com" (no dot boundary)
    expect(shouldBypassProxy('notexample.com', 'example.com')).toBe(false);
  });
});

// ---------- buildProxyUrl ----------

describe('buildProxyUrl', () => {
  it('builds simple http proxy URL', () => {
    expect(buildProxyUrl({ protocol: 'http', host: '127.0.0.1', port: 8080 })).toBe('http://127.0.0.1:8080');
  });

  it('builds https proxy URL', () => {
    expect(buildProxyUrl({ protocol: 'https', host: 'proxy.corp.com', port: 3128 })).toBe('https://proxy.corp.com:3128');
  });

  it('builds socks5 proxy URL', () => {
    expect(buildProxyUrl({ protocol: 'socks5', host: 'localhost', port: 1080 })).toBe('socks5://localhost:1080');
  });

  it('includes username and password when provided', () => {
    expect(buildProxyUrl({ protocol: 'http', host: '10.0.0.1', port: 8080, username: 'user', password: 'pass' }))
      .toBe('http://user:pass@10.0.0.1:8080');
  });

  it('includes username with empty password', () => {
    expect(buildProxyUrl({ protocol: 'http', host: '10.0.0.1', port: 8080, username: 'user' }))
      .toBe('http://user:@10.0.0.1:8080');
  });

  it('URL-encodes special characters in credentials', () => {
    const url = buildProxyUrl({ protocol: 'http', host: '10.0.0.1', port: 8080, username: 'u@ser', password: 'p:ss' });
    expect(url).toBe('http://u%40ser:p%3Ass@10.0.0.1:8080');
  });

  it('does not include auth when username is absent', () => {
    expect(buildProxyUrl({ protocol: 'http', host: '10.0.0.1', port: 8080, password: 'pass' }))
      .toBe('http://10.0.0.1:8080');
  });
});

// ---------- buildProxyAgent ----------

describe('buildProxyAgent', () => {
  it('returns SocksProxyAgent for socks5 protocol', () => {
    const agent = buildProxyAgent('socks5://127.0.0.1:1080', false);
    expect(agent).toBeInstanceOf(SocksProxyAgent);
  });

  it('returns SocksProxyAgent for socks5 protocol targeting HTTPS', () => {
    const agent = buildProxyAgent('socks5://127.0.0.1:1080', true);
    expect(agent).toBeInstanceOf(SocksProxyAgent);
  });

  it('returns HttpProxyAgent for HTTP proxy targeting HTTP', () => {
    const agent = buildProxyAgent('http://127.0.0.1:8080', false);
    expect(agent).toBeInstanceOf(HttpProxyAgent);
  });

  it('returns HttpsProxyAgent for HTTP proxy targeting HTTPS', () => {
    const agent = buildProxyAgent('http://127.0.0.1:8080', true);
    expect(agent).toBeInstanceOf(HttpsProxyAgent);
  });

  it('returns HttpsProxyAgent for HTTPS proxy targeting HTTPS', () => {
    const agent = buildProxyAgent('https://proxy.corp.com:3128', true);
    expect(agent).toBeInstanceOf(HttpsProxyAgent);
  });
});

// ---------- executeRequest with proxy (integration) ----------

describe('executeRequest - proxy integration', () => {
  let proxyServer: http.Server;
  let targetServer: http.Server;
  let proxyPort: number;
  let targetPort: number;
  const proxiedRequests: { method: string; url: string }[] = [];

  beforeAll(async () => {
    // Simple HTTP forward proxy
    proxyServer = http.createServer((req, res) => {
      proxiedRequests.push({ method: req.method!, url: req.url! });
      // Forward to target by making a request
      const targetUrl = new URL(req.url!);
      const proxyReq = http.request(
        { hostname: targetUrl.hostname, port: targetUrl.port, path: targetUrl.pathname, method: req.method, headers: req.headers },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode!, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      req.pipe(proxyReq);
    });

    // Simple target server
    targetServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ proxied: true }));
    });

    proxyPort = await listen(proxyServer);
    targetPort = await listen(targetServer);
  });

  afterAll(async () => {
    await close(proxyServer);
    await close(targetServer);
  });

  beforeEach(() => {
    proxiedRequests.length = 0;
  });

  it('routes request through the proxy', async () => {
    const config: HttpRequestConfig = {
      method: 'GET',
      url: `http://127.0.0.1:${targetPort}/test`,
      headers: {},
      params: {},
      timeout: 5000,
      signal: new AbortController().signal,
      proxy: { protocol: 'http', host: '127.0.0.1', port: proxyPort },
    };

    const result = await executeRequest(config);
    expect(result.status).toBe(200);
    expect(proxiedRequests.length).toBe(1);
    expect(proxiedRequests[0].url).toContain(`127.0.0.1:${targetPort}/test`);
  });

  it('bypasses proxy when hostname matches noProxy', async () => {
    const config: HttpRequestConfig = {
      method: 'GET',
      url: `http://127.0.0.1:${targetPort}/test`,
      headers: {},
      params: {},
      timeout: 5000,
      signal: new AbortController().signal,
      proxy: { protocol: 'http', host: '127.0.0.1', port: proxyPort, noProxy: '127.0.0.1' },
    };

    const result = await executeRequest(config);
    expect(result.status).toBe(200);
    // Should NOT go through proxy
    expect(proxiedRequests.length).toBe(0);
  });

  it('uses proxy when hostname does not match noProxy', async () => {
    const config: HttpRequestConfig = {
      method: 'GET',
      url: `http://127.0.0.1:${targetPort}/test`,
      headers: {},
      params: {},
      timeout: 5000,
      signal: new AbortController().signal,
      proxy: { protocol: 'http', host: '127.0.0.1', port: proxyPort, noProxy: 'other.host' },
    };

    const result = await executeRequest(config);
    expect(result.status).toBe(200);
    expect(proxiedRequests.length).toBe(1);
  });

  it('sends POST body through proxy', async () => {
    const config: HttpRequestConfig = {
      method: 'POST',
      url: `http://127.0.0.1:${targetPort}/test`,
      headers: { 'Content-Type': 'application/json' },
      params: {},
      data: JSON.stringify({ hello: 'world' }),
      timeout: 5000,
      signal: new AbortController().signal,
      proxy: { protocol: 'http', host: '127.0.0.1', port: proxyPort },
    };

    const result = await executeRequest(config);
    expect(result.status).toBe(200);
    expect(proxiedRequests.length).toBe(1);
    expect(proxiedRequests[0].method).toBe('POST');
  });
});

// ---------- Helpers ----------

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as any).port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
