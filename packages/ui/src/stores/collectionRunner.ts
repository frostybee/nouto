import { writable, derived, get } from 'svelte/store';
import type { CollectionRunConfig, CollectionRunRequestResult, CollectionRunResult } from '../types';

export type RunnerStatus = 'idle' | 'running' | 'completed' | 'cancelled';
export type ResultFilter = 'all' | 'passed' | 'failed';

interface RunnerRequestItem {
  id: string;
  name: string;
  method: string;
  url: string;
  enabled: boolean;
}

interface RunnerState {
  status: RunnerStatus;
  collectionId: string;
  collectionName: string;
  folderId?: string;
  requests: RunnerRequestItem[];
  config: CollectionRunConfig;
  progress: { current: number; total: number; requestName: string };
  results: CollectionRunRequestResult[];
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    totalDuration: number;
  };
  resultFilter: ResultFilter;
  expandedResultId: string | null;
}

const defaultConfig: CollectionRunConfig = {
  collectionId: '',
  stopOnFailure: false,
  delayMs: 0,
};

const initialState: RunnerState = {
  status: 'idle',
  collectionId: '',
  collectionName: '',
  requests: [],
  config: { ...defaultConfig },
  progress: { current: 0, total: 0, requestName: '' },
  results: [],
  summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
  resultFilter: 'all',
  expandedResultId: null,
};

export const runnerState = writable<RunnerState>({ ...initialState });

export const runnerStatus = derived(runnerState, $s => $s.status);
export const runnerProgress = derived(runnerState, $s => $s.progress);
export const runnerResults = derived(runnerState, $s => $s.results);
export const runnerSummary = derived(runnerState, $s => $s.summary);

export const filteredResults = derived(runnerState, $s => {
  if ($s.resultFilter === 'all') return $s.results;
  if ($s.resultFilter === 'passed') return $s.results.filter(r => r.passed);
  return $s.results.filter(r => !r.passed);
});

export function initRunner(data: {
  collectionId: string;
  collectionName: string;
  folderId?: string;
  requests: Array<{ id: string; name: string; method: string; url: string }>;
}) {
  runnerState.update(s => ({
    ...s,
    status: 'idle',
    collectionId: data.collectionId,
    collectionName: data.collectionName,
    folderId: data.folderId,
    requests: data.requests.map(r => ({ ...r, enabled: true })),
    config: { ...defaultConfig, collectionId: data.collectionId, folderId: data.folderId },
    results: [],
    summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
    resultFilter: 'all',
    expandedResultId: null,
  }));
}

export function setRunning() {
  runnerState.update(s => ({
    ...s,
    status: 'running',
    results: [],
    summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
    resultFilter: 'all',
    expandedResultId: null,
  }));
}

export function updateProgress(progress: { current: number; total: number; requestName: string }) {
  runnerState.update(s => ({ ...s, progress }));
}

export function addResult(result: CollectionRunRequestResult) {
  runnerState.update(s => {
    const results = [...s.results, result];
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const enabledCount = s.requests.filter(r => r.enabled).length;
    const skipped = Math.max(0, enabledCount - results.length);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    return {
      ...s,
      results,
      summary: { passed, failed, skipped, totalDuration },
    };
  });
}

export function setCompleted(result: CollectionRunResult) {
  runnerState.update(s => ({
    ...s,
    status: 'completed',
    summary: {
      passed: result.passedRequests,
      failed: result.failedRequests,
      skipped: result.skippedRequests,
      totalDuration: result.totalDuration,
    },
  }));
}

export function setCancelled() {
  runnerState.update(s => ({
    ...s,
    status: 'cancelled',
  }));
}

export function updateConfig(updates: Partial<CollectionRunConfig>) {
  runnerState.update(s => ({
    ...s,
    config: { ...s.config, ...updates },
  }));
}

export function resetRunner() {
  runnerState.update(s => ({
    ...s,
    status: 'idle',
    results: [],
    progress: { current: 0, total: 0, requestName: '' },
    summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
    resultFilter: 'all',
    expandedResultId: null,
  }));
}

export function toggleRequestEnabled(requestId: string) {
  runnerState.update(s => ({
    ...s,
    requests: s.requests.map(r => r.id === requestId ? { ...r, enabled: !r.enabled } : r),
  }));
}

export function toggleAllRequests(enabled: boolean) {
  runnerState.update(s => ({
    ...s,
    requests: s.requests.map(r => ({ ...r, enabled })),
  }));
}

export function reorderRequest(fromIdx: number, toIdx: number) {
  runnerState.update(s => {
    const requests = [...s.requests];
    const [moved] = requests.splice(fromIdx, 1);
    requests.splice(toIdx, 0, moved);
    return { ...s, requests };
  });
}

export function setResultFilter(filter: ResultFilter) {
  runnerState.update(s => ({ ...s, resultFilter: filter }));
}

export function setExpandedResult(id: string | null) {
  runnerState.update(s => ({
    ...s,
    expandedResultId: s.expandedResultId === id ? null : id,
  }));
}

export function getEnabledRequests() {
  return get(runnerState).requests.filter(r => r.enabled);
}

export function getEnabledRequestIds(): string[] {
  return get(runnerState).requests.filter(r => r.enabled).map(r => r.id);
}
