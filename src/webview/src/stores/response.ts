import { writable } from 'svelte/store';

export type ErrorCategory = 'network' | 'timeout' | 'dns' | 'ssl' | 'connection' | 'server' | 'unknown';

export interface ErrorInfo {
  category: ErrorCategory;
  message: string;
  suggestion: string;
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
}

export const response = writable<ResponseState | null>(null);
export const isLoading = writable<boolean>(false);

export function setResponse(res: ResponseState) {
  response.set(res);
  isLoading.set(false);
}

export function setLoading(loading: boolean) {
  isLoading.set(loading);
}

export function clearResponse() {
  response.set(null);
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
