/**
 * Common formatting utilities for display values
 */

/**
 * Format a timestamp as a relative time string (e.g., "Just now", "5m ago", "2d ago")
 */
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `${diffWeeks}w ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format a byte size to a human-readable string (B, KB, MB)
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Strip protocol and trailing slash from URL for display
 */
export function getDisplayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    || 'No URL';
}

/**
 * Extract a sensible name from a URL (last path segment or hostname)
 */
export function getNameFromUrl(url: string): string {
  const path = extractPathname(url);
  if (path === '/') {
    // Try to get hostname
    try {
      return new URL(url).hostname || 'New Request';
    } catch {
      return 'New Request';
    }
  }
  return path.split('/').filter(Boolean).pop() || 'New Request';
}

/**
 * Extract the pathname from a URL string WITHOUT percent-encoding.
 * `new URL()` encodes characters like `{` and `}` to `%7B`/`%7D`,
 * which corrupts path parameter placeholders (e.g. `{id}`).
 * This uses simple string parsing to preserve the raw path.
 */
export function extractPathname(url: string): string {
  // Find protocol end
  const protoEnd = url.indexOf('://');
  if (protoEnd !== -1) {
    const pathStart = url.indexOf('/', protoEnd + 3);
    if (pathStart === -1) return '/';
    const pathEnd = url.search(/[?#]/);
    return pathEnd !== -1 && pathEnd > pathStart ? url.substring(pathStart, pathEnd) : url.substring(pathStart);
  }
  // No protocol — try to find path start
  const match = url.match(/\/[^\s?#]*/);
  return match ? match[0] : url;
}
