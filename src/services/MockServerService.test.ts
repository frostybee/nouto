import * as http from 'http';
import { MockServerService } from './MockServerService';
import type { MockRoute, MockServerConfig } from './types';

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
});
