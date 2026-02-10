import { createTimedRequest, TimingData, TimelineEvent } from './TimingInterceptor';
import * as http from 'http';
import * as https from 'https';
import type { AxiosRequestConfig } from 'axios';

describe('TimingInterceptor', () => {
  describe('createTimedRequest', () => {
    const baseConfig: AxiosRequestConfig = {
      method: 'GET',
      url: 'http://example.com/test',
      headers: { 'Content-Type': 'application/json' },
    };

    // 1. Returns config, getTimings, getTimeline functions
    it('should return config, getTimings, and getTimeline', () => {
      const result = createTimedRequest(baseConfig);

      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('getTimings');
      expect(result).toHaveProperty('getTimeline');
      expect(typeof result.getTimings).toBe('function');
      expect(typeof result.getTimeline).toBe('function');
    });

    // 2. Config is a copy (not same reference)
    it('should return a config that is a copy, not the same reference', () => {
      const result = createTimedRequest(baseConfig);

      expect(result.config).not.toBe(baseConfig);
      expect(result.config.method).toBe(baseConfig.method);
      expect(result.config.url).toBe(baseConfig.url);
    });

    // 3. getTimings returns TimingData with all expected fields
    it('should return TimingData with all expected fields from getTimings', () => {
      const { getTimings } = createTimedRequest(baseConfig);
      const timings: TimingData = getTimings();

      expect(timings).toHaveProperty('dnsLookup');
      expect(timings).toHaveProperty('tcpConnection');
      expect(timings).toHaveProperty('tlsHandshake');
      expect(timings).toHaveProperty('ttfb');
      expect(timings).toHaveProperty('contentTransfer');
      expect(timings).toHaveProperty('total');
    });

    // 4. All timing values are non-negative numbers
    it('should have all timing values as non-negative numbers', () => {
      const { getTimings } = createTimedRequest(baseConfig);
      const timings = getTimings();

      expect(typeof timings.dnsLookup).toBe('number');
      expect(typeof timings.tcpConnection).toBe('number');
      expect(typeof timings.tlsHandshake).toBe('number');
      expect(typeof timings.ttfb).toBe('number');
      expect(typeof timings.contentTransfer).toBe('number');
      expect(typeof timings.total).toBe('number');

      expect(timings.dnsLookup).toBeGreaterThanOrEqual(0);
      expect(timings.tcpConnection).toBeGreaterThanOrEqual(0);
      expect(timings.tlsHandshake).toBeGreaterThanOrEqual(0);
      expect(timings.ttfb).toBeGreaterThanOrEqual(0);
      expect(timings.contentTransfer).toBeGreaterThanOrEqual(0);
      expect(timings.total).toBeGreaterThanOrEqual(0);
    });

    // 5. getTimeline returns an array
    it('should return an array from getTimeline', () => {
      const { getTimeline } = createTimedRequest(baseConfig);
      const timeline = getTimeline();

      expect(Array.isArray(timeline)).toBe(true);
    });

    // 6. getTimeline returns a copy (not same reference)
    it('should return a copy from getTimeline, not the same reference', () => {
      const { getTimeline } = createTimedRequest(baseConfig);
      const timeline1 = getTimeline();
      const timeline2 = getTimeline();

      expect(timeline1).not.toBe(timeline2);
      expect(timeline1).toEqual(timeline2);
    });

    // 7. Timing defaults when no request was made (all zeros or near-zero)
    it('should return zero or near-zero timings when no request was made', () => {
      const { getTimings } = createTimedRequest(baseConfig);
      const timings = getTimings();

      expect(timings.dnsLookup).toBeLessThanOrEqual(1);
      expect(timings.tcpConnection).toBeLessThanOrEqual(1);
      expect(timings.tlsHandshake).toBeLessThanOrEqual(1);
      expect(timings.ttfb).toBeLessThanOrEqual(1);
      expect(timings.contentTransfer).toBeLessThanOrEqual(1);
      expect(timings.total).toBeLessThanOrEqual(1);
    });

    // 8. Calling getTimings restores http originals (safety restore)
    it('should restore http and https originals after getTimings is called', () => {
      const originalHttpRequest = http.request;
      const originalHttpsRequest = https.request;

      const { getTimings } = createTimedRequest(baseConfig);

      // After createTimedRequest, the wrappers may be in place
      // Calling getTimings should restore originals
      getTimings();

      expect(http.request).toBe(originalHttpRequest);
      expect(https.request).toBe(originalHttpsRequest);
    });

    // 11. Multiple calls to getTimings return consistent data
    it('should return consistent data across multiple getTimings calls', () => {
      const { getTimings } = createTimedRequest(baseConfig);

      const timings1 = getTimings();
      const timings2 = getTimings();

      expect(timings1.dnsLookup).toBe(timings2.dnsLookup);
      expect(timings1.tcpConnection).toBe(timings2.tcpConnection);
      expect(timings1.tlsHandshake).toBe(timings2.tlsHandshake);
      expect(timings1.ttfb).toBe(timings2.ttfb);
      expect(timings1.contentTransfer).toBe(timings2.contentTransfer);
      expect(timings1.total).toBe(timings2.total);
    });

    // 12. Multiple calls to getTimeline return separate array copies
    it('should return separate array copies on multiple getTimeline calls', () => {
      const { getTimeline } = createTimedRequest(baseConfig);

      const timeline1 = getTimeline();
      const timeline2 = getTimeline();
      const timeline3 = getTimeline();

      expect(timeline1).not.toBe(timeline2);
      expect(timeline2).not.toBe(timeline3);
      expect(timeline1).not.toBe(timeline3);

      // Mutating one should not affect the others
      timeline1.push({ category: 'info', text: 'test', timestamp: 0 } as TimelineEvent);
      expect(timeline2.length).not.toBe(timeline1.length);
    });
  });

  describe('Integration with real HTTP server', () => {
    let server: http.Server;
    let port: number;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'ok' }));
          });
          server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (address && typeof address !== 'string') {
              port = address.port;
            }
            resolve();
          });
        })
    );

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    );

    // 9. Integration: make actual HTTP request through instrumented path and check timings
    it('should capture timing data for a real HTTP request', async () => {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: `http://127.0.0.1:${port}/test`,
      };

      const { getTimings } = createTimedRequest(config);

      // Make a real request through the instrumented http.request
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}/test`,
          { method: 'GET' },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve();
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      const timings = getTimings();

      expect(timings.total).toBeGreaterThan(0);
      expect(timings.dnsLookup).toBeGreaterThanOrEqual(0);
      expect(timings.tcpConnection).toBeGreaterThanOrEqual(0);
      expect(timings.tlsHandshake).toBeGreaterThanOrEqual(0);
      expect(timings.ttfb).toBeGreaterThanOrEqual(0);
      expect(timings.contentTransfer).toBeGreaterThanOrEqual(0);

      // Total should be at least the sum of some phases
      expect(timings.total).toBeGreaterThanOrEqual(timings.ttfb);
    });

    // 10. Integration: check timeline events after real HTTP request
    it('should capture timeline events for a real HTTP request', async () => {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: `http://127.0.0.1:${port}/timeline-test`,
      };

      const { getTimeline } = createTimedRequest(config);

      // Make a real request through the instrumented http.request
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}/timeline-test`,
          { method: 'GET' },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve();
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      const timeline = getTimeline();

      expect(timeline.length).toBeGreaterThan(0);

      // Each event should have the correct shape
      for (const event of timeline) {
        expect(event).toHaveProperty('category');
        expect(event).toHaveProperty('text');
        expect(event).toHaveProperty('timestamp');
        expect(typeof event.text).toBe('string');
        expect(typeof event.timestamp).toBe('number');
        expect([
          'config',
          'request',
          'info',
          'dns',
          'connection',
          'tls',
          'response',
          'data',
        ]).toContain(event.category);
      }
    });

    // Additional integration: timings are consistent after real request
    it('should return consistent timings on multiple calls after a real request', async () => {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: `http://127.0.0.1:${port}/consistent`,
      };

      const { getTimings } = createTimedRequest(config);

      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}/consistent`,
          { method: 'GET' },
          (res) => {
            res.on('data', () => {});
            res.on('end', () => resolve());
          }
        );
        req.on('error', reject);
        req.end();
      });

      const timings1 = getTimings();
      const timings2 = getTimings();

      expect(timings1.total).toBe(timings2.total);
      expect(timings1.dnsLookup).toBe(timings2.dnsLookup);
      expect(timings1.tcpConnection).toBe(timings2.tcpConnection);
      expect(timings1.ttfb).toBe(timings2.ttfb);
      expect(timings1.contentTransfer).toBe(timings2.contentTransfer);
    });
  });
});
