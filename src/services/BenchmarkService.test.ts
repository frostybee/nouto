import { BenchmarkService } from './BenchmarkService';
import type { BenchmarkIteration } from './types';

// We test the pure computation methods (statistics + distribution)
// without making real HTTP requests.

describe('BenchmarkService', () => {
  let service: BenchmarkService;

  beforeEach(() => {
    service = new BenchmarkService();
  });

  describe('computeStatistics', () => {
    it('should compute correct statistics for a set of iterations', () => {
      const iterations: BenchmarkIteration[] = [
        { iteration: 1, status: 200, statusText: 'OK', duration: 100, size: 50, success: true, timestamp: 1000 },
        { iteration: 2, status: 200, statusText: 'OK', duration: 200, size: 50, success: true, timestamp: 1100 },
        { iteration: 3, status: 200, statusText: 'OK', duration: 150, size: 50, success: true, timestamp: 1300 },
        { iteration: 4, status: 200, statusText: 'OK', duration: 300, size: 50, success: true, timestamp: 1450 },
        { iteration: 5, status: 500, statusText: 'Error', duration: 50, size: 0, success: false, timestamp: 1750 },
      ];

      const stats = service.computeStatistics(iterations, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:01.000Z');

      expect(stats.totalIterations).toBe(5);
      expect(stats.successCount).toBe(4);
      expect(stats.failCount).toBe(1);
      expect(stats.min).toBe(50);
      expect(stats.max).toBe(300);
      expect(stats.mean).toBe(160);
      expect(stats.median).toBe(150);
      expect(stats.totalDuration).toBe(1000);
      expect(stats.requestsPerSecond).toBe(5);
    });

    it('should handle empty iterations', () => {
      const stats = service.computeStatistics([], '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:01.000Z');
      expect(stats.totalIterations).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.mean).toBe(0);
    });

    it('should handle single iteration', () => {
      const iterations: BenchmarkIteration[] = [
        { iteration: 1, status: 200, statusText: 'OK', duration: 250, size: 100, success: true, timestamp: 1000 },
      ];
      const stats = service.computeStatistics(iterations, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.500Z');
      expect(stats.min).toBe(250);
      expect(stats.max).toBe(250);
      expect(stats.mean).toBe(250);
      expect(stats.median).toBe(250);
      expect(stats.p50).toBe(250);
      expect(stats.p99).toBe(250);
    });

    it('should compute percentiles correctly', () => {
      // 10 values: 10, 20, 30, ..., 100
      const iterations: BenchmarkIteration[] = Array.from({ length: 10 }, (_, i) => ({
        iteration: i + 1,
        status: 200,
        statusText: 'OK',
        duration: (i + 1) * 10,
        size: 50,
        success: true,
        timestamp: 1000 + i * 100,
      }));

      const stats = service.computeStatistics(iterations, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:01.000Z');
      expect(stats.p50).toBe(50);
      expect(stats.p75).toBe(80);
      expect(stats.p90).toBe(90);
      expect(stats.p95).toBe(100);
      expect(stats.p99).toBe(100);
    });

    it('should compute requests per second correctly', () => {
      const iterations: BenchmarkIteration[] = Array.from({ length: 100 }, (_, i) => ({
        iteration: i + 1,
        status: 200,
        statusText: 'OK',
        duration: 10,
        size: 50,
        success: true,
        timestamp: 1000 + i,
      }));

      // 100 requests in 2 seconds = 50 req/s
      const stats = service.computeStatistics(iterations, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:02.000Z');
      expect(stats.requestsPerSecond).toBe(50);
    });
  });

  describe('computeDistribution', () => {
    it('should create distribution buckets', () => {
      const iterations: BenchmarkIteration[] = [
        { iteration: 1, status: 200, statusText: 'OK', duration: 100, size: 50, success: true, timestamp: 1000 },
        { iteration: 2, status: 200, statusText: 'OK', duration: 200, size: 50, success: true, timestamp: 1100 },
        { iteration: 3, status: 200, statusText: 'OK', duration: 300, size: 50, success: true, timestamp: 1400 },
      ];

      const dist = service.computeDistribution(iterations);
      expect(dist.length).toBe(10);
      const totalCount = dist.reduce((sum, b) => sum + b.count, 0);
      expect(totalCount).toBe(3);
    });

    it('should handle empty iterations', () => {
      const dist = service.computeDistribution([]);
      expect(dist).toEqual([]);
    });

    it('should handle all same duration', () => {
      const iterations: BenchmarkIteration[] = Array.from({ length: 5 }, (_, i) => ({
        iteration: i + 1,
        status: 200,
        statusText: 'OK',
        duration: 100,
        size: 50,
        success: true,
        timestamp: 1000,
      }));

      const dist = service.computeDistribution(iterations);
      expect(dist).toHaveLength(1);
      expect(dist[0].count).toBe(5);
      expect(dist[0].bucket).toBe('100ms');
    });
  });

  describe('cancel', () => {
    it('should set abort state', () => {
      // Just verify cancel doesn't throw
      service.cancel();
      service.cancel(); // double cancel should be safe
    });
  });
});
