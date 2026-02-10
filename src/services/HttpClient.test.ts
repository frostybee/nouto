import * as http from 'http';
import * as zlib from 'zlib';
import { executeRequest, HttpRequestConfig } from './HttpClient';

// --- Local test server ---

let server: http.Server;
let port: number;

function createTestServer(): http.Server {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const pathname = url.pathname;

    switch (pathname) {
      case '/json':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'hello', items: [1, 2, 3] }));
        break;

      case '/text':
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello, World!');
        break;

      case '/echo-body': {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ method: req.method, body, headers: req.headers }));
        });
        break;
      }

      case '/echo-headers':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ headers: req.headers }));
        break;

      case '/echo-method':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method }));
        break;

      case '/slow':
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('slow response');
        }, 5000);
        break;

      case '/redirect':
        res.writeHead(302, { Location: '/json' });
        res.end();
        break;

      case '/status/404':
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        break;

      case '/status/500':
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
        break;

      case '/echo-url':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: req.url }));
        break;

      case '/redirect-303':
        res.writeHead(303, { Location: '/echo-method' });
        res.end();
        break;

      case '/redirect-301':
        res.writeHead(301, { Location: '/echo-method' });
        res.end();
        break;

      case '/redirect-loop':
        res.writeHead(302, { Location: '/redirect-loop' });
        res.end();
        break;

      case '/gzip': {
        const gzipBody = Buffer.from('compressed text response');
        const gzipCompressed = zlib.gzipSync(gzipBody);
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Encoding': 'gzip' });
        res.end(gzipCompressed);
        break;
      }

      case '/deflate': {
        const deflateBody = Buffer.from('deflated text response');
        const deflateCompressed = zlib.deflateSync(deflateBody);
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Encoding': 'deflate' });
        res.end(deflateCompressed);
        break;
      }

      case '/identity': {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Encoding': 'identity' });
        res.end('identity encoded body');
        break;
      }

      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        break;
    }
  });
  // Disable keep-alive so sockets close immediately after response
  srv.keepAliveTimeout = 0;
  return srv;
}

function startServer(srv: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Could not determine server port'));
      }
    });
    srv.once('error', reject);
  });
}

function stopServer(srv: http.Server): Promise<void> {
  return new Promise((resolve) => {
    srv.closeAllConnections();
    srv.close(() => resolve());
  });
}

// --- Helpers ---

function makeConfig(overrides: Partial<HttpRequestConfig> & { path?: string } = {}): HttpRequestConfig {
  const controller = new AbortController();
  const { path: urlPath, ...rest } = overrides;
  return {
    method: 'GET',
    headers: {},
    params: {},
    timeout: 10_000,
    signal: controller.signal,
    ...rest,
    url: rest.url || `http://127.0.0.1:${port}${urlPath || '/json'}`,
  };
}

// --- Tests ---

