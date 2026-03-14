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

export class GrpcService {
  private packageDefinitionCache = new Map<string, any>();

  /**
   * Reflect on a gRPC server to discover services and methods.
   */
  async reflect(address: string, metadata?: Record<string, string>, tls?: boolean, tlsCertPath?: string, tlsKeyPath?: string, tlsCaCertPath?: string): Promise<GrpcProtoDescriptor> {
    const grpc = require('@grpc/grpc-js') as any;
    const { Client: ReflectionClient } = require('@grpc/grpc-reflection-client') as any;

    const credentials = this.buildCredentials(grpc, tls, tlsCertPath, tlsKeyPath, tlsCaCertPath);
    const client = new ReflectionClient(address, credentials);

    try {
      const serviceList = await new Promise<string[]>((resolve, reject) => {
        client.listServices((err: any, services: any) => {
          if (err) reject(err);
          else resolve(services || []);
        });
      });

      // Filter out reflection services
      const userServices = serviceList.filter(
        (s: string) => !s.startsWith('grpc.reflection.')
      );

      const services: GrpcServiceDescriptor[] = [];

      for (const serviceName of userServices) {
        const fileDescriptor = await new Promise<any>((resolve, reject) => {
          client.fileContainingSymbol(serviceName, (err: any, fd: any) => {
            if (err) reject(err);
            else resolve(fd);
          });
        });

        if (fileDescriptor) {
          const serviceDesc = this.extractServiceFromFileDescriptor(fileDescriptor, serviceName);
          if (serviceDesc) services.push(serviceDesc);
        }
      }

      return { services, source: 'reflection' };
    } finally {
      client.close();
    }
  }

  /**
   * Load proto files and extract service descriptors.
   */
  async loadProto(protoPaths: string[], importDirs: string[]): Promise<GrpcProtoDescriptor> {
    const protoLoader = require('@grpc/proto-loader') as any;
    const grpc = require('@grpc/grpc-js') as any;

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

    const services = this.extractServicesFromPackageObject(packageObject);
    return { services, source: 'proto-files' };
  }

  /**
   * Invoke a unary gRPC call.
   */
  async invoke(options: GrpcInvokeOptions, callbacks: GrpcCallbacks): Promise<void> {
    const grpc = require('@grpc/grpc-js') as any;
    const protoLoader = require('@grpc/proto-loader') as any;

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
        throw new Error('No proto files or reflection data available for invoke');
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

      await new Promise<void>((resolve, reject) => {
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
            resolve();
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
            resolve();
          }
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

  private extractServicesFromPackageObject(obj: any, prefix = ''): GrpcServiceDescriptor[] {
    const services: GrpcServiceDescriptor[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullName = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'function' && (value as any).service) {
        // This is a service constructor
        const serviceDef = (value as any).service;
        const methods: GrpcMethodDescriptor[] = [];

        for (const [methodName, methodDef] of Object.entries(serviceDef)) {
          const def = methodDef as any;
          methods.push({
            name: methodName,
            fullName: `${fullName}.${methodName}`,
            inputType: def.requestType?.type?.name || 'unknown',
            outputType: def.responseType?.type?.name || 'unknown',
            clientStreaming: def.requestStream || false,
            serverStreaming: def.responseStream || false,
          });
        }

        services.push({ name: fullName, methods });
      } else if (typeof value === 'object' && value !== null) {
        services.push(...this.extractServicesFromPackageObject(value, fullName));
      }
    }

    return services;
  }

  private extractServiceFromFileDescriptor(fileDescriptor: any, serviceName: string): GrpcServiceDescriptor | null {
    // Extract from reflection file descriptor
    try {
      const file = fileDescriptor;
      if (!file || !file.service) return null;

      for (const svc of file.service) {
        const fullSvcName = file.package ? `${file.package}.${svc.name}` : svc.name;
        if (fullSvcName === serviceName || svc.name === serviceName) {
          const methods: GrpcMethodDescriptor[] = (svc.method || []).map((m: any) => ({
            name: m.name,
            fullName: `${fullSvcName}.${m.name}`,
            inputType: m.inputType?.replace(/^\./, '') || 'unknown',
            outputType: m.outputType?.replace(/^\./, '') || 'unknown',
            clientStreaming: m.clientStreaming || false,
            serverStreaming: m.serverStreaming || false,
          }));
          return { name: fullSvcName, methods };
        }
      }
    } catch {}
    return null;
  }
}
