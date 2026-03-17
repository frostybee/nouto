/**
 * HTTP-related utility functions
 */

import { substituteVariables, collectionScopedHeaders } from '../stores/environment.svelte';
import { substitutePathParams } from '@nouto/core';
import type { AuthState, BodyState, KeyValue, PathParam } from '../types';
/**
 * Apply path parameter and variable substitution to URL, params, headers, body,
 * and auth fields before sending.
 * Path params ({param}) are substituted first, then environment variables ({{envVar}}).
 * Returns shallow copies with substituted values - does not mutate the originals.
 */
export function resolveRequestVariables(
  url: string,
  body: BodyState,
  auth: AuthState,
  pathParams?: PathParam[],
  params?: KeyValue[],
  headers?: KeyValue[]
): { url: string; body: BodyState; auth: AuthState; params?: KeyValue[]; headers?: KeyValue[]; pathParams?: PathParam[] } {
  // Substitute path params first, then environment variables
  let resolvedUrl = pathParams?.length ? substitutePathParams(url, pathParams) : url;
  resolvedUrl = substituteVariables(resolvedUrl);
  // Auto-prepend http:// if no protocol specified (matches Postman/Insomnia behavior)
  if (resolvedUrl && !/^[\w+.-]+:\/\//.test(resolvedUrl)) {
    resolvedUrl = 'http://' + resolvedUrl;
  }

  const resolvedBody = { ...body };
  if (resolvedBody.content) resolvedBody.content = substituteVariables(resolvedBody.content);
  if (resolvedBody.graphqlVariables) resolvedBody.graphqlVariables = substituteVariables(resolvedBody.graphqlVariables);

  const resolvedAuth = { ...auth };
  if (resolvedAuth.username) resolvedAuth.username = substituteVariables(resolvedAuth.username);
  if (resolvedAuth.password) resolvedAuth.password = substituteVariables(resolvedAuth.password);
  if (resolvedAuth.token) resolvedAuth.token = substituteVariables(resolvedAuth.token);
  if (resolvedAuth.apiKeyName) resolvedAuth.apiKeyName = substituteVariables(resolvedAuth.apiKeyName);
  if (resolvedAuth.apiKeyValue) resolvedAuth.apiKeyValue = substituteVariables(resolvedAuth.apiKeyValue);

  // Substitute variables in path param values (for history/display; URL already resolved above)
  const resolvedPathParams = pathParams?.map(p => ({
    ...p,
    value: substituteVariables(p.value),
  }));

  // Substitute variables in query params
  const resolvedParams = params?.map(p => ({
    ...p,
    key: substituteVariables(p.key),
    value: substituteVariables(p.value),
  }));

  // Merge collection/folder scoped headers with request headers (request wins on conflict)
  const scopedHeaders = collectionScopedHeaders();
  const mergedHeaderMap = new Map<string, KeyValue>();
  for (const h of scopedHeaders) {
    if (h.enabled && h.key) {
      mergedHeaderMap.set(h.key.toLowerCase(), { id: '', key: h.key, value: h.value, enabled: true });
    }
  }
  if (headers) {
    for (const h of headers) {
      if (h.key && h.enabled) {
        mergedHeaderMap.set(h.key.toLowerCase(), h);
      }
    }
  }
  const allHeaders = Array.from(mergedHeaderMap.values());

  // Substitute variables in headers
  const resolvedHeaders = allHeaders.map(h => ({
    ...h,
    key: substituteVariables(h.key),
    value: substituteVariables(h.value),
  }));

  return { url: resolvedUrl, body: resolvedBody, auth: resolvedAuth, params: resolvedParams, headers: resolvedHeaders, pathParams: resolvedPathParams };
}

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
  return 'var(--hf-descriptionForeground)';
}
