/**
 * HTTP-related utility functions
 */

import { substituteVariables } from '../stores/environment';
import { substitutePathParams } from '@hivefetch/core';
import type { AuthState, BodyState, PathParam } from '../types';

/**
 * Apply path parameter and variable substitution to URL, body, and auth fields before sending.
 * Path params ({param}) are substituted first, then environment variables ({{envVar}}).
 * Returns shallow copies with substituted values — does not mutate the originals.
 */
export function resolveRequestVariables(
  url: string,
  body: BodyState,
  auth: AuthState,
  pathParams?: PathParam[]
): { url: string; body: BodyState; auth: AuthState } {
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

  return { url: resolvedUrl, body: resolvedBody, auth: resolvedAuth };
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
