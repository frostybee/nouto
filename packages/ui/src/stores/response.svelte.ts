import { capturePreviousResponse } from './responseDiff.svelte';
import type { TimingData, TimelineEvent, TimelineEventCategory, RedirectHop, ContentCategory, ErrorInfo } from '../types';

// Re-export for consumers that import from this file
export type { TimingData, TimelineEvent, TimelineEventCategory };
export type { ErrorCategory, ErrorInfo } from '../types';
export { categorizeError } from '@nouto/core';

export interface SizeBreakdown {
  responseHeadersSize: number;
  responseBodySize: number;
  requestHeadersSize: number;
  requestBodySize: number;
}

export interface ResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  duration: number;
  size: number;
  error?: boolean;
  errorInfo?: ErrorInfo;
  timing?: TimingData;
  timeline?: TimelineEvent[];
  contentCategory?: ContentCategory;
  httpVersion?: string;
  remoteAddress?: string;
  requestHeaders?: Record<string, string>;
  requestUrl?: string;
  sizeBreakdown?: SizeBreakdown;
  redirectChain?: RedirectHop[];
}

const _response = $state<{ value: ResponseState | null }>({ value: null });
const _isLoading = $state<{ value: boolean }>({ value: false });
const _downloadProgress = $state<{ value: { loaded: number; total: number | null } | null }>({ value: null });

export function response() { return _response.value; }
export function isLoading() { return _isLoading.value; }
export function downloadProgress() { return _downloadProgress.value; }

export function setDownloadProgress(loaded: number, total: number | null) {
  _downloadProgress.value = { loaded, total };
}

export function setResponse(res: ResponseState) {
  // Capture current response as "previous" before overwriting
  const current = _response.value;
  if (current?.data && !current.error) {
    capturePreviousResponse(current.data);
  }

  _response.value = res;
  _isLoading.value = false;
  _downloadProgress.value = null;
}

export function setLoading(loading: boolean) {
  _isLoading.value = loading;
  if (!loading) {
    _downloadProgress.value = null;
  }
}

export function clearResponse() {
  _response.value = null;
  _downloadProgress.value = null;
}

// Bulk restore for tab switching
export function bulkSetResponseState(data: {
  response: ResponseState | null;
  isLoading?: boolean;
  downloadProgress?: { loaded: number; total: number | null } | null;
}) {
  _response.value = data.response;
  _isLoading.value = data.isLoading ?? false;
  _downloadProgress.value = data.downloadProgress ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
