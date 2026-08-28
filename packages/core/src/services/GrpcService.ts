import type { GrpcProtoDescriptor, GrpcServiceDescriptor, GrpcMethodDescriptor, GrpcConnection, GrpcEvent } from '../types';
import { generateId } from '../types';

export interface GrpcInvokeOptions {
  address: string;
  serviceName: string;
  methodName: string;
  metadata?: Record<string, string>;
  body: string; // JSON string
  useReflection: boolean;
  protoPaths?: string[];
  importDirs?: string[];
  tls?: boolean;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  tlsCaCertPath?: string;
  tlsPassphrase?: string;
  timeout?: number;
  methodType?: GrpcMethodType;
}

export interface GrpcCallbacks {
  onConnectionStart: (connection: GrpcConnection) => void;
  onEvent: (event: GrpcEvent) => void;
  onConnectionEnd: (connection: GrpcConnection) => void;
}

export type GrpcMethodType = 'unary' | 'server_streaming' | 'client_streaming' | 'bidi';

type ReflectionVersion = 'v1' | 'v1alpha';

/** gRPC status UNIMPLEMENTED (12): the server does not expose this reflection version. */
function isUnimplemented(err: any): boolean {
  return err?.code === 12 || Boolean(err?.message?.includes('UNIMPLEMENTED'));
}

/**
 * Collect fully-qualified message type names referenced by `@type` URLs anywhere in a
 * JSON value (the canonical JSON form of `google.protobuf.Any`). Returns unique names in
 * first-seen order, e.g. `type.googleapis.com/pkg.Msg` -> `pkg.Msg`.
 */
export function collectAnyTypes(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectAnyTypes(item, out);
  } else if (value && typeof value === 'object') {
    const typeUrl = (value as Record<string, unknown>)['@type'];
    if (typeof typeUrl === 'string') {
      const name = typeUrl.slice(typeUrl.lastIndexOf('/') + 1);
      if (name && !out.includes(name)) out.push(name);
    }
    for (const item of Object.values(value as Record<string, unknown>)) collectAnyTypes(item, out);
  }
  return out;
}

// Lazy-load gRPC packages to avoid hard failures when they are not installed
function loadGrpc(): any {
  try { return require('@grpc/grpc-js'); } catch { throw new Error('gRPC support requires @grpc/grpc-js. Install it with: npm install @grpc/grpc-js'); }
}

function loadProtoLoader(): any {
  try { return require('@grpc/proto-loader'); } catch { throw new Error('gRPC support requires @grpc/proto-loader. Install it with: npm install @grpc/proto-loader'); }
}

