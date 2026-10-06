/**
 * Readable messages for failed requests. Node reports a failed connect to a
 * host with several addresses (localhost is ::1 and 127.0.0.1) as an
 * AggregateError with an empty message, so code that reads `.message` alone
 * shows nothing. Browser-safe: no Node imports.
 */
import type { ErrorInfo } from '../types';

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  errors?: unknown;
  cause?: unknown;
  name?: unknown;
}

const MAX_DEPTH = 3;

function asErrorLike(value: unknown): ErrorLike | undefined {
  return value !== null && typeof value === 'object' ? (value as ErrorLike) : undefined;
}

function describe(error: unknown, depth: number): string {
  if (typeof error === 'string') return error.trim();
  const e = asErrorLike(error);
  if (!e) return error == null ? '' : String(error);

  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (message) return message;
  if (depth < MAX_DEPTH && Array.isArray(e.errors)) {
    const inner = [...new Set(e.errors.map((err) => describe(err, depth + 1)).filter(Boolean))];
    if (inner.length) return inner.join('; ');
  }
  if (depth < MAX_DEPTH && e.cause !== undefined) {
    const cause = describe(e.cause, depth + 1);
    if (cause) return cause;
  }
  if (typeof e.code === 'string' && e.code) return e.code;
  // A bare "AggregateError" or "[object Object]" says nothing
  const text = String(error);
  return /^(\[object \w+\]|\w*Error)$/.test(text) ? '' : text;
}

/**
 * A message for any thrown value: its own message, else its inner errors'
 * messages joined with "; ", else its cause or code. Never empty.
 */
export function describeError(error: unknown): string {
  return describe(error, 0) || 'Unknown error';
}

/**
 * Returns `error` when it already has a message (and abort errors as they
 * are); otherwise a new Error with `describeError`'s message that keeps the
 * original as `cause` along with its `code`, `errno`, `syscall`, and `errors`.
 */
export function toReadableError(error: unknown): Error {
  const e = asErrorLike(error);
  if (e?.name === 'AbortError') return error as Error;
  if (error instanceof Error && error.message.trim()) return error;

  const readable = new Error(describeError(error)) as Error & Record<string, unknown>;
  readable.cause = error;
  if (e) {
    for (const key of ['code', 'errno', 'syscall', 'errors']) {
      const value = (e as Record<string, unknown>)[key];
      if (value !== undefined) readable[key] = value;
    }
  }
  return readable;
}

/** Categorizes a request error message and suggests what to check. */
export function categorizeError(errorMessage: string, statusCode?: number): ErrorInfo {
  const lowerMessage = errorMessage.toLowerCase();

  // Refused and reset come before timeout: on Windows, a refused localhost
  // connect can report ETIMEDOUT for ::1 next to ECONNREFUSED for 127.0.0.1
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

  if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout') || lowerMessage.includes('timed out')) {
    return {
      category: 'timeout',
      message: 'Request timed out',
      suggestion: 'The server took too long to respond. Try increasing the timeout or check if the server is under heavy load.',
    };
  }

  if (lowerMessage.includes('enotfound') || lowerMessage.includes('getaddrinfo') || lowerMessage.includes('dns')) {
    return {
      category: 'dns',
      message: 'Could not resolve hostname',
      suggestion: 'Check if the URL is correct. The domain name could not be resolved to an IP address.',
    };
  }

  if (lowerMessage.includes('ssl') || lowerMessage.includes('certificate') || lowerMessage.includes('cert') ||
      lowerMessage.includes('self signed') || lowerMessage.includes('unable to verify')) {
    return {
      category: 'ssl',
      message: 'SSL/TLS certificate error',
      suggestion: 'The server has an invalid or self-signed certificate. For development, you may need to configure certificate trust.',
    };
  }

  if (lowerMessage.includes('enetunreach') || lowerMessage.includes('network unreachable')) {
    return {
      category: 'network',
      message: 'Network unreachable',
      suggestion: 'Check your internet connection. The target network cannot be reached.',
    };
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('socket') || lowerMessage.includes('epipe')) {
    return {
      category: 'network',
      message: 'Network error',
      suggestion: 'A network error occurred. Check your internet connection and firewall settings.',
    };
  }

  if (statusCode && statusCode >= 500) {
    return {
      category: 'server',
      message: `Server error (${statusCode})`,
      suggestion: 'The server encountered an error. This is typically a server-side issue that needs to be fixed by the API provider.',
    };
  }

  return {
    category: 'unknown',
    message: errorMessage || 'An unknown error occurred',
    suggestion: 'An unexpected error occurred. Check the error details for more information.',
  };
}

/**
 * Adds `errorInfo` to a failed response that lacks it, from its `data`: a
 * message string or `{ error: message }`. Backends that categorize their own
 * errors (the VS Code extension) pass through unchanged.
 */
export function ensureErrorInfo<T extends { error?: boolean; errorInfo?: ErrorInfo; data?: unknown }>(
  response: T
): T & { errorInfo?: ErrorInfo } {
  if (!response?.error || response.errorInfo) return response;
  const data = response.data as { error?: unknown } | string | undefined;
  const message = typeof data === 'string' ? data : describeError(data?.error ?? data);
  return { ...response, errorInfo: categorizeError(message) };
}