describe('HttpClient - executeRequest', () => {
  beforeAll(async () => {
    server = createTestServer();
    port = await startServer(server);
  });

  afterAll(async () => {
    await stopServer(server);
  });

  it('GET returns JSON with status 200', async () => {
    const res = await executeRequest(makeConfig({ path: '/json' }));
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'hello', items: [1, 2, 3] });
  });

  it('GET returns text response', async () => {
    const res = await executeRequest(makeConfig({ path: '/text' }));
    expect(res.status).toBe(200);
    expect(res.data).toBe('Hello, World!');
  });

  it('POST sends and receives body', async () => {
    const res = await executeRequest(makeConfig({
      method: 'POST',
      path: '/echo-body',
      data: JSON.stringify({ foo: 'bar' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.method).toBe('POST');
    expect(JSON.parse(data.body).foo).toBe('bar');
  });

  it('sends custom headers', async () => {
    const res = await executeRequest(makeConfig({
      path: '/echo-headers',
      headers: { 'X-Custom-Header': 'test-value' },
    }));
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.headers['x-custom-header']).toBe('test-value');
  });

  it('basic auth generates Authorization header', async () => {
    const res = await executeRequest(makeConfig({
      path: '/echo-headers',
      auth: { username: 'user', password: 'pass' },
    }));
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const expected = 'Basic ' + Buffer.from('user:pass').toString('base64');
    expect(data.headers['authorization']).toBe(expected);
  });

  it('handles 404 status', async () => {
    const res = await executeRequest(makeConfig({ path: '/status/404' }));
    expect(res.status).toBe(404);
  });

  it('handles 500 status', async () => {
    const res = await executeRequest(makeConfig({ path: '/status/500' }));
    expect(res.status).toBe(500);
  });

  it('abort signal cancels in-flight request', async () => {
    const controller = new AbortController();
    const promise = executeRequest(makeConfig({
      path: '/slow',
      signal: controller.signal,
    }));
    setTimeout(() => controller.abort(), 50);
    await expect(promise).rejects.toThrow();
  });

  it('connection refused for dead port', async () => {
    const controller = new AbortController();
    await expect(executeRequest({
      method: 'GET',
      url: 'http://127.0.0.1:1',
      headers: {},
      params: {},
      timeout: 5000,
      signal: controller.signal,
    })).rejects.toThrow();
  });

  it('follows redirects (302 -> 200)', async () => {
    const res = await executeRequest(makeConfig({ path: '/redirect' }));
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'hello', items: [1, 2, 3] });
  });

  it('timing data has non-negative values', async () => {
    const res = await executeRequest(makeConfig({ path: '/json' }));
    expect(res.timing).toBeDefined();
    expect(res.timing.total).toBeGreaterThanOrEqual(0);
    expect(res.timing.dnsLookup).toBeGreaterThanOrEqual(0);
    expect(res.timing.tcpConnection).toBeGreaterThanOrEqual(0);
    expect(res.timing.ttfb).toBeGreaterThanOrEqual(0);
    expect(res.timing.contentTransfer).toBeGreaterThanOrEqual(0);
  });

  it('timeline events are generated', async () => {
    const res = await executeRequest(makeConfig({ path: '/json' }));
    expect(Array.isArray(res.timeline)).toBe(true);
    expect(res.timeline.length).toBeGreaterThan(0);
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'dispatches %s method correctly',
    async (method) => {
      const res = await executeRequest(makeConfig({ method, path: '/echo-method' }));
      expect(res.status).toBe(200);
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      expect(data.method).toBe(method);
    },
  );

  // --- Additional coverage tests ---

  it('query params are appended to URL', async () => {
    const res = await executeRequest(makeConfig({
      path: '/echo-url',
      params: { q: 'search', page: '1' },
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.url).toContain('q=search');
    expect(data.url).toContain('page=1');
  });

  it('empty param key is skipped', async () => {
    const res = await executeRequest(makeConfig({
      path: '/echo-url',
      params: { '': 'value', 'real': 'param' },
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.url).toContain('real=param');
    // Empty key should not appear; the URL should not have '=value' without a key
    expect(data.url).not.toMatch(/[?&]=value/);
  });

  it('POST with object body is auto-serialized to JSON', async () => {
    const res = await executeRequest(makeConfig({
      method: 'POST',
      path: '/echo-body',
      data: { name: 'test', count: 42 },
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const parsed = JSON.parse(data.body);
    expect(parsed.name).toBe('test');
    expect(parsed.count).toBe(42);
  });

  it('Content-Length header is auto-set when sending body', async () => {
    const bodyStr = JSON.stringify({ hello: 'world' });
    const res = await executeRequest(makeConfig({
      method: 'POST',
      path: '/echo-body',
      data: bodyStr,
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    // The server echoes back request headers; verify content-length was set
    expect(data.headers['content-length']).toBe(String(Buffer.byteLength(bodyStr)));
  });

  it('statusText is non-empty for common status codes', async () => {
    const res200 = await executeRequest(makeConfig({ path: '/json' }));
    expect(res200.statusText).toBe('OK');

    const res404 = await executeRequest(makeConfig({ path: '/status/404' }));
    expect(res404.statusText).toBe('Not Found');

    const res500 = await executeRequest(makeConfig({ path: '/status/500' }));
    expect(res500.statusText).toBe('Internal Server Error');
  });

  it('POST with Buffer body arrives correctly', async () => {
    const raw = Buffer.from('raw bytes here');
    const res = await executeRequest(makeConfig({
      method: 'POST',
      path: '/echo-body',
      data: raw,
      headers: { 'Content-Type': 'application/octet-stream' },
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.body).toBe('raw bytes here');
    expect(data.headers['content-length']).toBe(String(raw.length));
  });

  it('redirect 303 changes method to GET', async () => {
    const res = await executeRequest(makeConfig({
      method: 'POST',
      path: '/redirect-303',
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.method).toBe('GET');
  });

  it('redirect 301 changes POST to GET', async () => {
    const res = await executeRequest(makeConfig({
      method: 'POST',
      path: '/redirect-301',
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.method).toBe('GET');
  });

  it('redirect limit stops infinite redirect loop', async () => {
    const res = await executeRequest(makeConfig({
      path: '/redirect-loop',
      maxRedirects: 3,
    }));
    // After 3 redirects, the client should stop and return the 302 response
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/redirect-loop');
  });

  it('short timeout triggers timeout error', async () => {
    await expect(
      executeRequest(makeConfig({
        path: '/slow',
        timeout: 1,
      })),
    ).rejects.toThrow(/timeout/i);
  }, 10_000);

  // --- Compression tests ---

  it('decompresses gzip-encoded response body', async () => {
    const res = await executeRequest(makeConfig({ path: '/gzip' }));
    expect(res.status).toBe(200);
    expect(res.data).toBe('compressed text response');
  });

  it('decompresses deflate-encoded response body', async () => {
    const res = await executeRequest(makeConfig({ path: '/deflate' }));
    expect(res.status).toBe(200);
    expect(res.data).toBe('deflated text response');
  });

  it('passes through body with unknown Content-Encoding', async () => {
    const res = await executeRequest(makeConfig({ path: '/identity' }));
    expect(res.status).toBe(200);
    expect(res.data).toBe('identity encoded body');
  });

  // --- formData with getBuffer ---

  it('uses formData.getBuffer() as body when formData is provided', async () => {
    const formPayload = Buffer.from('--boundary\r\nContent-Disposition: form-data; name="file"\r\n\r\nfile-content\r\n--boundary--');
    const mockFormData = {
      getBuffer: () => formPayload,
      getHeaders: () => ({ 'content-type': 'multipart/form-data; boundary=boundary' }),
    };

    const res = await executeRequest(makeConfig({
      method: 'POST',
      path: '/echo-body',
      formData: mockFormData,
      headers: { 'Content-Type': 'multipart/form-data; boundary=boundary' },
    }));
    expect(res.status).toBe(200);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    expect(data.body).toContain('file-content');
    expect(data.headers['content-length']).toBe(String(formPayload.length));
  });

  // --- Pre-aborted signal ---

  it('rejects immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeRequest(makeConfig({
        path: '/json',
        signal: controller.signal,
      })),
    ).rejects.toThrow();
  });

  // --- httpVersion field ---

  it('httpVersion is populated in the response', async () => {
    const res = await executeRequest(makeConfig({ path: '/json' }));
    expect(res.httpVersion).toBeDefined();
    expect(typeof res.httpVersion).toBe('string');
    expect(res.httpVersion).toBe('1.1');
  });
});
