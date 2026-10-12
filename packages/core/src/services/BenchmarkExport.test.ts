import { buildBenchmarkExport } from './BenchmarkExport';
import type { BenchmarkIteration } from '../types';

const iterations: BenchmarkIteration[] = [
  { iteration: 1, status: 200, statusText: 'OK', duration: 120, size: 42, success: true, timestamp: 1 },
  { iteration: 2, status: 0, statusText: 'Error', duration: 5, size: 0, success: false, error: 'socket "hang up"', timestamp: 2 },
];

const input = {
  requestName: 'Get Users',
  method: 'GET',
  url: 'https://api.example.com/users',
  config: { iterations: 2, concurrency: 1, delayBetweenMs: 0 },
  statistics: null,
  iterations,
};

describe('buildBenchmarkExport', () => {
  it('writes one CSV row per iteration and quotes the error column', () => {
    const file = buildBenchmarkExport('csv', input);
    expect(file.fileName).toBe('Get_Users_benchmark.csv');
    expect(file.content.split('\n')).toEqual([
      '#,Status,StatusText,Duration(ms),Size,Success,Error',
      '1,200,OK,120,42,Yes,""',
      '2,0,Error,5,0,No,"socket ""hang up"""',
    ]);
  });

  it('writes the request, config, statistics and iterations as JSON', () => {
    const file = buildBenchmarkExport('json', input);
    expect(file.fileName).toBe('Get_Users_benchmark.json');
    const parsed = JSON.parse(file.content);
    expect(parsed.requestName).toBe('Get Users');
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe(input.url);
    expect(parsed.config).toEqual(input.config);
    expect(parsed.statistics).toBeNull();
    expect(parsed.iterations).toHaveLength(2);
  });

  it('falls back to a generic file name when the request has no name', () => {
    expect(buildBenchmarkExport('json', { ...input, requestName: '' }).fileName).toBe('benchmark_benchmark.json');
  });
});
