import type { CollectionRunConfig, CollectionRunRequestResult, CollectionRunResult } from '../types';

export type RunnerStatus = 'idle' | 'running' | 'completed' | 'cancelled';
export type ResultFilter = 'all' | 'passed' | 'failed';

export interface RunnerHistoryEntry {
  id: string;
  collectionId: string;
  collectionName: string;
  folderId?: string;
  startedAt: string;
  completedAt: string;
  totalRequests: number;
  passedRequests: number;
  failedRequests: number;
  skippedRequests: number;
  totalDuration: number;
  stoppedEarly: boolean;
}

interface RunnerRequestItem {
  id: string;
  name: string;
  method: string;
  url: string;
  enabled: boolean;
}

interface DataFileInfo {
  path: string;
  type: 'csv' | 'json';
  rowCount: number;
  columns: string[];
}

interface EnvironmentOption {
  id: string;
  name: string;
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
  dataFile?: DataFileInfo;
  environments: EnvironmentOption[];
  selectedEnvironmentId: string | null;
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
  environments: [],
  selectedEnvironmentId: null,
};

export const runnerState = $state<RunnerState>({ ...initialState });

// Derived getters (exported as functions since Svelte 5 disallows exporting $derived from modules)
export function runnerStatus() { return runnerState.status; }
export function runnerProgress() { return runnerState.progress; }
export function runnerResults() { return runnerState.results; }
export function runnerSummary() { return runnerState.summary; }

export function filteredResults() {
  if (runnerState.resultFilter === 'all') return runnerState.results;
  if (runnerState.resultFilter === 'passed') return runnerState.results.filter(r => r.passed);
  return runnerState.results.filter(r => !r.passed);
}

export function initRunner(data: {
  collectionId: string;
  collectionName: string;
  folderId?: string;
  requests: Array<{ id: string; name: string; method: string; url: string }>;
  environments?: Array<{ id: string; name: string }>;
  activeEnvironmentId?: string | null;
}) {
  runnerState.status = 'idle';
  runnerState.collectionId = data.collectionId;
  runnerState.collectionName = data.collectionName;
  runnerState.folderId = data.folderId;
  runnerState.requests = data.requests.map(r => ({ ...r, enabled: true }));
  runnerState.config = { ...defaultConfig, collectionId: data.collectionId, folderId: data.folderId };
  runnerState.results = [];
  runnerState.summary = { passed: 0, failed: 0, skipped: 0, totalDuration: 0 };
  runnerState.resultFilter = 'all';
  runnerState.expandedResultId = null;
  runnerState.environments = data.environments || [];
  runnerState.selectedEnvironmentId = data.activeEnvironmentId ?? null;
}

export function setSelectedEnvironment(id: string | null) {
  runnerState.selectedEnvironmentId = id;
}

export function setRunning() {
  runnerState.status = 'running';
  runnerState.results = [];
  runnerState.summary = { passed: 0, failed: 0, skipped: 0, totalDuration: 0 };
  runnerState.resultFilter = 'all';
  runnerState.expandedResultId = null;
}

export function updateProgress(progress: { current: number; total: number; requestName: string }) {
  runnerState.progress = progress;
}

export function addResult(result: CollectionRunRequestResult) {
  const results = [...runnerState.results, result];
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const enabledCount = runnerState.requests.filter(r => r.enabled).length;
  const skipped = Math.max(0, enabledCount - results.length);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  runnerState.results = results;
  runnerState.summary = { passed, failed, skipped, totalDuration };
}

export function setCompleted(result: CollectionRunResult) {
  runnerState.status = 'completed';
  runnerState.summary = {
    passed: result.passedRequests,
    failed: result.failedRequests,
    skipped: result.skippedRequests,
    totalDuration: result.totalDuration,
  };
}

export function setCancelled() {
  runnerState.status = 'cancelled';
}

export function updateConfig(updates: Partial<CollectionRunConfig>) {
  runnerState.config = { ...runnerState.config, ...updates };
}

export function resetRunner() {
  runnerState.status = 'idle';
  runnerState.results = [];
  runnerState.progress = { current: 0, total: 0, requestName: '' };
  runnerState.summary = { passed: 0, failed: 0, skipped: 0, totalDuration: 0 };
  runnerState.resultFilter = 'all';
  runnerState.expandedResultId = null;
}

export function toggleRequestEnabled(requestId: string) {
  runnerState.requests = runnerState.requests.map(r =>
    r.id === requestId ? { ...r, enabled: !r.enabled } : r
  );
}

export function toggleAllRequests(enabled: boolean) {
  runnerState.requests = runnerState.requests.map(r => ({ ...r, enabled }));
}

export function reorderRequest(fromIdx: number, toIdx: number) {
  const requests = [...runnerState.requests];
  const [moved] = requests.splice(fromIdx, 1);
  requests.splice(toIdx, 0, moved);
  runnerState.requests = requests;
}

export function setResultFilter(filter: ResultFilter) {
  runnerState.resultFilter = filter;
}

export function setExpandedResult(id: string | null) {
  runnerState.expandedResultId = runnerState.expandedResultId === id ? null : id;
}

export function getEnabledRequests() {
  return runnerState.requests.filter(r => r.enabled);
}

export function getEnabledRequestIds(): string[] {
  return runnerState.requests.filter(r => r.enabled).map(r => r.id);
}

export function setDataFile(info: DataFileInfo) {
  runnerState.dataFile = info;
  runnerState.config = { ...runnerState.config, dataFile: info.path, dataFileType: info.type };
}

export function clearDataFile() {
  runnerState.dataFile = undefined;
  runnerState.config = { ...runnerState.config, dataFile: undefined, dataFileType: undefined, iterations: undefined };
}

export function setIterationLimit(limit: number) {
  runnerState.config = { ...runnerState.config, iterations: limit };
}

// --- Runner History ---

export const historyState = $state<{
  runHistory: RunnerHistoryEntry[];
  detailResult: (CollectionRunResult & { id: string }) | null;
  showingDetail: boolean;
}>({
  runHistory: [],
  detailResult: null,
  showingDetail: false,
});

export function setRunHistory(entries: RunnerHistoryEntry[]) {
  historyState.runHistory = entries;
}

export function setHistoryDetail(result: (CollectionRunResult & { id: string }) | null) {
  historyState.detailResult = result;
  historyState.showingDetail = result !== null;
}

export function clearHistoryDetail() {
  historyState.detailResult = null;
  historyState.showingDetail = false;
}
