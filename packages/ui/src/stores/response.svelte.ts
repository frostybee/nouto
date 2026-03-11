import { capturePreviousResponse } from './responseDiff.svelte';
import type { TimingData, TimelineEvent, TimelineEventCategory } from '../types';

// Re-export for consumers that import from this file
export type { TimingData, TimelineEvent, TimelineEventCategory };

export type ErrorCategory = 'network' | 'timeout' | 'dns' | 'ssl' | 'connection' | 'server' | 'unknown';

export interface ErrorInfo {
  category: ErrorCategory;
  message: string;
  suggestion: string;
}

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
  contentCategory?: string;
  httpVersion?: string;
  remoteAddress?: string;
  requestHeaders?: Record<string, string>;
  requestUrl?: string;
  sizeBreakdown?: SizeBreakdown;
}

let _response = $state<{ value: ResponseState | null }>({ value: null });
let _isLoading = $state<{ value: boolean }>({ value: false });
let _downloadProgress = $state<{ value: { loaded: number; total: number | null } | null }>({ value: null });

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Categorize an error message and provide actionable suggestions
 */
export function categorizeError(errorMessage: string, statusCode?: number): ErrorInfo {
  const lowerMessage = errorMessage.toLowerCase();

  // Timeout errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout') || lowerMessage.includes('timed out')) {
    return {
      category: 'timeout',
      message: 'Request timed out',
      suggestion: 'The server took too long to respond. Try increasing the timeout or check if the server is under heavy load.',
    };
  }

  // DNS errors
  if (lowerMessage.includes('enotfound') || lowerMessage.includes('getaddrinfo') || lowerMessage.includes('dns')) {
    return {
      category: 'dns',
      message: 'Could not resolve hostname',
      suggestion: 'Check if the URL is correct. The domain name could not be resolved to an IP address.',
    };
  }

  // SSL/TLS errors
  if (lowerMessage.includes('ssl') || lowerMessage.includes('certificate') || lowerMessage.includes('cert') ||
      lowerMessage.includes('self signed') || lowerMessage.includes('unable to verify')) {
    return {
      category: 'ssl',
      message: 'SSL/TLS certificate error',
      suggestion: 'The server has an invalid or self-signed certificate. For development, you may need to configure certificate trust.',
    };
  }

  // Connection errors
  if (lowerMessage.includes('econnrefused') || lowerMessage.includes('connection refused')) {
    return {
      category: 'connection',
      message: 'Connection refused',
      suggestion: 'The server is not accepting connections. Check if the server is running and listening on the correct port.',
    };
  }

  if (lowerMessage.includes('econnreset') || lowerMessage.includes('connection reset')) {
    return {
      category: 'connection',
      message: 'Connection was reset',
      suggestion: 'The connection was unexpectedly closed by the server. This might be a firewall issue or server crash.',
    };
  }

  if (lowerMessage.includes('enetunreach') || lowerMessage.includes('network unreachable')) {
    return {
      category: 'network',
      message: 'Network unreachable',
      suggestion: 'Check your internet connection. The target network cannot be reached.',
    };
  }

  // General network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('socket') || lowerMessage.includes('epipe')) {
    return {
      category: 'network',
      message: 'Network error',
      suggestion: 'A network error occurred. Check your internet connection and firewall settings.',
    };
  }

  // Server errors based on status code
  if (statusCode && statusCode >= 500) {
    return {
      category: 'server',
      message: `Server error (${statusCode})`,
      suggestion: 'The server encountered an error. This is typically a server-side issue that needs to be fixed by the API provider.',
    };
  }

  // Unknown error
  return {
    category: 'unknown',
    message: errorMessage || 'An unknown error occurred',
    suggestion: 'An unexpected error occurred. Check the error details for more information.',
  };
}
