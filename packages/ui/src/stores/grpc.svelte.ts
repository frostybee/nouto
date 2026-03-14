import type { GrpcProtoDescriptor, GrpcConnection, GrpcEvent } from '../types';
import { request } from './request.svelte';

// Proto/reflection state
const _grpcProtoStatus = $state<{ value: 'idle' | 'loading' | 'loaded' | 'error' }>({ value: 'idle' });
const _grpcProtoDescriptor = $state<{ value: GrpcProtoDescriptor | null }>({ value: null });
const _grpcProtoError = $state<{ value: string | null }>({ value: null });

// Connection state
const _grpcConnection = $state<{ value: GrpcConnection | null }>({ value: null });
const _grpcEvents = $state<{ value: GrpcEvent[] }>({ value: [] });
const _grpcConnectionHistory = $state<{ value: GrpcConnection[] }>({ value: [] });

// Getters
export function grpcProtoStatus() { return _grpcProtoStatus.value; }
export function grpcProtoDescriptor() { return _grpcProtoDescriptor.value; }
export function grpcProtoError() { return _grpcProtoError.value; }
export function grpcConnection() { return _grpcConnection.value; }
export function grpcEvents() { return _grpcEvents.value; }
export function grpcConnectionHistory() { return _grpcConnectionHistory.value; }

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

export function setGrpcConnectionStart(connection: GrpcConnection) {
  _grpcConnection.value = connection;
  _grpcEvents.value = [];
}

export function addGrpcEvent(event: GrpcEvent) {
  _grpcEvents.value = [..._grpcEvents.value, event];
}

export function setGrpcConnectionEnd(connection: GrpcConnection) {
  _grpcConnection.value = connection;
  _grpcConnectionHistory.value = [connection, ..._grpcConnectionHistory.value].slice(0, 50);
}

export function clearGrpcState() {
  _grpcProtoStatus.value = 'idle';
  _grpcProtoDescriptor.value = null;
  _grpcProtoError.value = null;
  _grpcConnection.value = null;
  _grpcEvents.value = [];
  _grpcConnectionHistory.value = [];
}

export function selectPreviousConnection(connectionId: string) {
  const conn = _grpcConnectionHistory.value.find(c => c.id === connectionId);
  if (conn) _grpcConnection.value = conn;
}
