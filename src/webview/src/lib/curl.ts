// cURL command generator for HTTP requests

import type { HttpMethod, KeyValue, AuthState, BodyState } from '../types';

export interface CurlOptions {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  auth: AuthState;
  body: BodyState;
}

/**
 * Escape a string for use in a shell command
 */
function shellEscape(str: string): string {
  // If string contains only safe characters, return as-is
  if (/^[a-zA-Z0-9_./:@=-]+$/.test(str)) {
    return str;
  }
  // Otherwise, wrap in single quotes and escape any single quotes
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Build URL with query parameters
 */
function buildUrl(baseUrl: string, params: KeyValue[]): string {
  const enabledParams = params.filter(p => p.enabled && p.key);
  if (enabledParams.length === 0) return baseUrl;

  const searchParams = new URLSearchParams();
  enabledParams.forEach(p => {
    searchParams.append(p.key, p.value);
  });

  const separator = baseUrl.includes('?') ? '&' : '?';
  return baseUrl + separator + searchParams.toString();
}

/**
 * Generate a cURL command from request options
 */
export function generateCurl(options: CurlOptions): string {
  const parts: string[] = ['curl'];

  // Add method (only if not GET)
  if (options.method !== 'GET') {
    parts.push('-X', options.method);
  }

  // Build URL with query params
  const fullUrl = buildUrl(options.url, options.params);
  parts.push(shellEscape(fullUrl));

  // Add headers
  const enabledHeaders = options.headers.filter(h => h.enabled && h.key);
  enabledHeaders.forEach(h => {
    parts.push('-H', shellEscape(`${h.key}: ${h.value}`));
  });

  // Add authentication
  if (options.auth.type === 'basic' && options.auth.username) {
    const authString = `${options.auth.username}:${options.auth.password || ''}`;
    parts.push('-u', shellEscape(authString));
  } else if (options.auth.type === 'bearer' && options.auth.token) {
    // Check if Authorization header already exists
    const hasAuthHeader = enabledHeaders.some(h => h.key.toLowerCase() === 'authorization');
    if (!hasAuthHeader) {
      parts.push('-H', shellEscape(`Authorization: Bearer ${options.auth.token}`));
    }
  }

  // Add body
  if (options.body.type !== 'none' && options.body.content) {
    const method = options.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      // Check if Content-Type header already exists
      const hasContentType = enabledHeaders.some(h => h.key.toLowerCase() === 'content-type');

      if (options.body.type === 'json') {
        if (!hasContentType) {
          parts.push('-H', shellEscape('Content-Type: application/json'));
        }
        parts.push('-d', shellEscape(options.body.content));
      } else if (options.body.type === 'text') {
        if (!hasContentType) {
          parts.push('-H', shellEscape('Content-Type: text/plain'));
        }
        parts.push('-d', shellEscape(options.body.content));
      } else if (options.body.type === 'x-www-form-urlencoded') {
        if (!hasContentType) {
          parts.push('-H', shellEscape('Content-Type: application/x-www-form-urlencoded'));
        }
        // Parse form data and convert to URL-encoded format
        try {
          const formItems = JSON.parse(options.body.content);
          const formData = formItems
            .filter((item: any) => item.enabled && item.key)
            .map((item: any) => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value || '')}`)
            .join('&');
          parts.push('-d', shellEscape(formData));
        } catch {
          parts.push('-d', shellEscape(options.body.content));
        }
      } else if (options.body.type === 'form-data') {
        // Parse form data items
        try {
          const formItems = JSON.parse(options.body.content);
          formItems
            .filter((item: any) => item.enabled && item.key)
            .forEach((item: any) => {
              parts.push('-F', shellEscape(`${item.key}=${item.value || ''}`));
            });
        } catch {
          parts.push('-d', shellEscape(options.body.content));
        }
      }
    }
  }

  return parts.join(' \\\n  ');
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
