import * as http from 'http';
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
});