/** Strip // single-line and /* multi-line comments from JSON text, respecting string literals. */
function stripJsonComments(input: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < input.length) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) {
        i++;
        out += input[i];
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && i + 1 < input.length) {
      if (input[i + 1] === '/') {
        i += 2;
        while (i < input.length && input[i] !== '\n') i++;
        continue;
      }
      if (input[i + 1] === '*') {
        i += 2;
        while (i + 1 < input.length) {
          if (input[i] === '*' && input[i + 1] === '/') { i += 2; break; }
          i++;
        }
        if (i >= input.length) break;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

export class GrpcService {
  private packageDefinitionCache = new Map<string, any>();
  private reflectedDescriptorBytes = new Map<string, Uint8Array[]>(); // address -> raw FileDescriptorProto bytes
  private activeCalls = new Map<string, any>();
  private activeClients = new Map<string, any>(); // connectionId -> gRPC client (for cleanup)

  /**
   * Reflect on a gRPC server to discover services using the gRPC reflection protocol.
   * Tries v1 first, falls back to v1alpha if the server returns UNIMPLEMENTED.
   */
  async reflect(address: string, metadata?: Record<string, string>, tls?: boolean, tlsCertPath?: string, tlsKeyPath?: string, tlsCaCertPath?: string, tlsPassphrase?: string): Promise<GrpcProtoDescriptor> {
    const grpc = loadGrpc();
    const protoLoader = loadProtoLoader();

    const credentials = this.buildCredentials(grpc, tls, tlsCertPath, tlsKeyPath, tlsCaCertPath, tlsPassphrase);
    const meta = this.buildMetadata(grpc, metadata);

    // Try v1 first, fall back to v1alpha
    try {
      return await this.reflectWithVersion(grpc, protoLoader, address, credentials, meta, 'v1');
    } catch (v1Error: any) {
      if (isUnimplemented(v1Error)) {
        return await this.reflectWithVersion(grpc, protoLoader, address, credentials, meta, 'v1alpha');
      }
      throw v1Error;
    }
  }

  private buildMetadata(grpc: any, metadata?: Record<string, string>): any {
    const meta = new grpc.Metadata();
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        meta.add(key, value);
      }
    }
    return meta;
  }

  /**
   * Resolve one of the bundled reflection proto files.
   * In the esbuild bundle (packages/vscode/out/extension.js) proto files are
   * copied to packages/vscode/out/proto/ by the build script, so __dirname = out/.
   * In the CJS build (packages/core/dist/services/) __dirname = dist/services/,
   * so ../../proto points to packages/core/proto/.
   */
  private resolveReflectionProto(relative: string): string {
    const path = require('path');
    const fs = require('fs');
    const candidates = [
      path.resolve(__dirname, './proto', relative),   // esbuild bundle: out/proto/
      path.resolve(__dirname, '../../proto', relative), // CJS build: core/proto/
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error(`Reflection proto not found: ${relative}. Searched:\n  ${candidates.join('\n  ')}`);
  }

  /** Create a ServerReflection client for the given protocol version. Caller must close() it. */
  private async createReflectionClient(
    grpc: any, protoLoader: any, address: string, credentials: any, version: ReflectionVersion
  ): Promise<any> {
    const protoPath = this.resolveReflectionProto(`grpc/reflection/${version}/reflection.proto`);
    const servicePath = `grpc.reflection.${version}.ServerReflection`;

    const packageDefinition = await protoLoader.load(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const packageObject = grpc.loadPackageDefinition(packageDefinition);

    // Navigate to ServerReflection service
    let ServiceConstructor: any = packageObject;
    for (const part of servicePath.split('.')) {
      ServiceConstructor = ServiceConstructor?.[part];
    }
    if (!ServiceConstructor) {
      throw new Error(`Reflection service not found at ${servicePath}`);
    }

    return new ServiceConstructor(address, credentials);
  }

  private async reflectWithVersion(
    grpc: any, protoLoader: any,
    address: string, credentials: any, meta: any,
    version: ReflectionVersion
  ): Promise<GrpcProtoDescriptor> {
    const client = await this.createReflectionClient(grpc, protoLoader, address, credentials, version);

    try {
      // Step 1: List services
      const serviceNames = await this.reflectionListServices(client, meta);

      // Step 2: Get file descriptors for each service
      const fileDescriptorBytesSet = new Set<string>();
      const allFileDescriptorBytes: Buffer[] = [];

      for (const svcName of serviceNames) {
        const fdBytes = await this.reflectionGetFileDescriptors(client, svcName, meta);
        for (const fd of fdBytes) {
          const key = Buffer.from(fd).toString('base64');
          if (!fileDescriptorBytesSet.has(key)) {
            fileDescriptorBytesSet.add(key);
            allFileDescriptorBytes.push(Buffer.from(fd));
          }
        }
      }

      // Step 3: Decode file descriptors and extract services
      const services = this.extractServicesFromFileDescriptors(allFileDescriptorBytes);

      // Step 4: Store raw descriptor bytes and build package definition for invocation.
      // Uses loadFileDescriptorSetFromBuffer which handles protobuf decoding internally,
      // avoiding issues with protobufjs/ext/descriptor in bundled environments.
      this.reflectedDescriptorBytes.set(address, allFileDescriptorBytes);
      this.buildPackageDefinitionFromDescriptors(grpc, protoLoader, address, allFileDescriptorBytes);

      return { services, source: 'reflection' };
    } finally {
      client.close();
    }
  }

  /**
   * Build a package definition from raw FileDescriptorProto bytes using
   * loadFileDescriptorSetFromBuffer. This constructs the FileDescriptorSet
   * wire-format binary (field 1, length-delimited, repeated) and lets
   * proto-loader handle all protobuf decoding internally.
   */
  private buildPackageDefinitionFromDescriptors(grpc: any, protoLoader: any, cacheKey: string, fdProtoBytes: Uint8Array[]): boolean {
    try {
      // Build a FileDescriptorSet binary: repeated FileDescriptorProto file = 1;
      const parts: Buffer[] = [];
      for (const fd of fdProtoBytes) {
        // Tag: field 1, wire type 2 (length-delimited) = 0x0A
        parts.push(Buffer.from([0x0A]));
        // Varint-encode the length
        let len = fd.length;
        const varintBytes: number[] = [];
        while (len > 0x7F) {
          varintBytes.push((len & 0x7F) | 0x80);
          len >>>= 7;
        }
        varintBytes.push(len & 0x7F);
        parts.push(Buffer.from(varintBytes));
        // The FileDescriptorProto bytes
        parts.push(Buffer.from(fd));
      }
      const fileDescriptorSetBuffer = Buffer.concat(parts);

      const packageDef = protoLoader.loadFileDescriptorSetFromBuffer(fileDescriptorSetBuffer, {
        keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
      });
      const packageObj = grpc.loadPackageDefinition(packageDef);
      this.packageDefinitionCache.set(cacheKey, { packageDefinition: packageDef, packageObject: packageObj });
      return true;
    } catch (err) {
      console.warn('Failed to build package definition from descriptors:', err);
      return false;
    }
  }

  private reflectionListServices(client: any, meta?: any): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const call = client.serverReflectionInfo(meta);
      const serviceNames: string[] = [];
      let settled = false;

      call.on('data', (response: any) => {
        if (response.errorResponse) {
          if (!settled) {
            settled = true;
            reject(new Error(response.errorResponse.errorMessage || 'Reflection error'));
          }
          call.end();
          return;
        }
        if (response.listServicesResponse) {
          for (const svc of response.listServicesResponse.service || []) {
            // Filter out reflection services themselves
            if (svc.name && !svc.name.startsWith('grpc.reflection.')) {
              serviceNames.push(svc.name);
            }
          }
        }
      });

      call.on('end', () => { if (!settled) { settled = true; resolve(serviceNames); } });
      call.on('error', (err: any) => { if (!settled) { settled = true; reject(err); } });

      call.write({ listServices: '' });
      call.end();
    });
  }

  private reflectionGetFileDescriptors(client: any, symbolName: string, meta?: any): Promise<Uint8Array[]> {
    return new Promise((resolve, reject) => {
      const call = client.serverReflectionInfo(meta);
      const descriptors: Uint8Array[] = [];
      let settled = false;

      call.on('data', (response: any) => {
        if (response.errorResponse) {
          if (!settled) {
            settled = true;
            reject(new Error(response.errorResponse.errorMessage || 'Reflection error'));
          }
          call.end();
          return;
        }
        if (response.fileDescriptorResponse) {
          for (const fd of response.fileDescriptorResponse.fileDescriptorProto || []) {
            descriptors.push(fd);
          }
        }
      });

      call.on('end', () => { if (!settled) { settled = true; resolve(descriptors); } });
      call.on('error', (err: any) => { if (!settled) { settled = true; reject(err); } });

      call.write({ fileContainingSymbol: symbolName });
      call.end();
    });
  }

  private extractServicesFromFileDescriptors(fileDescriptorBytes: Buffer[]): GrpcServiceDescriptor[] {
    // Use protobufjs to decode FileDescriptorProto
    const protobuf = require('protobufjs');
    require('protobufjs/ext/descriptor'); // loads protobuf.descriptor.FileDescriptorProto
    const services: GrpcServiceDescriptor[] = [];

    // Decode all file descriptors
    const fileDescriptors: any[] = [];
    for (const fdBytes of fileDescriptorBytes) {
      try {
        const descriptorProto = protobuf.descriptor.FileDescriptorProto.decode(fdBytes);
        fileDescriptors.push(descriptorProto);
      } catch {
        // Skip descriptors that can't be decoded
      }
    }

    // Build a root from all file descriptors for type resolution
    let root: any;
    try {
      root = protobuf.Root.fromDescriptor({ file: fileDescriptors });
      root.resolveAll();
    } catch {
      // Fall back to individual parsing if batch fails
      root = new protobuf.Root();
      for (const fd of fileDescriptors) {
        try {
          const r = protobuf.Root.fromDescriptor({ file: [fd] });
          root.addJSON(r.toJSON());
        } catch {
          // Skip
        }
      }
      try { root.resolveAll(); } catch { /* best effort */ }
    }

    // Extract services from the decoded descriptors
    for (const fd of fileDescriptors) {
      if (!fd.service || fd.service.length === 0) continue;
      const pkg = fd['package'] || '';

      for (const svc of fd.service) {
        const fullServiceName = pkg ? `${pkg}.${svc.name}` : svc.name;

        // Skip reflection services
        if (fullServiceName.startsWith('grpc.reflection.')) continue;

        const methods: GrpcMethodDescriptor[] = [];
        for (const method of svc.method || []) {
          // Resolve input type for schema generation
          const inputTypeName = (method.inputType || '').replace(/^\./, '');
          let inputSchema: string | undefined;
          try {
            const msgType = root.lookupType(inputTypeName);
            if (msgType) {
              inputSchema = JSON.stringify(this.messageTypeToJsonSchema(msgType));
            }
          } catch {
            // Schema generation is best-effort
          }

          methods.push({
            name: method.name,
            fullName: `${fullServiceName}.${method.name}`,
            inputType: this.shortTypeName(method.inputType || 'unknown'),
            outputType: this.shortTypeName(method.outputType || 'unknown'),
            inputSchema,
            clientStreaming: method.clientStreaming || false,
            serverStreaming: method.serverStreaming || false,
          });
        }

        services.push({ name: fullServiceName, methods });
      }
    }

    return services;
  }

  private shortTypeName(fullName: string): string {
    const parts = fullName.replace(/^\./, '').split('.');
    return parts[parts.length - 1] || fullName;
  }

  /**
   * Load proto files and extract service descriptors.
   */
  async loadProto(protoPaths: string[], importDirs: string[] = []): Promise<GrpcProtoDescriptor> {
    const protoLoader = loadProtoLoader();
    const grpc = loadGrpc();

    const packageDefinition = await protoLoader.load(protoPaths, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: importDirs.length > 0 ? importDirs : undefined,
    });

    const packageObject = grpc.loadPackageDefinition(packageDefinition);

    // Cache for invoke
    const cacheKey = [...protoPaths].sort().join('|');
    this.packageDefinitionCache.set(cacheKey, { packageDefinition, packageObject });

    const services = this.extractServicesFromPackageObject(packageObject, packageDefinition);
    return { services, source: 'proto-files' };
  }

  /**
   * Invoke a unary gRPC call.
   */
  async invoke(options: GrpcInvokeOptions, callbacks: GrpcCallbacks): Promise<string> {
    const grpc = loadGrpc();
    const protoLoader = loadProtoLoader();

    const connectionId = generateId();
    const now = new Date().toISOString();
    const startTime = Date.now();

    // Emit connection start
    callbacks.onConnectionStart({
      id: connectionId,
      requestId: '',
      url: options.address,
      service: options.serviceName,
      method: options.methodName,
      status: -1,
      state: 'connecting',
      trailers: {},
      elapsed: 0,
      createdAt: now,
    });

    try {
      // Get or create package definition
      let packageObject: any;
      const cacheKey = (options.protoPaths ? [...options.protoPaths].sort().join('|') : '') || options.address;

      if (this.packageDefinitionCache.has(cacheKey)) {
        packageObject = this.packageDefinitionCache.get(cacheKey).packageObject;
      } else if (options.protoPaths && options.protoPaths.length > 0) {
        const packageDefinition = await protoLoader.load(options.protoPaths, {
          keepCase: false,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs: options.importDirs?.length ? options.importDirs : undefined,
        });
        packageObject = grpc.loadPackageDefinition(packageDefinition);
        this.packageDefinitionCache.set(cacheKey, { packageDefinition, packageObject });
      } else if (options.useReflection) {
        // Reflection was used to load the schema but the cached package definition
        // is missing. Try to rebuild from stored descriptor bytes first,
        // otherwise re-reflect from the server.
        const storedBytes = this.reflectedDescriptorBytes.get(options.address);
        if (storedBytes && this.buildPackageDefinitionFromDescriptors(grpc, protoLoader, options.address, storedBytes)) {
          packageObject = this.packageDefinitionCache.get(options.address).packageObject;
        } else {
          // Re-reflect to get fresh descriptors
          await this.reflect(
            options.address, options.metadata, options.tls,
            options.tlsCertPath, options.tlsKeyPath, options.tlsCaCertPath, options.tlsPassphrase
          );
          if (this.packageDefinitionCache.has(options.address)) {
            packageObject = this.packageDefinitionCache.get(options.address).packageObject;
          } else {
            throw new Error('Failed to build package definition from server reflection. The server may not support the reflection protocol, or the reflected descriptors could not be decoded.');
          }
        }
      } else {
        throw new Error('No proto files available for invoke. Load proto files first.');
      }

      // google.protobuf.Any payloads reference types by URL. With reflection, those types
      // may live in files the service descriptors never imported, so fetch them on demand.
      if (options.useReflection && !(options.protoPaths && options.protoPaths.length > 0)) {
        let parsedForScan: unknown;
        try { parsedForScan = JSON.parse(stripJsonComments(options.body || '{}')); } catch { parsedForScan = undefined; }
        const anyTypes = parsedForScan ? collectAnyTypes(parsedForScan) : [];
        if (anyTypes.length > 0) {
          const rebuilt = await this.resolveAnyTypes(grpc, protoLoader, options, anyTypes);
          if (rebuilt) packageObject = rebuilt;
        }
      }

      // Navigate to the service constructor
      const ServiceConstructor = this.findServiceConstructor(packageObject, options.serviceName);
      if (!ServiceConstructor) {
        throw new Error(`Service ${options.serviceName} not found`);
      }

      const credentials = this.buildCredentials(grpc, options.tls, options.tlsCertPath, options.tlsKeyPath, options.tlsCaCertPath, options.tlsPassphrase);
      const client = new ServiceConstructor(options.address, credentials);

      try {
        // Build metadata
        const meta = new grpc.Metadata();
        if (options.metadata) {
          for (const [key, value] of Object.entries(options.metadata)) {
            meta.add(key, value);
          }
        }

        // Parse request body (strip comments first)
        let requestBody: any;
        try {
          requestBody = JSON.parse(stripJsonComments(options.body || '{}'));
        } catch {
          requestBody = {};
        }

        const methodName = options.methodName;
        const methodFn = client[methodName] || client[this.lowerFirst(methodName)];

        if (!methodFn) {
          throw new Error(`Method ${methodName} not found on service ${options.serviceName}`);
        }

        const callOptions: any = {};
        if (options.timeout && options.timeout > 0) {
          callOptions.deadline = new Date(Date.now() + options.timeout);
        }

        // Detect method type from the service definition or use provided type
        let methodType: GrpcMethodType = options.methodType || 'unary';
        if (!options.methodType) {
          const serviceDef = ServiceConstructor.service;
          if (serviceDef) {
            const methodDef = serviceDef[methodName] || serviceDef[this.lowerFirst(methodName)];
            if (methodDef) {
              if (methodDef.requestStream && methodDef.responseStream) methodType = 'bidi';
              else if (methodDef.requestStream) methodType = 'client_streaming';
              else if (methodDef.responseStream) methodType = 'server_streaming';
            }
          }
        }

        if (methodType === 'unary') {
          // Emit client message event
          callbacks.onEvent({
            id: generateId(),
            connectionId,
            eventType: 'client_message',
            content: options.body || '{}',
            createdAt: new Date().toISOString(),
          });

          await new Promise<void>((resolve) => {
            let initialMeta: Record<string, string> = {};
            const call = methodFn.call(client, requestBody, meta, callOptions, (err: any, response: any) => {
              this.activeCalls.delete(connectionId);
              const elapsed = Date.now() - startTime;

              if (err) {
                const statusCode = err.code ?? 2;
                const statusMessage = err.details || err.message;
                callbacks.onEvent({
                  id: generateId(),
                  connectionId,
                  eventType: 'error',
                  content: '',
                  error: statusMessage,
                  status: statusCode,
                  createdAt: new Date().toISOString(),
                });

                const trailers = this.metadataToRecord(call?.getTrailers?.());
                this.addGrpcStatusToTrailers(trailers, statusCode, statusMessage);

                callbacks.onConnectionEnd({
                  id: connectionId,
                  requestId: '',
                  url: options.address,
                  service: options.serviceName,
                  method: options.methodName,
                  status: statusCode,
                  statusMessage,
                  state: 'closed',
                  trailers,
                  initialMetadata: initialMeta,
                  elapsed,
                  error: statusMessage,
                  createdAt: now,
                });
              } else {
                const responseStr = JSON.stringify(response, null, 2);
                const responseSize = Buffer.byteLength(responseStr, 'utf8');

                callbacks.onEvent({
                  id: generateId(),
                  connectionId,
                  eventType: 'server_message',
                  content: responseStr,
                  size: responseSize,
                  createdAt: new Date().toISOString(),
                });

                const trailers = this.metadataToRecord(call?.getTrailers?.());
                this.addGrpcStatusToTrailers(trailers, 0, 'OK');

                callbacks.onConnectionEnd({
                  id: connectionId,
                  requestId: '',
                  url: options.address,
                  service: options.serviceName,
                  method: options.methodName,
                  status: 0,
                  state: 'closed',
                  trailers,
                  initialMetadata: initialMeta,
                  elapsed,
                  createdAt: now,
                });
              }
              resolve();
            });
            call.on('metadata', (md: any) => {
              initialMeta = this.metadataToRecord(md);
            });
            this.activeCalls.set(connectionId, call);
          });
        } else if (methodType === 'server_streaming') {
          // Emit client message event
          callbacks.onEvent({
            id: generateId(),
            connectionId,
            eventType: 'client_message',
            content: options.body || '{}',
            createdAt: new Date().toISOString(),
          });

          await new Promise<void>((resolve) => {
            let initialMeta: Record<string, string> = {};
            const call = methodFn.call(client, requestBody, meta, callOptions);

            call.on('metadata', (md: any) => {
              initialMeta = this.metadataToRecord(md);
            });

            call.on('data', (response: any) => {
              const responseStr = JSON.stringify(response, null, 2);
              const responseSize = Buffer.byteLength(responseStr, 'utf8');
              callbacks.onEvent({
                id: generateId(),
                connectionId,
                eventType: 'server_message',
                content: responseStr,
                size: responseSize,
                createdAt: new Date().toISOString(),
              });
            });

            call.on('error', (err: any) => {
              this.activeCalls.delete(connectionId);
              this.activeClients.delete(connectionId);
              const elapsed = Date.now() - startTime;
              const statusCode = err.code ?? 2;
              const statusMsg = err.details || err.message;
              callbacks.onEvent({
                id: generateId(),
                connectionId,
                eventType: 'error',
                content: '',
                error: statusMsg,
                status: statusCode,
                createdAt: new Date().toISOString(),
              });
              const trailers = this.metadataToRecord(call?.getTrailers?.());
              this.addGrpcStatusToTrailers(trailers, statusCode, statusMsg);
              callbacks.onConnectionEnd({
                id: connectionId,
                requestId: '',
                url: options.address,
                service: options.serviceName,
                method: options.methodName,
                status: statusCode,
                statusMessage: statusMsg,
                state: 'closed',
                trailers,
                initialMetadata: initialMeta,
                elapsed,
                error: statusMsg,
                createdAt: now,
              });
              resolve();
            });

            call.on('end', () => {
              this.activeCalls.delete(connectionId);
              this.activeClients.delete(connectionId);
              const elapsed = Date.now() - startTime;
              const trailers = this.metadataToRecord(call?.getTrailers?.());
              this.addGrpcStatusToTrailers(trailers, 0, 'OK');
              callbacks.onConnectionEnd({
                id: connectionId,
                requestId: '',
                url: options.address,
                service: options.serviceName,
                method: options.methodName,
                status: 0,
                state: 'closed',
                trailers,
                initialMetadata: initialMeta,
                elapsed,
                createdAt: now,
              });
              resolve();
            });

            this.activeCalls.set(connectionId, call);
            this.activeClients.set(connectionId, client);
          });
        } else if (methodType === 'client_streaming') {
          const call = methodFn.call(client, meta, callOptions, (err: any, response: any) => {
            this.activeCalls.delete(connectionId);
            this.activeClients.delete(connectionId);
            const elapsed = Date.now() - startTime;

            if (err) {
              const statusCode = err.code ?? 2;
              const statusMsg = err.details || err.message;
              callbacks.onEvent({
                id: generateId(),
                connectionId,
                eventType: 'error',
                content: '',
                error: statusMsg,
                status: statusCode,
                createdAt: new Date().toISOString(),
              });
              const trailers = this.metadataToRecord(call?.getTrailers?.());
              this.addGrpcStatusToTrailers(trailers, statusCode, statusMsg);
              callbacks.onConnectionEnd({
                id: connectionId,
                requestId: '',
                url: options.address,
                service: options.serviceName,
                method: options.methodName,
                status: statusCode,
                statusMessage: statusMsg,
                state: 'closed',
                trailers,
                elapsed,
                error: statusMsg,
                createdAt: now,
              });
            } else {
              const responseStr = JSON.stringify(response, null, 2);
              const responseSize = Buffer.byteLength(responseStr, 'utf8');
              callbacks.onEvent({
                id: generateId(),
                connectionId,
                eventType: 'server_message',
                content: responseStr,
                size: responseSize,
                createdAt: new Date().toISOString(),
              });
              const trailers = this.metadataToRecord(call?.getTrailers?.());
              this.addGrpcStatusToTrailers(trailers, 0, 'OK');
              callbacks.onConnectionEnd({
                id: connectionId,
                requestId: '',
                url: options.address,
                service: options.serviceName,
                method: options.methodName,
                status: 0,
                state: 'closed',
                trailers,
                elapsed,
                createdAt: now,
              });
            }
          });

          this.activeCalls.set(connectionId, call);
          this.activeClients.set(connectionId, client);

          // Send initial message if body is provided
          if (requestBody && Object.keys(requestBody).length > 0) {
            callbacks.onEvent({
              id: generateId(),
              connectionId,
              eventType: 'client_message',
              content: options.body || '{}',
              createdAt: new Date().toISOString(),
            });
            call.write(requestBody);
          }
          // Stream stays open for sendMessage/endStream calls
          return connectionId;
        } else if (methodType === 'bidi') {
          const call = methodFn.call(client, meta, callOptions);

          let initialMeta: Record<string, string> = {};
          call.on('metadata', (md: any) => {
            initialMeta = this.metadataToRecord(md);
          });

          call.on('data', (response: any) => {
            const responseStr = JSON.stringify(response, null, 2);
            const responseSize = Buffer.byteLength(responseStr, 'utf8');
            callbacks.onEvent({
              id: generateId(),
              connectionId,
              eventType: 'server_message',
              content: responseStr,
              size: responseSize,
              createdAt: new Date().toISOString(),
            });
          });

          call.on('error', (err: any) => {
            this.activeCalls.delete(connectionId);
            this.activeClients.delete(connectionId);
            const elapsed = Date.now() - startTime;
            const statusCode = err.code ?? 2;
            const statusMsg = err.details || err.message;
            callbacks.onEvent({
              id: generateId(),
              connectionId,
              eventType: 'error',
              content: '',
              error: statusMsg,
              status: statusCode,
              createdAt: new Date().toISOString(),
            });
            const trailers = this.metadataToRecord(call?.getTrailers?.());
            this.addGrpcStatusToTrailers(trailers, statusCode, statusMsg);
            callbacks.onConnectionEnd({
              id: connectionId,
              requestId: '',
              url: options.address,
              service: options.serviceName,
              method: options.methodName,
              status: statusCode,
              statusMessage: statusMsg,
              state: 'closed',
              trailers,
              initialMetadata: initialMeta,
              elapsed,
              error: statusMsg,
              createdAt: now,
            });
          });

          call.on('end', () => {
            this.activeCalls.delete(connectionId);
            this.activeClients.delete(connectionId);
            const elapsed = Date.now() - startTime;
            const trailers = this.metadataToRecord(call?.getTrailers?.());
            this.addGrpcStatusToTrailers(trailers, 0, 'OK');
            callbacks.onConnectionEnd({
              id: connectionId,
              requestId: '',
              url: options.address,
              service: options.serviceName,
              method: options.methodName,
              status: 0,
              state: 'closed',
              trailers,
              initialMetadata: initialMeta,
              elapsed,
              createdAt: now,
            });
          });

          this.activeCalls.set(connectionId, call);
          this.activeClients.set(connectionId, client);

          // Send initial message if body is provided
          if (requestBody && Object.keys(requestBody).length > 0) {
            callbacks.onEvent({
              id: generateId(),
              connectionId,
              eventType: 'client_message',
              content: options.body || '{}',
              createdAt: new Date().toISOString(),
            });
            call.write(requestBody);
          }
          // Stream stays open for sendMessage/endStream calls
          return connectionId;
        }
      } finally {
        this.activeCalls.delete(connectionId);
        client.close();
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      callbacks.onEvent({
        id: generateId(),
        connectionId,
        eventType: 'error',
        content: '',
        error: err.message,
        status: 2,
        createdAt: new Date().toISOString(),
      });

      callbacks.onConnectionEnd({
        id: connectionId,
        requestId: '',
        url: options.address,
        service: options.serviceName,
        method: options.methodName,
        status: 2,
        statusMessage: err.message,
        state: 'closed',
        trailers: {},
        elapsed,
        error: err.message,
        createdAt: now,
      });
    }
    return connectionId;
  }

  sendMessage(connectionId: string, body: string): void {
    const call = this.activeCalls.get(connectionId);
    if (!call) throw new Error('No active stream for this connection');
    let parsed: any;
    try { parsed = JSON.parse(stripJsonComments(body || '{}')); } catch { parsed = {}; }
    call.write(parsed);
  }

  endStream(connectionId: string): void {
    const call = this.activeCalls.get(connectionId);
    if (call && typeof call.end === 'function') {
      call.end();
    }
  }

  cancel(connectionId: string): void {
    const call = this.activeCalls.get(connectionId);
    if (call) {
      call.cancel();
      this.activeCalls.delete(connectionId);
    }
    const client = this.activeClients.get(connectionId);
    if (client) {
      client.close();
      this.activeClients.delete(connectionId);
    }
  }

  dispose(): void {
    for (const call of this.activeCalls.values()) {
      try { call.cancel(); } catch { /* ignore */ }
    }
    this.activeCalls.clear();
    for (const client of this.activeClients.values()) {
      try { client.close(); } catch { /* ignore */ }
    }
    this.activeClients.clear();
    this.packageDefinitionCache.clear();
  }

  // --- Private helpers ---

  /**
   * Fetch descriptors for `google.protobuf.Any` payload types that are missing from the
   * reflected descriptor set, merge them in, and rebuild the package definition.
   * Returns the rebuilt package object, or null when nothing changed.
   */
  private async resolveAnyTypes(grpc: any, protoLoader: any, options: GrpcInvokeOptions, typeNames: string[]): Promise<any | null> {
    const stored = this.reflectedDescriptorBytes.get(options.address) || [];
    const missing = typeNames.filter(name => !this.descriptorsContainType(stored, name));
    if (missing.length === 0) return null;

    const credentials = this.buildCredentials(grpc, options.tls, options.tlsCertPath, options.tlsKeyPath, options.tlsCaCertPath, options.tlsPassphrase);
    const meta = this.buildMetadata(grpc, options.metadata);

    const seen = new Set(stored.map(fd => Buffer.from(fd).toString('base64')));
    const merged: Uint8Array[] = [...stored];
    let added = false;

    for (const symbol of missing) {
      let fds: Uint8Array[];
      try {
        fds = await this.reflectSymbol(grpc, protoLoader, options.address, credentials, meta, symbol);
      } catch {
        continue; // Leave unresolved types to fail at encode time with the normal error
      }
      for (const fd of fds) {
        const key = Buffer.from(fd).toString('base64');
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(Buffer.from(fd));
          added = true;
        }
      }
    }

    if (!added) return null;
    this.reflectedDescriptorBytes.set(options.address, merged);
    if (!this.buildPackageDefinitionFromDescriptors(grpc, protoLoader, options.address, merged)) return null;
    return this.packageDefinitionCache.get(options.address)?.packageObject ?? null;
  }

  /** Ask the server (v1, then v1alpha) for the file descriptors that define `symbol`. */
  private async reflectSymbol(grpc: any, protoLoader: any, address: string, credentials: any, meta: any, symbol: string): Promise<Uint8Array[]> {
    const versions: ReflectionVersion[] = ['v1', 'v1alpha'];
    let lastError: any;
    for (const version of versions) {
      const client = await this.createReflectionClient(grpc, protoLoader, address, credentials, version);
      try {
        return await this.reflectionGetFileDescriptors(client, symbol, meta);
      } catch (err: any) {
        lastError = err;
        if (!isUnimplemented(err)) throw err;
      } finally {
        client.close();
      }
    }
    throw lastError;
  }

  /** True when a fully-qualified message/enum name is defined by any of the given FileDescriptorProtos. */
  private descriptorsContainType(fdBytes: Uint8Array[], fullName: string): boolean {
    if (fdBytes.length === 0) return false;
    try {
      const root = this.rootFromDescriptorBytes(fdBytes);
      return Boolean(root.lookup(fullName.replace(/^\./, '')));
    } catch {
      return false;
    }
  }

  private buildCredentials(grpc: any, tls?: boolean, certPath?: string, keyPath?: string, caCertPath?: string, passphrase?: string): any {
    if (!tls) return grpc.credentials.createInsecure();

    const fs = require('fs');
    const rootCerts = caCertPath ? fs.readFileSync(caCertPath) : undefined;
    let privateKey = keyPath ? fs.readFileSync(keyPath) : undefined;
    const certChain = certPath ? fs.readFileSync(certPath) : undefined;

    // If passphrase is provided for an encrypted key, use checkServerIdentity option
    // Note: grpc.credentials.createSsl doesn't directly support passphrase,
    // so we decrypt the key using crypto if a passphrase is given
    if (privateKey && passphrase) {
      try {
        const crypto = require('crypto');
        const keyObject = crypto.createPrivateKey({ key: privateKey, passphrase });
        privateKey = keyObject.export({ type: 'pkcs8', format: 'pem' });
      } catch (err: any) {
        throw new Error(`Failed to decrypt private key with passphrase: ${err.message}`);
      }
    }

    return grpc.credentials.createSsl(rootCerts, privateKey, certChain);
  }

  // @grpc/grpc-js strips grpc-status and grpc-message from trailers into the StatusObject,
  // so we add them back to match what's actually sent over the wire.
  private addGrpcStatusToTrailers(trailers: Record<string, string>, statusCode: number, statusMessage: string): void {
    if (!('grpc-status' in trailers)) trailers['grpc-status'] = String(statusCode);
    if (!('grpc-message' in trailers)) trailers['grpc-message'] = statusMessage;
  }

  private metadataToRecord(metadata: any): Record<string, string> {
    if (!metadata) return {};
    const result: Record<string, string> = {};
    // Prefer toHttp2Headers() which preserves raw HTTP/2 headers that getMap() may strip
    // (e.g. grpc-encoding, grpc-accept-encoding are consumed by the compression filter)
    const headers = metadata.toHttp2Headers?.() || metadata.getMap?.() || {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof key === 'string' && key.startsWith(':')) continue; // Skip HTTP/2 pseudo-headers
      result[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return result;
  }

  private lowerFirst(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private findServiceConstructor(packageObject: any, serviceName: string): any {
    const parts = serviceName.split('.');
    let current = packageObject;
    for (const part of parts) {
      if (!current[part]) return null;
      current = current[part];
    }
    return typeof current === 'function' ? current : null;
  }

  private extractServicesFromPackageObject(obj: any, packageDefinition?: any, prefix = ''): GrpcServiceDescriptor[] {
    const services: GrpcServiceDescriptor[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullName = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'function' && (value as any).service) {
        const serviceDef = (value as any).service;
        const methods: GrpcMethodDescriptor[] = [];

        for (const [methodName, methodDef] of Object.entries(serviceDef)) {
          const def = methodDef as any;

          // Generate JSON Schema from the request type. proto-loader attaches the serialized
          // FileDescriptorProtos to every type definition, so build a protobufjs Root from them
          // and reuse the same generator as the reflection path.
          let inputSchema: string | undefined;
          try {
            const fdBytes = def.requestType?.fileDescriptorProtos;
            const typeName = def.requestType?.type?.name;
            if (Array.isArray(fdBytes) && fdBytes.length > 0 && typeName) {
              const msgType = this.findMessageType(this.rootFromDescriptorBytes(fdBytes), typeName);
              if (msgType) inputSchema = JSON.stringify(this.messageTypeToJsonSchema(msgType));
            }
          } catch {
            // Schema generation is best-effort
          }

          methods.push({
            name: methodName,
            fullName: `${fullName}.${methodName}`,
            inputType: def.requestType?.type?.name || 'unknown',
            outputType: def.responseType?.type?.name || 'unknown',
            inputSchema,
            clientStreaming: def.requestStream || false,
            serverStreaming: def.responseStream || false,
          });
        }

        services.push({ name: fullName, methods });
      } else if (typeof value === 'object' && value !== null) {
        services.push(...this.extractServicesFromPackageObject(value, packageDefinition, fullName));
      }
    }

    return services;
  }

  /** Build a resolved protobufjs Root from serialized FileDescriptorProto buffers. */
  private rootFromDescriptorBytes(fdBytes: Uint8Array[]): any {
    const protobuf = require('protobufjs');
    require('protobufjs/ext/descriptor');
    const files = fdBytes.map(b => protobuf.descriptor.FileDescriptorProto.decode(b));
    const root = protobuf.Root.fromDescriptor({ file: files });
    try { root.resolveAll(); } catch { /* best effort */ }
    return root;
  }

  /** Find a message Type by fully-qualified or short name anywhere in a protobufjs Root. */
  private findMessageType(root: any, name: string): any | null {
    try {
      return root.lookupType(name.replace(/^\./, ''));
    } catch {
      // Short names that are not resolvable from the root fall through to a full scan
    }
    const protobuf = require('protobufjs');
    const stack: any[] = [root];
    while (stack.length > 0) {
      const ns = stack.pop();
      for (const nested of ns.nestedArray || []) {
        if (nested instanceof protobuf.Type && nested.name === name) return nested;
        if (nested.nestedArray) stack.push(nested);
      }
    }
    return null;
  }

  /**
   * Generate JSON Schema from a protobufjs message Type (shared by the reflection and proto-file paths).
   */
  private messageTypeToJsonSchema(msgType: any, visited = new Set<string>()): any {
    const fullName = msgType.fullName || msgType.name || '';
    if (visited.has(fullName)) {
      return { $ref: `#/$defs/${msgType.name || 'Message'}` };
    }
    visited.add(fullName);

    const schema: any = { type: 'object', properties: {} as Record<string, any> };
    const defs: Record<string, any> = {};

    const fields = msgType.fieldsArray || Object.values(msgType.fields || {});
    for (const field of fields) {
      const name = field.name || '';
      if (!name) continue;

      let fieldSchema: any;

      // Check if it's a map field
      if (field.map) {
        const valueSchema = this.resolveProtobufFieldSchema(field, visited, defs, true);
        fieldSchema = { type: 'object', additionalProperties: valueSchema };
      } else {
        fieldSchema = this.resolveProtobufFieldSchema(field, visited, defs, false);
      }

      // Handle repeated
      if (field.repeated && !field.map) {
        fieldSchema = { type: 'array', items: fieldSchema };
      }

      schema.properties[name] = fieldSchema;
    }

    if (Object.keys(defs).length > 0) {
      schema.$defs = defs;
    }

    return schema;
  }

  private resolveProtobufFieldSchema(field: any, visited: Set<string>, defs: Record<string, any>, isMapValue: boolean): any {
    const type = isMapValue ? (field.valueType || field.type) : field.type;

    // Scalar types
    switch (type) {
      case 'double': case 'float': return { type: 'number' };
      case 'int32': case 'sint32': case 'sfixed32':
      case 'uint32': case 'fixed32': return { type: 'integer' };
      case 'int64': case 'sint64': case 'sfixed64':
      case 'uint64': case 'fixed64': return { type: 'string' };
      case 'bool': return { type: 'boolean' };
      case 'string': return { type: 'string' };
      case 'bytes': return { type: 'string', format: 'byte' };
    }

    // Try to resolve as a message or enum type
    if (field.resolvedType) {
      // Enum
      if (field.resolvedType.valuesById || field.resolvedType.constructor?.name === 'Enum') {
        const values = field.resolvedType.values
          ? Object.keys(field.resolvedType.values)
          : Object.values(field.resolvedType.valuesById || {});
        return { type: 'string', enum: values };
      }
      // Nested message
      const nestedSchema = this.messageTypeToJsonSchema(field.resolvedType, visited);
      const refName = field.resolvedType.name || 'Nested';
      if (nestedSchema.$defs) {
        Object.assign(defs, nestedSchema.$defs);
        delete nestedSchema.$defs;
      }
      defs[refName] = nestedSchema;
      return { $ref: `#/$defs/${refName}` };
    }

    return {};
  }
}
