import * as assert from 'assert';
import * as http from 'http';
import { createTestServer, startServer, stopServer } from './helpers/testServer';

suite('HTTP Client Tests', () => {
  let server: http.Server;
  let port: number;
  let executeRequest: any;

  suiteSetup(async () => {
    server = createTestServer();
    port = await startServer(server);
    const mod = require('../../../out/services/HttpClient');
    executeRequest = mod.executeRequest;
  });

  suiteTeardown(async () => {
    await stopServer(server);
  });

  function baseUrl(path: string): string {
    return `http://127.0.0.1:${port}${path}`;
  }

  function makeConfig(overrides: any = {}) {
    const controller = new AbortController();
    const { path: urlPath, url, ...rest } = overrides;
    return {
      method: 'GET',
      headers: {},
      params: {},
      timeout: 10_000,
      signal: controller.signal,
      ...rest,
      url: url || baseUrl(urlPath || '/json'),
    };
  }

  test('GET returns JSON with status 200', async () => {
    const response = await executeRequest(makeConfig({ path: '/json' }));
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.data, { message: 'hello', items: [1, 2, 3] });
  });

  test('GET returns text response', async () => {
    const response = await executeRequest(makeConfig({ path: '/text' }));
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data, 'Hello, World!');
  });

  test('POST sends and receives body', async () => {
    const response = await executeRequest(makeConfig({
      method: 'POST',
      path: '/echo-body',
      data: JSON.stringify({ foo: 'bar' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    assert.strictEqual(response.status, 200);
    const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    assert.strictEqual(body.method, 'POST');
    assert.strictEqual(JSON.parse(body.body).foo, 'bar');
  });

  test('custom headers sent to server', async () => {
    const response = await executeRequest(makeConfig({
      path: '/echo-headers',
      headers: { 'X-Custom-Header': 'test-value' },
    }));
    assert.strictEqual(response.status, 200);
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    assert.strictEqual(data.headers['x-custom-header'], 'test-value');
  });

  test('basic auth generates Authorization header', async () => {
    const response = await executeRequest(makeConfig({
      path: '/echo-headers',
      auth: { username: 'user', password: 'pass' },
    }));
    assert.strictEqual(response.status, 200);
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    const expected = 'Basic ' + Buffer.from('user:pass').toString('base64');
    assert.strictEqual(data.headers['authorization'], expected);
  });

  test('404 status handled correctly', async () => {
    const response = await executeRequest(makeConfig({ path: '/status/404' }));
    assert.strictEqual(response.status, 404);
  });

  test('500 status handled correctly', async () => {
    const response = await executeRequest(makeConfig({ path: '/status/500' }));
    assert.strictEqual(response.status, 500);
  });

  test('abort signal cancels in-flight request', async () => {
    const controller = new AbortController();
    const config = makeConfig({
      path: '/slow',
      signal: controller.signal,
    });

    // Abort shortly after starting
    const promise = executeRequest(config);
    setTimeout(() => controller.abort(), 50);

    await assert.rejects(promise, (err: any) => {
      return err.name === 'AbortError' || err.message?.includes('abort');
    });
  });

  test('connection refused for dead port', async () => {
    const controller = new AbortController();
    await assert.rejects(
      executeRequest({
        method: 'GET',
        url: 'http://127.0.0.1:1',
        headers: {},
        params: {},
        timeout: 5000,
        signal: controller.signal,
      }),
      (err: any) => {
        return err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED');
      }
    );
  });

  test('redirect following (302 -> 200)', async () => {
    const response = await executeRequest(makeConfig({ path: '/redirect' }));
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.data, { message: 'hello', items: [1, 2, 3] });
  });

  test('timing data has non-negative values', async () => {
    const response = await executeRequest(makeConfig({ path: '/json' }));
    assert.ok(response.timing, 'Response should have timing data');
    assert.ok(response.timing.total >= 0, 'total should be non-negative');
    assert.ok(response.timing.dnsLookup >= 0, 'dnsLookup should be non-negative');
    assert.ok(response.timing.tcpConnection >= 0, 'tcpConnection should be non-negative');
    assert.ok(response.timing.ttfb >= 0, 'ttfb should be non-negative');
    assert.ok(response.timing.contentTransfer >= 0, 'contentTransfer should be non-negative');
  });

  test('timeline events generated', async () => {
    const response = await executeRequest(makeConfig({ path: '/json' }));
    assert.ok(Array.isArray(response.timeline), 'Response should have timeline array');
    assert.ok(response.timeline.length > 0, 'Timeline should have at least one event');
  });

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
  for (const method of methods) {
    test(`HTTP method ${method} dispatched correctly`, async () => {
      const response = await executeRequest(makeConfig({
        method,
        path: '/echo-method',
      }));
      assert.strictEqual(response.status, 200);
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      assert.strictEqual(data.method, method);
    });
  }
});
