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
  // If string contains only safe characters and doesn't start with '-' (to prevent flag injection), return as-is
  if (/^[a-zA-Z0-9_./:@=]+$/.test(str) && !str.startsWith('-')) {
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
  // One line per option: a flag stays on the same line as its value
  const add = (...tokens: string[]) => parts.push(tokens.join(' '));

  // Add method (only if not GET)
  if (options.method !== 'GET') {
    add('-X', options.method);
  }

  // Build URL with query params
  const fullUrl = buildUrl(options.url, options.params);
  add(shellEscape(fullUrl));

  // Add headers
  const enabledHeaders = options.headers.filter(h => h.enabled && h.key);
  enabledHeaders.forEach(h => {
    add('-H', shellEscape(`${h.key}: ${h.value}`));
  });

  // Add authentication
  if (options.auth.type === 'basic' && options.auth.username) {
    const authString = `${options.auth.username}:${options.auth.password || ''}`;
    add('-u', shellEscape(authString));
  } else if (options.auth.type === 'bearer' && options.auth.token) {
    // Check if Authorization header already exists
    const hasAuthHeader = enabledHeaders.some(h => h.key.toLowerCase() === 'authorization');
    if (!hasAuthHeader) {
      add('-H', shellEscape(`Authorization: Bearer ${options.auth.token}`));
    }
  } else if (options.auth.type === 'oauth2') {
    // OAuth2: show bearer placeholder
    const hasAuthHeader = enabledHeaders.some(h => h.key.toLowerCase() === 'authorization');
    if (!hasAuthHeader) {
      add('-H', shellEscape('Authorization: Bearer <access_token>'));
    }
  } else if (options.auth.type === 'apikey' && options.auth.apiKeyName && options.auth.apiKeyValue) {
    if (options.auth.apiKeyIn === 'query') {
      // Replace the URL in parts with one that includes the API key as query param
      const urlIndex = parts.indexOf(shellEscape(fullUrl));
      const separator = fullUrl.includes('?') ? '&' : '?';
      const newUrl = fullUrl + separator + encodeURIComponent(options.auth.apiKeyName) + '=' + encodeURIComponent(options.auth.apiKeyValue);
      if (urlIndex !== -1) {
        parts[urlIndex] = shellEscape(newUrl);
      }
    } else {
      add('-H', shellEscape(`${options.auth.apiKeyName}: ${options.auth.apiKeyValue}`));
    }
  }

  // Add body
  if (options.body.type === 'binary' && options.body.content) {
    add('--data-binary', `@${shellEscape(options.body.content)}`);
  } else if (options.body.type !== 'none' && options.body.content) {
    const method = options.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      // Check if Content-Type header already exists
      const hasContentType = enabledHeaders.some(h => h.key.toLowerCase() === 'content-type');

      if (options.body.type === 'json') {
        if (!hasContentType) {
          add('-H', shellEscape('Content-Type: application/json'));
        }
        add('-d', shellEscape(options.body.content));
      } else if (options.body.type === 'text') {
        if (!hasContentType) {
          add('-H', shellEscape('Content-Type: text/plain'));
        }
        add('-d', shellEscape(options.body.content));
      } else if (options.body.type === 'x-www-form-urlencoded') {
        if (!hasContentType) {
          add('-H', shellEscape('Content-Type: application/x-www-form-urlencoded'));
        }
        // Parse form data and convert to URL-encoded format
        try {
          const formItems = JSON.parse(options.body.content);
          const formData = formItems
            .filter((item: any) => item.enabled && item.key)
            .map((item: any) => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value || '')}`)
            .join('&');
          add('-d', shellEscape(formData));
        } catch {
          add('-d', shellEscape(options.body.content));
        }
      } else if (options.body.type === 'form-data') {
        // Parse form data items (supports file fields)
        try {
          const formItems = JSON.parse(options.body.content);
          formItems
            .filter((item: any) => item.enabled && item.key)
            .forEach((item: any) => {
              if (item.fieldType === 'file' && item.value) {
                const mimeType = item.fileMimeType ? `;type=${item.fileMimeType}` : '';
                add('-F', shellEscape(`${item.key}=@${item.value}${mimeType}`));
              } else {
                add('-F', shellEscape(`${item.key}=${item.value || ''}`));
              }
            });
        } catch {
          add('-d', shellEscape(options.body.content));
        }
      }
    }
  }

  return parts.join(' \\\n  ');
}
