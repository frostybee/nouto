import { describe, it, expect, beforeEach } from 'vitest';
import type { MockRoute, MockServerConfig, MockRequestLog } from '../types';
import {
  mockServerState,
  mockStatus,
  mockConfig,
  mockRoutes,
  mockLogs,
  initMockServer,
  setMockStatus,
  setMockConfig,
  updateRoutes,
  setPort,
  addRoute,
  removeRoute,
  updateRoute,
  addLog,
  clearLogs,
} from './mockServer.svelte';

function makeRoute(overrides: Partial<MockRoute> = {}): MockRoute {
  return {
    id: 'route-1',
    enabled: true,
    method: 'GET' as any,
    path: '/api/test',
    statusCode: 200,
    responseBody: '{"ok":true}',
    responseHeaders: [],
    latencyMin: 0,
    latencyMax: 0,
    ...overrides,
  };
}

function makeLog(overrides: Partial<MockRequestLog> = {}): MockRequestLog {
  return {
    id: 'log-1',
    timestamp: Date.now(),
    method: 'GET',
    path: '/api/test',
    matchedRouteId: 'route-1',
    statusCode: 200,
    duration: 5,
    ...overrides,
  };
}

describe('mockServer store', () => {
  beforeEach(() => {
    // Reset to default state
    mockServerState.status = 'stopped';
    mockServerState.config = { port: 3000, routes: [] };
    mockServerState.logs = [];
  });

  describe('initial state', () => {
    it('should have stopped status', () => {
      expect(mockStatus()).toBe('stopped');
    });

    it('should have default config with port 3000 and no routes', () => {
      expect(mockConfig().port).toBe(3000);
      expect(mockConfig().routes).toEqual([]);
    });

    it('should have empty logs', () => {
      expect(mockLogs()).toEqual([]);
    });
  });

  describe('initMockServer', () => {
    it('should initialize status and config from provided data', () => {
      const config: MockServerConfig = { port: 8080, routes: [makeRoute()] };
      initMockServer({ config, status: 'running' });
      expect(mockStatus()).toBe('running');
      expect(mockConfig()).toEqual(config);
    });

    it('should clear logs on init', () => {
      addLog(makeLog());
      expect(mockLogs().length).toBe(1);
      initMockServer({ config: { port: 3000, routes: [] }, status: 'stopped' });
      expect(mockLogs()).toEqual([]);
    });
  });

  describe('setMockStatus', () => {
    it('should update the status', () => {
      setMockStatus('starting');
      expect(mockStatus()).toBe('starting');
    });

    it('should support all status values', () => {
      const statuses = ['stopped', 'starting', 'running', 'stopping', 'error'] as const;
      for (const s of statuses) {
        setMockStatus(s);
        expect(mockStatus()).toBe(s);
      }
    });
  });

  describe('setMockConfig', () => {
    it('should replace the entire config', () => {
      const route = makeRoute({ id: 'r-new' });
      const config: MockServerConfig = { port: 9000, routes: [route] };
      setMockConfig(config);
      expect(mockConfig()).toEqual(config);
    });
  });

  describe('setPort', () => {
    it('should update the port while preserving routes', () => {
      const route = makeRoute();
      addRoute(route);
      setPort(4000);
      expect(mockConfig().port).toBe(4000);
      expect(mockRoutes().length).toBe(1);
    });
  });

  describe('routes CRUD', () => {
    describe('updateRoutes', () => {
      it('should replace all routes', () => {
        addRoute(makeRoute({ id: 'old' }));
        const newRoutes = [makeRoute({ id: 'new-1' }), makeRoute({ id: 'new-2' })];
        updateRoutes(newRoutes);
        expect(mockRoutes().length).toBe(2);
        expect(mockRoutes()[0].id).toBe('new-1');
        expect(mockRoutes()[1].id).toBe('new-2');
      });
    });

    describe('addRoute', () => {
      it('should append a route to the list', () => {
        addRoute(makeRoute({ id: 'r1' }));
        addRoute(makeRoute({ id: 'r2' }));
        expect(mockRoutes().length).toBe(2);
        expect(mockRoutes()[0].id).toBe('r1');
        expect(mockRoutes()[1].id).toBe('r2');
      });

      it('should preserve the port setting', () => {
        setPort(5000);
        addRoute(makeRoute());
        expect(mockConfig().port).toBe(5000);
      });
    });

    describe('removeRoute', () => {
      it('should remove a route by ID', () => {
        addRoute(makeRoute({ id: 'r1' }));
        addRoute(makeRoute({ id: 'r2' }));
        addRoute(makeRoute({ id: 'r3' }));
        removeRoute('r2');
        expect(mockRoutes().length).toBe(2);
        expect(mockRoutes().map(r => r.id)).toEqual(['r1', 'r3']);
      });

      it('should do nothing if the route ID does not exist', () => {
        addRoute(makeRoute({ id: 'r1' }));
        removeRoute('nonexistent');
        expect(mockRoutes().length).toBe(1);
      });
    });

    describe('updateRoute', () => {
      it('should update specific fields of a route', () => {
        addRoute(makeRoute({ id: 'r1', path: '/old', statusCode: 200 }));
        updateRoute('r1', { path: '/new', statusCode: 404 });
        const updated = mockRoutes()[0];
        expect(updated.path).toBe('/new');
        expect(updated.statusCode).toBe(404);
        expect(updated.id).toBe('r1');
        expect(updated.enabled).toBe(true); // unchanged
      });

      it('should not modify other routes', () => {
        addRoute(makeRoute({ id: 'r1', path: '/one' }));
        addRoute(makeRoute({ id: 'r2', path: '/two' }));
        updateRoute('r1', { path: '/updated' });
        expect(mockRoutes()[0].path).toBe('/updated');
        expect(mockRoutes()[1].path).toBe('/two');
      });

      it('should do nothing if the route ID does not match', () => {
        addRoute(makeRoute({ id: 'r1', path: '/original' }));
        updateRoute('nonexistent', { path: '/changed' });
        expect(mockRoutes()[0].path).toBe('/original');
      });
    });
  });

  describe('logs', () => {
    describe('addLog', () => {
      it('should add a log entry', () => {
        const log = makeLog({ id: 'log-1' });
        addLog(log);
        expect(mockLogs().length).toBe(1);
        expect(mockLogs()[0]).toEqual(log);
      });

      it('should append logs in order', () => {
        addLog(makeLog({ id: 'log-1', path: '/first' }));
        addLog(makeLog({ id: 'log-2', path: '/second' }));
        addLog(makeLog({ id: 'log-3', path: '/third' }));
        expect(mockLogs().map(l => l.path)).toEqual(['/first', '/second', '/third']);
      });

      it('should cap logs at 100 entries', () => {
        for (let i = 0; i < 110; i++) {
          addLog(makeLog({ id: `log-${i}`, path: `/path-${i}` }));
        }
        expect(mockLogs().length).toBe(100);
        // The first 10 should have been evicted, keeping entries 10-109
        expect(mockLogs()[0].path).toBe('/path-10');
        expect(mockLogs()[99].path).toBe('/path-109');
      });

      it('should keep the most recent logs when exceeding the limit', () => {
        for (let i = 0; i < 105; i++) {
          addLog(makeLog({ id: `log-${i}` }));
        }
        expect(mockLogs().length).toBe(100);
        expect(mockLogs()[99].id).toBe('log-104');
      });
    });

    describe('clearLogs', () => {
      it('should remove all logs', () => {
        addLog(makeLog({ id: 'log-1' }));
        addLog(makeLog({ id: 'log-2' }));
        clearLogs();
        expect(mockLogs()).toEqual([]);
      });

      it('should be safe to call when already empty', () => {
        clearLogs();
        expect(mockLogs()).toEqual([]);
      });
    });
  });
});
