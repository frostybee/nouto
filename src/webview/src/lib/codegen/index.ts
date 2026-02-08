import type { HttpMethod, KeyValue, AuthState, BodyState } from '../../types';
import { target as curlTarget } from './curl';
import { target as fetchTarget } from './javascript-fetch';
import { target as axiosTarget } from './javascript-axios';
import { target as pythonTarget } from './python-requests';
import { target as csharpTarget } from './csharp';
import { target as goTarget } from './go';
import { target as javaTarget } from './java';
import { target as phpTarget } from './php';
import { target as swiftTarget } from './swift';
import { target as dartTarget } from './dart';
import { target as powershellTarget } from './powershell';

export interface CodegenRequest {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  auth: AuthState;
  body: BodyState;
}

export interface CodegenTarget {
  id: string;
  label: string;
  language: string; // CodeMirror/VS Code language id
  generate: (request: CodegenRequest) => string;
}

const targets: CodegenTarget[] = [
  curlTarget,
  fetchTarget,
  axiosTarget,
  pythonTarget,
  csharpTarget,
  goTarget,
  javaTarget,
  phpTarget,
  swiftTarget,
  dartTarget,
  powershellTarget,
];

export function getTargets(): CodegenTarget[] {
  return targets;
}

export function getTarget(id: string): CodegenTarget | undefined {
  return targets.find(t => t.id === id);
}

export function generateCode(targetId: string, request: CodegenRequest): string {
  const target = getTarget(targetId);
  if (!target) return `// Unknown target: ${targetId}`;
  return target.generate(request);
}

// Helper: build full URL with query params
export function buildFullUrl(url: string, params: KeyValue[]): string {
  const enabled = params.filter(p => p.enabled && p.key);
  if (enabled.length === 0) return url;
  const qs = enabled.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  return url + (url.includes('?') ? '&' : '?') + qs;
}

// Helper: get enabled headers including auth
export function getEffectiveHeaders(request: CodegenRequest): Array<{ key: string; value: string }> {
  const headers: Array<{ key: string; value: string }> = [];

  // User headers
  for (const h of request.headers) {
    if (h.enabled && h.key) headers.push({ key: h.key, value: h.value });
  }

  // Auth headers
  if (request.auth.type === 'bearer' && request.auth.token) {
    if (!headers.some(h => h.key.toLowerCase() === 'authorization')) {
      headers.push({ key: 'Authorization', value: `Bearer ${request.auth.token}` });
    }
  } else if (request.auth.type === 'apikey' && request.auth.apiKeyName && request.auth.apiKeyValue && request.auth.apiKeyIn !== 'query') {
    headers.push({ key: request.auth.apiKeyName, value: request.auth.apiKeyValue });
  } else if (request.auth.type === 'oauth2' && request.auth.oauth2) {
    // OAuth tokens applied at runtime, show placeholder
    headers.push({ key: 'Authorization', value: 'Bearer <access_token>' });
  }

  // Content-Type from body
  if (request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const hasContentType = headers.some(h => h.key.toLowerCase() === 'content-type');
    if (!hasContentType) {
      if (request.body.type === 'json') headers.push({ key: 'Content-Type', value: 'application/json' });
      else if (request.body.type === 'text') headers.push({ key: 'Content-Type', value: 'text/plain' });
      else if (request.body.type === 'x-www-form-urlencoded') headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
      else if (request.body.type === 'graphql') headers.push({ key: 'Content-Type', value: 'application/json' });
    }
  }

  return headers;
}

// Helper: get URL with API key query param if needed
export function getUrlWithApiKey(request: CodegenRequest): string {
  let url = request.url;
  if (request.auth.type === 'apikey' && request.auth.apiKeyIn === 'query' && request.auth.apiKeyName && request.auth.apiKeyValue) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}${encodeURIComponent(request.auth.apiKeyName)}=${encodeURIComponent(request.auth.apiKeyValue)}`;
  }
  return buildFullUrl(url, request.params);
}

// Helper: get body string for code generation
export function getBodyContent(request: CodegenRequest): string | null {
  if (request.body.type === 'none' || !['POST', 'PUT', 'PATCH'].includes(request.method)) return null;
  if (request.body.type === 'binary') return null; // Handled separately
  if (!request.body.content) return null;

  if (request.body.type === 'graphql') {
    const payload: Record<string, any> = { query: request.body.content };
    if (request.body.graphqlVariables) {
      try { payload.variables = JSON.parse(request.body.graphqlVariables); } catch {}
    }
    if (request.body.graphqlOperationName) {
      payload.operationName = request.body.graphqlOperationName;
    }
    return JSON.stringify(payload, null, 2);
  }

  if (request.body.type === 'form-data' || request.body.type === 'x-www-form-urlencoded') {
    try {
      const items = JSON.parse(request.body.content);
      if (request.body.type === 'x-www-form-urlencoded') {
        return items
          .filter((i: any) => i.enabled && i.key)
          .map((i: any) => `${encodeURIComponent(i.key)}=${encodeURIComponent(i.value || '')}`)
          .join('&');
      }
      return null; // form-data handled per-language
    } catch {
      return request.body.content;
    }
  }

  return request.body.content;
}

// Helper: parse form data items from body content
export function getFormDataItems(request: CodegenRequest): Array<{ key: string; value: string; fieldType?: string; fileName?: string }> {
  if (!request.body.content) return [];
  try {
    const items = JSON.parse(request.body.content);
    return items
      .filter((i: any) => i.enabled && i.key)
      .map((i: any) => ({ key: i.key, value: i.value || '', fieldType: i.fieldType, fileName: i.fileName }));
  } catch {
    return [];
  }
}

// Helper: get basic auth credentials
export function getBasicAuth(request: CodegenRequest): { username: string; password: string } | null {
  if (request.auth.type !== 'basic' || !request.auth.username) return null;
  return { username: request.auth.username, password: request.auth.password || '' };
}

