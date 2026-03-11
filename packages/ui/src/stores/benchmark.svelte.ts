import type { BenchmarkConfig, BenchmarkIteration, BenchmarkStatistics, BenchmarkResult } from '../types';

export type BenchmarkStatus = 'idle' | 'running' | 'completed' | 'cancelled';

interface BenchmarkState {
  status: BenchmarkStatus;
  requestId: string;
  requestName: string;
  requestMethod: string;
  requestUrl: string;
  collectionId?: string;
  config: BenchmarkConfig;
  progress: { current: number; total: number };
  iterations: BenchmarkIteration[];
  statistics: BenchmarkStatistics | null;
  distribution: { bucket: string; count: number }[];
}

const defaultConfig: BenchmarkConfig = {
  iterations: 10,
  concurrency: 1,
  delayBetweenMs: 0,
};

export const benchmarkState = $state<BenchmarkState>({
  status: 'idle',
  requestId: '',
  requestName: '',
  requestMethod: 'GET',
  requestUrl: '',
  config: { ...defaultConfig },
  progress: { current: 0, total: 0 },
  iterations: [],
  statistics: null,
  distribution: [],
});

export function benchmarkStatus() { return benchmarkState.status; }
export function benchmarkProgress() { return benchmarkState.progress; }
export function benchmarkIterations() { return benchmarkState.iterations; }
export function benchmarkStatistics() { return benchmarkState.statistics; }
export function benchmarkDistribution() { return benchmarkState.distribution; }

export function initBenchmark(data: {
  requestId: string;
  requestName: string;
  requestMethod: string;
  requestUrl: string;
  collectionId?: string;
}) {
  benchmarkState.status = 'idle';
  benchmarkState.requestId = data.requestId;
  benchmarkState.requestName = data.requestName;
  benchmarkState.requestMethod = data.requestMethod;
  benchmarkState.requestUrl = data.requestUrl;
  benchmarkState.collectionId = data.collectionId;
  benchmarkState.config = { ...defaultConfig };
  benchmarkState.iterations = [];
  benchmarkState.statistics = null;
  benchmarkState.distribution = [];
  benchmarkState.progress = { current: 0, total: 0 };
}

export function setRunning() {
  benchmarkState.status = 'running';
  benchmarkState.iterations = [];
  benchmarkState.statistics = null;
  benchmarkState.distribution = [];
}

export function updateProgress(current: number, total: number) {
  benchmarkState.progress = { current, total };
}

export function addIteration(iteration: BenchmarkIteration) {
  benchmarkState.iterations = [...benchmarkState.iterations, iteration];
}

export function setCompleted(result: BenchmarkResult) {
  benchmarkState.status = 'completed';
  benchmarkState.statistics = result.statistics;
  benchmarkState.distribution = result.distribution;
  benchmarkState.iterations = result.iterations;
}

export function setCancelled() {
  benchmarkState.status = 'cancelled';
}

export function updateConfig(updates: Partial<BenchmarkConfig>) {
  benchmarkState.config = { ...benchmarkState.config, ...updates };
}

export function resetBenchmark() {
  benchmarkState.status = 'idle';
  benchmarkState.iterations = [];
  benchmarkState.statistics = null;
  benchmarkState.distribution = [];
  benchmarkState.progress = { current: 0, total: 0 };
}
