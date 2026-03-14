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
}

export interface GrpcCallbacks {
  onConnectionStart: (connection: GrpcConnection) => void;
  onEvent: (event: GrpcEvent) => void;
  onConnectionEnd: (connection: GrpcConnection) => void;
}

// Lazy-load gRPC packages to avoid hard failures when they are not installed
function loadGrpc(): any {
  try { return require('@grpc/grpc-js'); } catch { throw new Error('gRPC support requires @grpc/grpc-js. Install it with: npm install @grpc/grpc-js'); }
}

function loadProtoLoader(): any {
  try { return require('@grpc/proto-loader'); } catch { throw new Error('gRPC support requires @grpc/proto-loader. Install it with: npm install @grpc/proto-loader'); }
}

export class GrpcService {
  private packageDefinitionCache = new Map<string, any>();

  /**
   * Reflect on a gRPC server to discover services using the gRPC reflection protocol.
   * Tries v1 first, falls back to v1alpha if the server returns UNIMPLEMENTED.
   */
  async reflect(address: string, _metadata?: Record<string, string>, tls?: boolean, tlsCertPath?: string, tlsKeyPath?: string, tlsCaCertPath?: string): Promise<GrpcProtoDescriptor> {
    const grpc = loadGrpc();
    const protoLoader = loadProtoLoader();
    const path = require('path');

    const credentials = this.buildCredentials(grpc, tls, tlsCertPath, tlsKeyPath, tlsCaCertPath);
    const fs = require('fs');

    // Resolve the bundled reflection proto files.
    // In the esbuild bundle (packages/vscode/out/extension.js) proto files are
    // copied to packages/vscode/out/proto/ by the build script, so __dirname = out/.
    // In the CJS build (packages/core/dist/services/) __dirname = dist/services/,
    // so ../../proto points to packages/core/proto/.
    function resolveProto(relative: string): string {
      const candidates = [
        path.resolve(__dirname, './proto', relative),   // esbuild bundle: out/proto/
        path.resolve(__dirname, '../../proto', relative), // CJS build: core/proto/
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
      throw new Error(`Reflection proto not found: ${relative}. Searched:\n  ${candidates.join('\n  ')}`);
    }

    // Try v1 first, fall back to v1alpha
    try {
      return await this.reflectWithProto(
        grpc, protoLoader, path, address, credentials,
        resolveProto('grpc/reflection/v1/reflection.proto'),
        'grpc.reflection.v1.ServerReflection'
      );
    } catch (v1Error: any) {
      // If UNIMPLEMENTED (code 12), try v1alpha
      if (v1Error.code === 12 || v1Error.message?.includes('UNIMPLEMENTED')) {
        return await this.reflectWithProto(
          grpc, protoLoader, path, address, credentials,
          resolveProto('grpc/reflection/v1alpha/reflection.proto'),
          'grpc.reflection.v1alpha.ServerReflection'
        );
      }
      throw v1Error;
    }
  }

  private async reflectWithProto(
    grpc: any, protoLoader: any, path: any,
    address: string, credentials: any,
    protoPath: string, servicePath: string
  ): Promise<GrpcProtoDescriptor> {
    const packageDefinition = await protoLoader.load(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const packageObject = grpc.loadPackageDefinition(packageDefinition);

    // Navigate to ServerReflection service
    const parts = servicePath.split('.');
    let ServiceConstructor: any = packageObject;
    for (const part of parts) {
      ServiceConstructor = ServiceConstructor?.[part];
    }
    if (!ServiceConstructor) {
      throw new Error(`Reflection service not found at ${servicePath}`);
    }

    const client = new ServiceConstructor(address, credentials);

    try {
      // Step 1: List services
      const serviceNames = await this.reflectionListServices(client);

      // Step 2: Get file descriptors for each service
      const fileDescriptorBytesSet = new Set<string>();
      const allFileDescriptorBytes: Buffer[] = [];

      for (const svcName of serviceNames) {
        const fdBytes = await this.reflectionGetFileDescriptors(client, svcName);
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

      return { services, source: 'reflection' };
    } finally {
      client.close();
    }
  }

  private reflectionListServices(client: any): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const call = client.serverReflectionInfo();
      const serviceNames: string[] = [];

      call.on('data', (response: any) => {
        if (response.errorResponse) {
          reject(new Error(response.errorResponse.errorMessage || 'Reflection error'));
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

      call.on('end', () => resolve(serviceNames));
      call.on('error', (err: any) => reject(err));

      call.write({ listServices: '' });
      call.end();
    });
  }

  private reflectionGetFileDescriptors(client: any, symbolName: string): Promise<Uint8Array[]> {
    return new Promise((resolve, reject) => {
      const call = client.serverReflectionInfo();
      const descriptors: Uint8Array[] = [];

      call.on('data', (response: any) => {
        if (response.errorResponse) {
          reject(new Error(response.errorResponse.errorMessage || 'Reflection error'));
          call.end();
          return;
        }
        if (response.fileDescriptorResponse) {
          for (const fd of response.fileDescriptorResponse.fileDescriptorProto || []) {
            descriptors.push(fd);
          }
        }
      });

      call.on('end', () => resolve(descriptors));
      call.on('error', (err: any) => reject(err));

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
        const fdProto = protobuf.Root.fromDescriptor({ file: [] });
        // Decode using protobufjs's descriptor support
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
  async loadProto(protoPaths: string[], importDirs: string[]): Promise<GrpcProtoDescriptor> {
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
    const cacheKey = protoPaths.sort().join('|');
    this.packageDefinitionCache.set(cacheKey, { packageDefinition, packageObject });

    const services = this.extractServicesFromPackageObject(packageObject, packageDefinition);
    return { services, source: 'proto-files' };
  }

  /**
   * Invoke a unary gRPC call.
   */
  async invoke(options: GrpcInvokeOptions, callbacks: GrpcCallbacks): Promise<void> {
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
      const cacheKey = options.protoPaths?.sort().join('|') || options.address;

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
      } else {
        throw new Error('No proto files available for invoke. Load proto files first.');
      }

      // Navigate to the service constructor
      const ServiceConstructor = this.findServiceConstructor(packageObject, options.serviceName);
      if (!ServiceConstructor) {
        throw new Error(`Service ${options.serviceName} not found`);
      }

      const credentials = this.buildCredentials(grpc, options.tls, options.tlsCertPath, options.tlsKeyPath, options.tlsCaCertPath);
      const client = new ServiceConstructor(options.address, credentials);

      // Build metadata
      const meta = new grpc.Metadata();
      if (options.metadata) {
        for (const [key, value] of Object.entries(options.metadata)) {
          meta.add(key, value);
        }
      }

      // Parse request body
      let requestBody: any;
      try {
        requestBody = JSON.parse(options.body || '{}');
      } catch {
        requestBody = {};
      }

      // Emit client message event
      callbacks.onEvent({
        id: generateId(),
        connectionId,
        eventType: 'client_message',
        content: options.body || '{}',
        createdAt: new Date().toISOString(),
      });

      // Make unary call
      const methodName = options.methodName;
      const methodFn = client[methodName] || client[this.lowerFirst(methodName)];

      if (!methodFn) {
        throw new Error(`Method ${methodName} not found on service ${options.serviceName}`);
      }

      await new Promise<void>((resolve) => {
        const call = methodFn.call(client, requestBody, meta, (err: any, response: any) => {
          const elapsed = Date.now() - startTime;

          if (err) {
            callbacks.onEvent({
              id: generateId(),
              connectionId,
              eventType: 'error',
              content: '',
              error: err.details || err.message,
              status: err.code ?? 2,
              createdAt: new Date().toISOString(),
            });

            callbacks.onConnectionEnd({
              id: connectionId,
              requestId: '',
              url: options.address,
              service: options.serviceName,
              method: options.methodName,
              status: err.code ?? 2,
              statusMessage: err.details || err.message,
              state: 'closed',
              trailers: this.metadataToRecord(call?.getTrailers?.()),
              elapsed,
              error: err.details || err.message,
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

            callbacks.onConnectionEnd({
              id: connectionId,
              requestId: '',
              url: options.address,
              service: options.serviceName,
              method: options.methodName,
              status: 0,
              state: 'closed',
              trailers: this.metadataToRecord(call?.getTrailers?.()),
              elapsed,
              createdAt: now,
            });
          }
          resolve();
        });
      });
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
  }

  dispose(): void {
    this.packageDefinitionCache.clear();
  }

  // --- Private helpers ---

  private buildCredentials(grpc: any, tls?: boolean, certPath?: string, keyPath?: string, caCertPath?: string): any {
    if (!tls) return grpc.credentials.createInsecure();

    const fs = require('fs');
    const rootCerts = caCertPath ? fs.readFileSync(caCertPath) : undefined;
    const privateKey = keyPath ? fs.readFileSync(keyPath) : undefined;
    const certChain = certPath ? fs.readFileSync(certPath) : undefined;

    return grpc.credentials.createSsl(rootCerts, privateKey, certChain);
  }

  private metadataToRecord(metadata: any): Record<string, string> {
    if (!metadata) return {};
    const result: Record<string, string> = {};
    const map = metadata.getMap?.() || {};
    for (const [key, value] of Object.entries(map)) {
      result[key] = String(value);
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

          // Generate JSON Schema from the request type
          let inputSchema: string | undefined;
          try {
            if (def.requestType?.type) {
              inputSchema = JSON.stringify(this.protoLoaderTypeToJsonSchema(def.requestType.type));
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

  /**
   * Generate JSON Schema from a proto-loader type definition.
   * proto-loader exposes type info via requestType.type with fields array.
   */
  private protoLoaderTypeToJsonSchema(type: any, visited = new Set<string>()): any {
    if (!type) return { type: 'object' };

    const typeName = type.name || '';
    if (visited.has(typeName)) {
      return { $ref: `#/$defs/${typeName}` };
    }
    visited.add(typeName);

    const schema: any = { type: 'object', properties: {} as Record<string, any> };
    const defs: Record<string, any> = {};

    const fields = type.field || type.fields || [];
    // proto-loader can expose fields as an object or array
    const fieldEntries = Array.isArray(fields)
      ? fields
      : Object.values(fields);

    for (const field of fieldEntries) {
      const fieldName = field.name || field.camelCase || '';
      if (!fieldName) continue;

      let fieldSchema = this.protoFieldToJsonSchema(field, visited, defs);

      // Handle repeated fields
      if (field.repeated || field.rule === 'repeated') {
        fieldSchema = { type: 'array', items: fieldSchema };
      }

      schema.properties[fieldName] = fieldSchema;
    }

    if (Object.keys(defs).length > 0) {
      schema.$defs = defs;
    }

    visited.delete(typeName);
    return schema;
  }

  private protoFieldToJsonSchema(field: any, visited: Set<string>, defs: Record<string, any>): any {
    // Map proto type strings/numbers to JSON Schema
    const protoType = field.type || '';

    // proto-loader uses string type names
    if (typeof protoType === 'string') {
      switch (protoType.toLowerCase()) {
        case 'double': case 'float': return { type: 'number' };
        case 'int32': case 'sint32': case 'sfixed32':
        case 'uint32': case 'fixed32': return { type: 'integer' };
        case 'int64': case 'sint64': case 'sfixed64':
        case 'uint64': case 'fixed64': return { type: 'string' };
        case 'bool': return { type: 'boolean' };
        case 'string': return { type: 'string' };
        case 'bytes': return { type: 'string', format: 'byte' };
      }
    }

    // Handle numeric proto field types (from protobufjs descriptors)
    if (typeof protoType === 'number') {
      return this.protoFieldNumberToJsonSchema(protoType);
    }

    // Handle nested message types
    if (field.resolvedType) {
      // Enum type
      if (field.resolvedType.valuesById || field.resolvedType.values) {
        const enumValues = field.resolvedType.values
          ? Object.keys(field.resolvedType.values)
          : Object.values(field.resolvedType.valuesById || {});
        return { type: 'string', enum: enumValues };
      }
      // Message type
      const nestedSchema = this.protoLoaderTypeToJsonSchema(field.resolvedType, visited);
      const refName = field.resolvedType.name || 'Nested';
      if (nestedSchema.$defs) {
        Object.assign(defs, nestedSchema.$defs);
        delete nestedSchema.$defs;
      }
      defs[refName] = nestedSchema;
      return { $ref: `#/$defs/${refName}` };
    }

    // Map type
    if (field.map || field.keyType) {
      return { type: 'object', additionalProperties: {} };
    }

    return {};
  }

  private protoFieldNumberToJsonSchema(typeNum: number): any {
    // protobuf FieldDescriptorProto type numbers
    switch (typeNum) {
      case 1: return { type: 'number' };  // double
      case 2: return { type: 'number' };  // float
      case 3: return { type: 'string' };  // int64
      case 4: return { type: 'string' };  // uint64
      case 5: return { type: 'integer' }; // int32
      case 6: return { type: 'string' };  // fixed64
      case 7: return { type: 'integer' }; // fixed32
      case 8: return { type: 'boolean' }; // bool
      case 9: return { type: 'string' };  // string
      case 12: return { type: 'string', format: 'byte' }; // bytes
      case 13: return { type: 'integer' }; // uint32
      case 14: return { type: 'string' };  // enum (will be overridden if resolvedType exists)
      case 15: return { type: 'integer' }; // sfixed32
      case 16: return { type: 'string' };  // sfixed64
      case 17: return { type: 'integer' }; // sint32
      case 18: return { type: 'string' };  // sint64
      default: return {};
    }
  }

  /**
   * Generate JSON Schema from a protobufjs message Type (used for reflection path).
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

    visited.delete(fullName);
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
