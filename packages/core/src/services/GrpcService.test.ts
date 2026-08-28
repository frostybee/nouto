import * as path from 'path';
import { GrpcService, collectAnyTypes } from './GrpcService';
import type { GrpcCallbacks } from './GrpcService';
import type { GrpcConnection, GrpcEvent } from '../types';

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { ReflectionService } = require('@grpc/reflection');
const protobuf = require('protobufjs');

const FIXTURES = path.resolve(__dirname, '../test/fixtures/grpc');
const TEST_PROTO = path.join(FIXTURES, 'test.proto');
const EXTRA_PROTO = path.join(FIXTURES, 'extra.proto');

const LOADER_OPTS = { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true };

/** Start an in-process gRPC server exposing nouto.test.TestService plus server reflection. */
async function startServer(): Promise<{ address: string; server: any }> {
  // Load both files into one definition so the server can decode an Any holding nouto.extra.Extra.
  const testDef = protoLoader.loadSync([TEST_PROTO, EXTRA_PROTO], { ...LOADER_OPTS, includeDirs: [FIXTURES] });
  const testPkg = grpc.loadPackageDefinition(testDef);
  const extraType = protobuf.loadSync(EXTRA_PROTO).lookupType('nouto.extra.Extra');

  const server = new grpc.Server();
  server.addService(testPkg.nouto.test.TestService.service, {
    echo(call: any, callback: any) {
      callback(null, { message: `echo:${call.request.message}` });
    },
    count(call: any) {
      const upTo = call.request.upTo || 0;
      for (let i = 1; i <= upTo; i++) call.write({ value: i });
      call.end();
    },
    wrapAny(call: any, callback: any) {
      // proto-loader hands the Any over as raw { type_url, value } (it only expands to
      // '@type' form with json: true), so decode the payload bytes with the Extra type.
      const payload = call.request.payload || {};
      const typeUrl: string = payload.type_url || '';
      let label = '';
      if (typeUrl.endsWith('nouto.extra.Extra') && payload.value?.length) {
        label = extraType.decode(payload.value).label;
      }
      callback(null, { typeUrl, label });
    },
    fail(_call: any, callback: any) {
      callback(Object.assign(new Error('nope'), { code: grpc.status.NOT_FOUND }));
    },
  });

  // Register both files with reflection so `extra.proto` is discoverable by symbol
  // even though the service's own file never imports it.
  new ReflectionService(testDef).addToServer(server);

  const port: number = await new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err: Error | null, p: number) => {
      if (err) reject(err); else resolve(p);
    });
  });
  return { address: `127.0.0.1:${port}`, server };
}

/** Run an invoke to completion and collect everything the service reported. */
async function runInvoke(service: GrpcService, options: Parameters<GrpcService['invoke']>[0]) {
  const events: GrpcEvent[] = [];
  let end: GrpcConnection | undefined;
  let start: GrpcConnection | undefined;
  const callbacks: GrpcCallbacks = {
    onConnectionStart: c => { start = c; },
    onEvent: e => { events.push(e); },
    onConnectionEnd: c => { end = c; },
  };
  await service.invoke(options, callbacks);
  return { start: start!, end: end!, events, serverMessages: events.filter(e => e.eventType === 'server_message') };
}

describe('collectAnyTypes', () => {
  it('extracts unique type names from nested @type URLs', () => {
    const body = {
      payload: { '@type': 'type.googleapis.com/pkg.Outer', inner: { '@type': 'pkg.Inner' } },
      list: [{ '@type': 'type.googleapis.com/pkg.Item' }, { '@type': 'type.googleapis.com/pkg.Item' }],
      plain: 'type.googleapis.com/not.Counted',
    };
    expect(collectAnyTypes(body)).toEqual(['pkg.Outer', 'pkg.Inner', 'pkg.Item']);
  });

  it('returns an empty list for scalars and bodies without Any', () => {
    expect(collectAnyTypes('x')).toEqual([]);
    expect(collectAnyTypes({ a: 1, b: [1, 2] })).toEqual([]);
  });
});

