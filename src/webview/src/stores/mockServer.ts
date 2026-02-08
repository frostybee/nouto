import { writable, derived } from 'svelte/store';
import type { MockRoute, MockServerConfig, MockServerStatus, MockRequestLog } from '../types';

interface MockServerState {
  status: MockServerStatus;
  config: MockServerConfig;
  logs: MockRequestLog[];
}

const initialState: MockServerState = {
  status: 'stopped',
  config: {
    port: 3000,
    routes: [],
  },
  logs: [],
};

export const mockServerState = writable<MockServerState>({ ...initialState });

export const mockStatus = derived(mockServerState, $s => $s.status);
export const mockConfig = derived(mockServerState, $s => $s.config);
export const mockRoutes = derived(mockServerState, $s => $s.config.routes);
export const mockLogs = derived(mockServerState, $s => $s.logs);

export function initMockServer(data: { config: MockServerConfig; status: MockServerStatus }) {
  mockServerState.update(s => ({
    ...s,
    status: data.status,
    config: data.config,
    logs: [],
  }));
}

export function setMockStatus(status: MockServerStatus) {
  mockServerState.update(s => ({ ...s, status }));
}

export function setMockConfig(config: MockServerConfig) {
  mockServerState.update(s => ({ ...s, config }));
}

export function updateRoutes(routes: MockRoute[]) {
  mockServerState.update(s => ({
    ...s,
    config: { ...s.config, routes },
  }));
}

export function setPort(port: number) {
  mockServerState.update(s => ({
    ...s,
    config: { ...s.config, port },
  }));
}

export function addRoute(route: MockRoute) {
  mockServerState.update(s => ({
    ...s,
    config: { ...s.config, routes: [...s.config.routes, route] },
  }));
}

export function removeRoute(routeId: string) {
  mockServerState.update(s => ({
    ...s,
    config: { ...s.config, routes: s.config.routes.filter(r => r.id !== routeId) },
  }));
}

export function updateRoute(routeId: string, updates: Partial<MockRoute>) {
  mockServerState.update(s => ({
    ...s,
    config: {
      ...s.config,
      routes: s.config.routes.map(r => r.id === routeId ? { ...r, ...updates } : r),
    },
  }));
}

export function addLog(log: MockRequestLog) {
  mockServerState.update(s => ({
    ...s,
    logs: [...s.logs, log].slice(-100),
  }));
}

export function clearLogs() {
  mockServerState.update(s => ({ ...s, logs: [] }));
}
