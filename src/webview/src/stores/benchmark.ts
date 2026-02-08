import { writable, derived } from 'svelte/store';
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

const initialState: BenchmarkState = {
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
};

export const benchmarkState = writable<BenchmarkState>({ ...initialState });

export const benchmarkStatus = derived(benchmarkState, $s => $s.status);
export const benchmarkProgress = derived(benchmarkState, $s => $s.progress);
export const benchmarkIterations = derived(benchmarkState, $s => $s.iterations);
export const benchmarkStatistics = derived(benchmarkState, $s => $s.statistics);
export const benchmarkDistribution = derived(benchmarkState, $s => $s.distribution);

export function initBenchmark(data: {
  requestId: string;
  requestName: string;
  requestMethod: string;
  requestUrl: string;
  collectionId?: string;
}) {
  benchmarkState.update(s => ({
    ...s,
    status: 'idle',
    requestId: data.requestId,
    requestName: data.requestName,
    requestMethod: data.requestMethod,
    requestUrl: data.requestUrl,
    collectionId: data.collectionId,
    config: { ...defaultConfig },
    iterations: [],
    statistics: null,
    distribution: [],
    progress: { current: 0, total: 0 },
  }));
}

export function setRunning() {
  benchmarkState.update(s => ({
    ...s,
    status: 'running',
    iterations: [],
    statistics: null,
    distribution: [],
  }));
}

export function updateProgress(current: number, total: number) {
  benchmarkState.update(s => ({ ...s, progress: { current, total } }));
}

export function addIteration(iteration: BenchmarkIteration) {
  benchmarkState.update(s => ({
    ...s,
    iterations: [...s.iterations, iteration],
  }));
}

export function setCompleted(result: BenchmarkResult) {
  benchmarkState.update(s => ({
    ...s,
    status: 'completed',
    statistics: result.statistics,
    distribution: result.distribution,
    iterations: result.iterations,
  }));
}

export function setCancelled() {
  benchmarkState.update(s => ({ ...s, status: 'cancelled' }));
}

export function updateConfig(updates: Partial<BenchmarkConfig>) {
  benchmarkState.update(s => ({
    ...s,
    config: { ...s.config, ...updates },
  }));
}

export function resetBenchmark() {
  benchmarkState.update(s => ({
    ...s,
    status: 'idle',
    iterations: [],
    statistics: null,
    distribution: [],
    progress: { current: 0, total: 0 },
  }));
}