describe('GrpcService', () => {
  let service: GrpcService;

  beforeEach(() => {
    service = new GrpcService();
  });

  afterEach(() => {
    service.dispose();
  });

  it('should create an instance', () => {
    expect(service).toBeInstanceOf(GrpcService);
  });

  it('should reject reflect when no server is listening', async () => {
    await expect(service.reflect('127.0.0.1:1')).rejects.toBeDefined();
  });

  it('should reject loadProto with invalid paths', async () => {
    await expect(service.loadProto(['/nonexistent/path.proto'], [])).rejects.toBeDefined();
  });

  describe('against a live server', () => {
    let address: string;
    let server: any;

    beforeAll(async () => {
      ({ address, server } = await startServer());
    });

    afterAll(() => {
      server.forceShutdown();
    });

    it('loadProto lists services, methods, streaming flags and input schemas', async () => {
      const descriptor = await service.loadProto([TEST_PROTO], [FIXTURES]);
      expect(descriptor.source).toBe('proto-files');
      const svc = descriptor.services.find(s => s.name === 'nouto.test.TestService');
      expect(svc).toBeDefined();
      const count = svc!.methods.find(m => m.name === 'Count');
      expect(count?.serverStreaming).toBe(true);
      expect(count?.clientStreaming).toBe(false);
      const echo = svc!.methods.find(m => m.name === 'Echo');
      expect(echo?.serverStreaming).toBe(false);
      const schema = JSON.parse(echo!.inputSchema!);
      expect(schema.properties.message.type).toBe('string');
    });

    it('reflect discovers services via server reflection', async () => {
      const descriptor = await service.reflect(address);
      expect(descriptor.source).toBe('reflection');
      const names = descriptor.services.map(s => s.name);
      expect(names).toContain('nouto.test.TestService');
      expect(names.some(n => n.startsWith('grpc.reflection.'))).toBe(false);
    });

    it('invokes a unary method loaded from proto files', async () => {
      await service.loadProto([TEST_PROTO], [FIXTURES]);
      const { end, serverMessages, events } = await runInvoke(service, {
        address,
        serviceName: 'nouto.test.TestService',
        methodName: 'Echo',
        body: '{ "message": "hi" /* comment */ }',
        useReflection: false,
        protoPaths: [TEST_PROTO],
        importDirs: [FIXTURES],
      });
      expect(end.status).toBe(0);
      expect(end.trailers['grpc-status']).toBe('0');
      expect(events.some(e => e.eventType === 'client_message')).toBe(true);
      expect(serverMessages).toHaveLength(1);
      expect(JSON.parse(serverMessages[0].content).message).toBe('echo:hi');
    });

    it('invokes a unary method after reflection and reports gRPC errors', async () => {
      await service.reflect(address);
      const ok = await runInvoke(service, {
        address, serviceName: 'nouto.test.TestService', methodName: 'Echo',
        body: '{"message":"r"}', useReflection: true,
      });
      expect(JSON.parse(ok.serverMessages[0].content).message).toBe('echo:r');

      const failed = await runInvoke(service, {
        address, serviceName: 'nouto.test.TestService', methodName: 'Fail',
        body: '{}', useReflection: true,
      });
      expect(failed.end.status).toBe(grpc.status.NOT_FOUND);
      expect(failed.end.error).toBe('nope');
      expect(failed.end.trailers['grpc-status']).toBe(String(grpc.status.NOT_FOUND));
      expect(failed.events.some(e => e.eventType === 'error')).toBe(true);
    });

    it('streams every server message for a server-streaming method', async () => {
      await service.reflect(address);
      const { end, serverMessages } = await runInvoke(service, {
        address, serviceName: 'nouto.test.TestService', methodName: 'Count',
        body: '{"upTo": 3}', useReflection: true,
      });
      expect(end.status).toBe(0);
      expect(serverMessages.map(m => JSON.parse(m.content).value)).toEqual([1, 2, 3]);
    });

    it('applies the deadline as DEADLINE_EXCEEDED when the server is unreachable', async () => {
      await service.loadProto([TEST_PROTO], [FIXTURES]);
      const { end } = await runInvoke(service, {
        address: '10.255.255.1:50051', // non-routable, forces the deadline to fire
        serviceName: 'nouto.test.TestService', methodName: 'Echo',
        body: '{}', useReflection: false, protoPaths: [TEST_PROTO], importDirs: [FIXTURES],
        timeout: 300,
      });
      expect(end.status).toBe(grpc.status.DEADLINE_EXCEEDED);
    }, 10000);

    it('resolves google.protobuf.Any payload types on demand via reflection', async () => {
      await service.reflect(address);
      const { end, serverMessages } = await runInvoke(service, {
        address, serviceName: 'nouto.test.TestService', methodName: 'WrapAny',
        body: JSON.stringify({ payload: { '@type': 'type.googleapis.com/nouto.extra.Extra', label: 'from-any' } }),
        useReflection: true,
      });
      expect(end.error).toBeUndefined();
      expect(end.status).toBe(0);
      const response = JSON.parse(serverMessages[0].content);
      expect(response.typeUrl).toContain('nouto.extra.Extra');
      expect(response.label).toBe('from-any');
    });
  });
});
