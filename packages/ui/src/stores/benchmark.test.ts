import { describe, it, expect, beforeEach } from 'vitest';
import {
  benchmarkState,
  benchmarkStatus,
  benchmarkProgress,
  benchmarkIterations,
  benchmarkStatistics,
  benchmarkDistribution,
  initBenchmark,
  setRunning,
  updateProgress,
  addIteration,
  setCompleted,
  setCancelled,
  updateConfig,
  resetBenchmark,
} from './benchmark.svelte';

describe('benchmark store', () => {
  beforeEach(() => {
    resetBenchmark();
    benchmarkState.requestId = '';
    benchmarkState.requestName = '';
    benchmarkState.requestMethod = 'GET';
    benchmarkState.requestUrl = '';
    benchmarkState.collectionId = undefined;
    benchmarkState.config = { iterations: 10, concurrency: 1, delayBetweenMs: 0 };
  });

  describe('initial state', () => {
    it('should have idle status', () => {
      expect(benchmarkStatus()).toBe('idle');
    });

    it('should have empty progress', () => {
      expect(benchmarkProgress()).toEqual({ current: 0, total: 0 });
    });

    it('should have empty iterations', () => {
      expect(benchmarkIterations()).toEqual([]);
    });

    it('should have null statistics', () => {
      expect(benchmarkStatistics()).toBeNull();
    });

    it('should have empty distribution', () => {
      expect(benchmarkDistribution()).toEqual([]);
    });

    it('should have default config', () => {
      expect(benchmarkState.config).toEqual({
        iterations: 10,
        concurrency: 1,
        delayBetweenMs: 0,
      });
    });
  });

  describe('initBenchmark', () => {
    it('should set request details', () => {
      initBenchmark({
        requestId: 'req-1',
        requestName: 'Test Request',
        requestMethod: 'POST',
        requestUrl: 'https://api.example.com',
        collectionId: 'col-1',
      });

      expect(benchmarkState.requestId).toBe('req-1');
      expect(benchmarkState.requestName).toBe('Test Request');
      expect(benchmarkState.requestMethod).toBe('POST');
      expect(benchmarkState.requestUrl).toBe('https://api.example.com');
      expect(benchmarkState.collectionId).toBe('col-1');
    });

    it('should reset status to idle', () => {
      benchmarkState.status = 'running';
      initBenchmark({
        requestId: 'req-1',
        requestName: 'Test',
        requestMethod: 'GET',
        requestUrl: 'http://localhost',
      });

      expect(benchmarkStatus()).toBe('idle');
    });

    it('should reset config to defaults', () => {
      updateConfig({ iterations: 50 });
      initBenchmark({
        requestId: 'req-1',
        requestName: 'Test',
        requestMethod: 'GET',
        requestUrl: 'http://localhost',
      });

      expect(benchmarkState.config).toEqual({
        iterations: 10,
        concurrency: 1,
        delayBetweenMs: 0,
      });
    });

    it('should clear iterations, statistics, and distribution', () => {
      initBenchmark({
        requestId: 'req-1',
        requestName: 'Test',
        requestMethod: 'GET',
        requestUrl: 'http://localhost',
      });

      expect(benchmarkIterations()).toEqual([]);
      expect(benchmarkStatistics()).toBeNull();
      expect(benchmarkDistribution()).toEqual([]);
      expect(benchmarkProgress()).toEqual({ current: 0, total: 0 });
    });
  });

  describe('setRunning', () => {
    it('should set status to running', () => {
      setRunning();
      expect(benchmarkStatus()).toBe('running');
    });

    it('should clear iterations', () => {
      addIteration({ iteration: 0, status: 200, statusText: 'OK', duration: 100, size: 0, success: true, timestamp: Date.now() });
      setRunning();
      expect(benchmarkIterations()).toEqual([]);
    });

    it('should clear statistics and distribution', () => {
      setRunning();
      expect(benchmarkStatistics()).toBeNull();
      expect(benchmarkDistribution()).toEqual([]);
    });
  });

  describe('updateProgress', () => {
    it('should update progress values', () => {
      updateProgress(5, 10);
      expect(benchmarkProgress()).toEqual({ current: 5, total: 10 });
    });
  });

  describe('addIteration', () => {
    it('should append an iteration', () => {
      const iter = { iteration: 0, status: 200, statusText: 'OK', duration: 100, size: 0, success: true, timestamp: Date.now() };
      addIteration(iter);
      expect(benchmarkIterations()).toHaveLength(1);
      expect(benchmarkIterations()[0]).toEqual(iter);
    });

    it('should append multiple iterations', () => {
      const now = Date.now();
      addIteration({ iteration: 0, status: 200, statusText: 'OK', duration: 100, size: 0, success: true, timestamp: now });
      addIteration({ iteration: 1, status: 200, statusText: 'OK', duration: 150, size: 0, success: true, timestamp: now });
      addIteration({ iteration: 2, status: 500, statusText: 'Internal Server Error', duration: 50, size: 0, success: false, timestamp: now, error: 'Server error' });

      expect(benchmarkIterations()).toHaveLength(3);
      expect(benchmarkIterations()[2].error).toBe('Server error');
    });
  });

  describe('setCompleted', () => {
    it('should set status to completed', () => {
      const now = new Date().toISOString();
      const result = {
        requestName: 'Test Request',
        url: 'https://api.example.com',
        method: 'GET' as const,
        config: { iterations: 10, concurrency: 1, delayBetweenMs: 0 },
        startedAt: now,
        completedAt: now,
        statistics: {
          totalIterations: 10,
          successCount: 9,
          failCount: 1,
          min: 50,
          max: 200,
          mean: 100,
          median: 95,
          p50: 95,
          p75: 150,
          p90: 175,
          p95: 180,
          p99: 195,
          totalDuration: 1000,
          requestsPerSecond: 10,
        },
        distribution: [
          { bucket: '0-100ms', count: 5 },
          { bucket: '100-200ms', count: 5 },
        ],
        iterations: [
          { iteration: 0, status: 200, statusText: 'OK', duration: 100, size: 0, success: true, timestamp: Date.now() },
          { iteration: 1, status: 200, statusText: 'OK', duration: 150, size: 0, success: true, timestamp: Date.now() },
        ],
      };

      setCompleted(result);
      expect(benchmarkStatus()).toBe('completed');
      expect(benchmarkStatistics()).toEqual(result.statistics);
      expect(benchmarkDistribution()).toEqual(result.distribution);
      expect(benchmarkIterations()).toEqual(result.iterations);
    });
  });

  describe('setCancelled', () => {
    it('should set status to cancelled', () => {
      setRunning();
      setCancelled();
      expect(benchmarkStatus()).toBe('cancelled');
    });
  });

  describe('updateConfig', () => {
    it('should partially update config', () => {
      updateConfig({ iterations: 50 });
      expect(benchmarkState.config.iterations).toBe(50);
      expect(benchmarkState.config.concurrency).toBe(1);
      expect(benchmarkState.config.delayBetweenMs).toBe(0);
    });

    it('should update multiple config fields', () => {
      updateConfig({ iterations: 100, concurrency: 5, delayBetweenMs: 200 });
      expect(benchmarkState.config).toEqual({
        iterations: 100,
        concurrency: 5,
        delayBetweenMs: 200,
      });
    });
  });

  describe('resetBenchmark', () => {
    it('should reset to idle status', () => {
      setRunning();
      resetBenchmark();
      expect(benchmarkStatus()).toBe('idle');
    });

    it('should clear iterations, statistics, distribution, and progress', () => {
      addIteration({ iteration: 0, status: 200, statusText: 'OK', duration: 100, size: 0, success: true, timestamp: Date.now() });
      updateProgress(5, 10);
      resetBenchmark();

      expect(benchmarkIterations()).toEqual([]);
      expect(benchmarkStatistics()).toBeNull();
      expect(benchmarkDistribution()).toEqual([]);
      expect(benchmarkProgress()).toEqual({ current: 0, total: 0 });
    });
  });
});
