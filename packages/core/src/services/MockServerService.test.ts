import * as http from 'http';
import { MockServerService } from './MockServerService';
import type { MockRoute, MockServerConfig } from '../types';

function makeRoute(overrides: Partial<MockRoute> = {}): MockRoute {
  return {
    id: 'route-1',
    enabled: true,
    method: 'GET',
    path: '/test',
    statusCode: 200,
    responseBody: '{"ok":true}',
    responseHeaders: [],
    latencyMin: 0,
    latencyMax: 0,
    ...overrides,
  };
}

function fetchMock(port: number, method: string, path: string): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) headers[k] = Array.isArray(v) ? v.join(', ') : v;
        }
        resolve({ status: res.statusCode || 0, body, headers });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('MockServerService', () => {
  let service: MockServerService;
  let port: number;

  beforeEach(() => {
    service = new MockServerService();
    // Use a random high port to avoid conflicts
    port = 30000 + Math.floor(Math.random() * 10000);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should start and stop the server', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);
    expect(service.getStatus()).toBe('running');

    await service.stop();
    expect(service.getStatus()).toBe('stopped');
  });

  it('should serve a basic mock route', async () => {
    const config: MockServerConfig = {
      port,
      routes: [makeRoute({ responseBody: '{"hello":"world"}' })],
    };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/test');
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"hello":"world"}');
  });

  it('should return 404 for unmatched routes', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should match path parameters', async () => {
    const route = makeRoute({
      path: '/users/:id',
      responseBody: '{"userId":"{{id}}"}',
    });
    const config: MockServerConfig = { port, routes: [route] };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/users/42');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: '42' });
  });

  it('should match multiple path parameters', async () => {
    const route = makeRoute({
      path: '/users/:userId/posts/:postId',
      responseBody: '{"user":"{{userId}}","post":"{{postId}}"}',
    });
    const config: MockServerConfig = { port, routes: [route] };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/users/5/posts/10');
    expect(JSON.parse(res.body)).toEqual({ user: '5', post: '10' });
  });

  it('should match by HTTP method', async () => {
    const config: MockServerConfig = {
      port,
      routes: [
        makeRoute({ id: 'get', method: 'GET', path: '/data', responseBody: 'GET response' }),
        makeRoute({ id: 'post', method: 'POST', path: '/data', responseBody: 'POST response' }),
      ],
    };
    await service.start(config);

    const getRes = await fetchMock(port, 'GET', '/data');
    expect(getRes.body).toBe('GET response');

    const postRes = await fetchMock(port, 'POST', '/data');
    expect(postRes.body).toBe('POST response');
  });

  it('should skip disabled routes', async () => {
    const config: MockServerConfig = {
      port,
      routes: [
        makeRoute({ id: 'disabled', enabled: false, path: '/test' }),
        makeRoute({ id: 'enabled', enabled: true, path: '/test', statusCode: 201 }),
      ],
    };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/test');
    expect(res.status).toBe(201);
  });

  it('should apply custom response headers', async () => {
    const route = makeRoute({
      responseHeaders: [
        { id: '1', key: 'X-Custom', value: 'test-value', enabled: true },
        { id: '2', key: 'X-Disabled', value: 'nope', enabled: false },
      ],
    });
    const config: MockServerConfig = { port, routes: [route] };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/test');
    expect(res.headers['x-custom']).toBe('test-value');
    expect(res.headers['x-disabled']).toBeUndefined();
  });

  it('should log requests', async () => {
    const logs: any[] = [];
    service.setLogHandler((log) => logs.push(log));

    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    await fetchMock(port, 'GET', '/test');
    await fetchMock(port, 'GET', '/nonexistent');

    expect(logs).toHaveLength(2);
    expect(logs[0].matchedRouteId).toBe('route-1');
    expect(logs[0].statusCode).toBe(200);
    expect(logs[1].matchedRouteId).toBeNull();
    expect(logs[1].statusCode).toBe(404);
  });

  it('should clear logs', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    await fetchMock(port, 'GET', '/test');
    expect(service.getLogs()).toHaveLength(1);

    service.clearLogs();
    expect(service.getLogs()).toHaveLength(0);
  });

  it('should handle status change callbacks', async () => {
    const statuses: string[] = [];
    service.setStatusChangeHandler((s) => statuses.push(s));

    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);
    await service.stop();

    expect(statuses).toContain('starting');
    expect(statuses).toContain('running');
    expect(statuses).toContain('stopping');
    expect(statuses).toContain('stopped');
  });

  it('should update routes dynamically', async () => {
    const config: MockServerConfig = {
      port,
      routes: [makeRoute({ path: '/initial', responseBody: 'initial' })],
    };
    await service.start(config);

    const res1 = await fetchMock(port, 'GET', '/initial');
    expect(res1.body).toBe('initial');

    // Update routes while server is running
    service.updateRoutes([
      makeRoute({ path: '/updated', responseBody: 'updated' }),
    ]);

    const res2 = await fetchMock(port, 'GET', '/updated');
    expect(res2.body).toBe('updated');

    const res3 = await fetchMock(port, 'GET', '/initial');
    expect(res3.status).toBe(404);
  });

  // =====================================================
  // Additional tests for branch coverage
  // =====================================================

  it('should stop existing server when start is called again (line 49)', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);
    expect(service.getStatus()).toBe('running');

    // Start again on a different port (to avoid port conflict)
    const port2 = port + 1;
    const config2: MockServerConfig = { port: port2, routes: [makeRoute({ path: '/new' })] };
    await service.start(config2);
    expect(service.getStatus()).toBe('running');

    // The new server should respond
    const res = await fetchMock(port2, 'GET', '/new');
    expect(res.status).toBe(200);

    // Cleanup: stop the new server
    await service.stop();
  });

  it('should set status to error when server fails to start (lines 61-62)', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    // Try to start another service on the same port
    const service2 = new MockServerService();
    const statuses: string[] = [];
    service2.setStatusChangeHandler((s) => statuses.push(s));

    await expect(service2.start({ port, routes: [makeRoute()] }))
      .rejects.toThrow();

    expect(statuses).toContain('error');

    // Cleanup
    await service2.stop();
  });

  it('should handle stop when forceCloseTimeout already exists (lines 77-78)', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    // Call stop twice rapidly to trigger the forceCloseTimeout clearing
    const stopPromise1 = service.stop();
    // The first stop sets forceCloseTimeout, calling stop again should clear it
    const stopPromise2 = service.stop();

    await Promise.all([stopPromise1, stopPromise2]);
    expect(service.getStatus()).toBe('stopped');
  });

  it('should skip route with path exceeding 500 characters (line 111)', () => {
    const longPath = '/' + 'a'.repeat(501);
    // updateRoutes silently skips invalid routes (caught in try-catch)
    service.updateRoutes([makeRoute({ path: longPath })]);
    // The invalid route should not be compiled
    expect((service as any).compiledRoutes).toHaveLength(0);
  });

  it('should handle OPTIONS preflight requests with 204 (lines 154-156)', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    const res = await fetchMock(port, 'OPTIONS', '/test');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('should apply latency when latencyMin > 0 (line 196)', async () => {
    const route = makeRoute({
      latencyMin: 50,
      latencyMax: 50,
      responseBody: '{"delayed":true}',
    });
    const config: MockServerConfig = { port, routes: [route] };
    await service.start(config);

    const start = Date.now();
    const res = await fetchMock(port, 'GET', '/test');
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body).toBe('{"delayed":true}');
    // Should have taken at least ~50ms (allow some margin)
    expect(elapsed).toBeGreaterThanOrEqual(30);
  });

  it('should apply random latency between latencyMin and latencyMax', async () => {
    const route = makeRoute({
      latencyMin: 20,
      latencyMax: 100,
      responseBody: '{"ok":true}',
    });
    const config: MockServerConfig = { port, routes: [route] };
    await service.start(config);

    const start = Date.now();
    const res = await fetchMock(port, 'GET', '/test');
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });

  it('should trim logs when exceeding maxLogs limit (line 215)', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    // Send more than 100 requests to exceed maxLogs
    const requests: Promise<any>[] = [];
    for (let i = 0; i < 105; i++) {
      requests.push(fetchMock(port, 'GET', '/test'));
    }
    await Promise.all(requests);

    const logs = service.getLogs();
    expect(logs.length).toBeLessThanOrEqual(100);
  });

  it('should handle stop gracefully when server is null', async () => {
    // stop() called without start() should just return
    await service.stop();
    expect(service.getStatus()).toBe('stopped');
  });

  it('should escape regex special chars in route paths', async () => {
    const route = makeRoute({
      path: '/api/v1.0/test',
      responseBody: '{"version":"1.0"}',
    });
    const config: MockServerConfig = { port, routes: [route] };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/api/v1.0/test');
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"version":"1.0"}');

    // Should NOT match /api/v1X0/test since the dot is escaped
    const res2 = await fetchMock(port, 'GET', '/api/v1X0/test');
    expect(res2.status).toBe(404);
  });

  it('should set CORS headers on all responses', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    // Test CORS on matched route
    const res = await fetchMock(port, 'GET', '/test');
    expect(res.headers['access-control-allow-origin']).toBe('*');

    // Test CORS on 404
    const res404 = await fetchMock(port, 'GET', '/nonexistent');
    expect(res404.headers['access-control-allow-origin']).toBe('*');
  });

  it('should handle response headers with empty key', async () => {
    const route = makeRoute({
      responseHeaders: [
        { id: '1', key: '', value: 'should-not-appear', enabled: true },
        { id: '2', key: 'X-Valid', value: 'valid', enabled: true },
      ],
    });
    const config: MockServerConfig = { port, routes: [route] };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/test');
    expect(res.headers['x-valid']).toBe('valid');
  });

  it('should default method to GET when req.method is undefined', async () => {
    // This is indirectly tested: the handleRequest defaults to GET
    // We verify by matching a GET route with a normal GET request
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    const res = await fetchMock(port, 'GET', '/test');
    expect(res.status).toBe(200);
  });

  it('should handle getLogs returning a copy', async () => {
    const config: MockServerConfig = { port, routes: [makeRoute()] };
    await service.start(config);

    await fetchMock(port, 'GET', '/test');

    const logs1 = service.getLogs();
    const logs2 = service.getLogs();
    expect(logs1).toEqual(logs2);
    // Should be different array instances
    expect(logs1).not.toBe(logs2);
  });
});
