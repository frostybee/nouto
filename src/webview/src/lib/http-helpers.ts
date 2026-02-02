/**
 * HTTP-related utility functions
 */

/**
 * Get a CSS class name based on HTTP status code range
 */
export function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500) return 'server-error';
  return 'unknown';
}

/**
 * Get a CSS color value based on HTTP status code range
 */
export function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'var(--status-success, #49cc90)';
  if (status >= 300 && status < 400) return 'var(--status-redirect, #fca130)';
  if (status >= 400 && status < 500) return 'var(--status-client-error, #f93e3e)';
  if (status >= 500) return 'var(--status-server-error, #f93e3e)';
  return 'var(--vscode-descriptionForeground)';
}
