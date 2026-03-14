import type { GrpcProtoDescriptor, GrpcConnection, GrpcEvent } from '../types';
import { request } from './request.svelte';

// Proto/reflection state
const _grpcProtoStatus = $state<{ value: 'idle' | 'loading' | 'loaded' | 'error' }>({ value: 'idle' });
const _grpcProtoDescriptor = $state<{ value: GrpcProtoDescriptor | null }>({ value: null });
const _grpcProtoError = $state<{ value: string | null }>({ value: null });

// Scanned directory files: map of dir path -> found .proto file paths
const _scannedDirFiles = $state<{ value: Record<string, string[]> }>({ value: {} });

// Connection state
const _grpcConnection = $state<{ value: GrpcConnection | null }>({ value: null });
const _grpcEvents = $state<{ value: GrpcEvent[] }>({ value: [] });
const _grpcStreaming = $state<{ value: boolean }>({ value: false });

interface GrpcHistoryEntry {
  connection: GrpcConnection;
  events: GrpcEvent[];
}
const _grpcConnectionHistory = $state<{ value: GrpcHistoryEntry[] }>({ value: [] });

// Getters
export function grpcProtoStatus() { return _grpcProtoStatus.value; }
export function grpcProtoDescriptor() { return _grpcProtoDescriptor.value; }
export function grpcProtoError() { return _grpcProtoError.value; }
export function scannedDirFiles() { return _scannedDirFiles.value; }
export function grpcConnection() { return _grpcConnection.value; }
export function grpcEvents() { return _grpcEvents.value; }
export function grpcConnectionHistory() { return _grpcConnectionHistory.value.map(e => e.connection); }
export function grpcIsStreaming() { return _grpcStreaming.value; }

// Derived: JSON Schema for currently selected method's input type
export function grpcActiveMethodSchema(): string | undefined {
  const descriptor = _grpcProtoDescriptor.value;
  if (!descriptor) return undefined;
  const serviceName = request.grpc?.serviceName;
  const methodName = request.grpc?.methodName;
  if (!serviceName || !methodName) return undefined;
  const service = descriptor.services.find(s => s.name === serviceName);
  if (!service) return undefined;
  const method = service.methods.find(m => m.name === methodName);
  return method?.inputSchema;
}

// Derived: method type
export function grpcMethodType(): 'unary' | 'server_streaming' | 'client_streaming' | 'streaming' | null {
  const descriptor = _grpcProtoDescriptor.value;
  if (!descriptor) return null;
  const serviceName = request.grpc?.serviceName;
  const methodName = request.grpc?.methodName;
  if (!serviceName || !methodName) return null;
  const service = descriptor.services.find(s => s.name === serviceName);
  if (!service) return null;
  const method = service.methods.find(m => m.name === methodName);
  if (!method) return null;
  if (method.clientStreaming && method.serverStreaming) return 'streaming';
  if (method.clientStreaming) return 'client_streaming';
  if (method.serverStreaming) return 'server_streaming';
  return 'unary';
}

// Actions
export function setGrpcProtoLoading() {
  _grpcProtoStatus.value = 'loading';
  _grpcProtoError.value = null;
}

export function setGrpcProtoLoaded(descriptor: GrpcProtoDescriptor) {
  _grpcProtoStatus.value = 'loaded';
  _grpcProtoDescriptor.value = descriptor;
  _grpcProtoError.value = null;
}

export function setGrpcProtoError(message: string) {
  _grpcProtoStatus.value = 'error';
  _grpcProtoError.value = message;
}

export function setScannedDirFiles(dir: string, files: string[]) {
  _scannedDirFiles.value = { ..._scannedDirFiles.value, [dir]: files };
}

export function setGrpcConnectionStart(connection: GrpcConnection, streaming = false) {
  _grpcConnection.value = connection;
  _grpcEvents.value = [];
  _grpcStreaming.value = streaming;
}

export function addGrpcEvent(event: GrpcEvent) {
  _grpcEvents.value = [..._grpcEvents.value, event];
}

export function setGrpcConnectionEnd(connection: GrpcConnection) {
  _grpcConnection.value = connection;
  _grpcStreaming.value = false;
  const entry: GrpcHistoryEntry = { connection, events: [..._grpcEvents.value] };
  _grpcConnectionHistory.value = [entry, ..._grpcConnectionHistory.value].slice(0, 50);
}

export function clearGrpcState() {
  _grpcProtoStatus.value = 'idle';
  _grpcProtoDescriptor.value = null;
  _grpcProtoError.value = null;
  _scannedDirFiles.value = {};
  _grpcConnection.value = null;
  _grpcEvents.value = [];
  _grpcStreaming.value = false;
  _grpcConnectionHistory.value = [];
}

export function selectPreviousConnection(connectionId: string) {
  const entry = _grpcConnectionHistory.value.find(e => e.connection.id === connectionId);
  if (entry) {
    _grpcConnection.value = entry.connection;
    _grpcEvents.value = entry.events;
  }
}
