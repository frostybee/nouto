import type { MockRoute, MockServerConfig, MockServerStatus, MockRequestLog } from '../types';

interface MockServerState {
  status: MockServerStatus;
  config: MockServerConfig;
  logs: MockRequestLog[];
}

export const mockServerState = $state<MockServerState>({
  status: 'stopped',
  config: {
    port: 3000,
    routes: [],
  },
  logs: [],
});

export function mockStatus() { return mockServerState.status; }
export function mockConfig() { return mockServerState.config; }
export function mockRoutes() { return mockServerState.config.routes; }
export function mockLogs() { return mockServerState.logs; }

export function initMockServer(data: { config: MockServerConfig; status: MockServerStatus }) {
  mockServerState.status = data.status;
  mockServerState.config = data.config;
  mockServerState.logs = [];
}

export function setMockStatus(status: MockServerStatus) {
  mockServerState.status = status;
}

export function setMockConfig(config: MockServerConfig) {
  mockServerState.config = config;
}

export function updateRoutes(routes: MockRoute[]) {
  mockServerState.config = { ...mockServerState.config, routes };
}

export function setPort(port: number) {
  mockServerState.config = { ...mockServerState.config, port };
}

export function addRoute(route: MockRoute) {
  mockServerState.config = { ...mockServerState.config, routes: [...mockServerState.config.routes, route] };
}

export function removeRoute(routeId: string) {
  mockServerState.config = { ...mockServerState.config, routes: mockServerState.config.routes.filter(r => r.id !== routeId) };
}

export function updateRoute(routeId: string, updates: Partial<MockRoute>) {
  mockServerState.config = {
    ...mockServerState.config,
    routes: mockServerState.config.routes.map(r => r.id === routeId ? { ...r, ...updates } : r),
  };
}

export function addLog(log: MockRequestLog) {
  mockServerState.logs = [...mockServerState.logs, log].slice(-100);
}

export function clearLogs() {
  mockServerState.logs = [];
}
