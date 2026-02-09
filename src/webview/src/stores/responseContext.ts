import { writable, get } from 'svelte/store';
import type { ResponseData } from '../types';

// ============================================
// Response Context Store
// ============================================
// Stores response data for request chaining
// Allows using {{$response.body.token}} syntax in subsequent requests

interface ResponseContext {
  responses: Map<string, ResponseData>; // By request ID
  lastResponse: ResponseData | null; // For {{$response.xxx}}
  nameToId: Map<string, string>; // Request name → request ID
}

// Create the store
const responseContext = writable<ResponseContext>({
  responses: new Map(),
  lastResponse: null,
  nameToId: new Map(),
});

/**
 * Store a response for a given request ID
 * Also sets it as the last response for {{$response.xxx}} usage
 */
export function storeResponse(requestId: string, response: ResponseData, requestName?: string): void {
  responseContext.update((ctx) => {
    const newResponses = new Map(ctx.responses);
    newResponses.set(requestId, response);
    const newNameToId = new Map(ctx.nameToId);
    if (requestName) {
      newNameToId.set(requestName, requestId);
    }
    return {
      responses: newResponses,
      lastResponse: response,
      nameToId: newNameToId,
    };
  });
}

/**
 * Get a response by request ID
 */
export function getResponse(requestId: string): ResponseData | null {
  const ctx = get(responseContext);
  return ctx.responses.get(requestId) || null;
}

/**
 * Get the last response (for {{$response.xxx}} usage)
 */
export function getLastResponse(): ResponseData | null {
  return get(responseContext).lastResponse;
}

/**
 * Get a value from the last response using a dot-notation path
 * Supports: body.data.token, headers.authorization, status, etc.
 * Also supports array indexing: body.users[0].name
 */
export function getResponseValue(path: string): any {
  const ctx = get(responseContext);
  if (!ctx.lastResponse) return undefined;

  const parts = parsePath(path);
  if (parts.length === 0) return undefined;

  const firstPart = parts[0];

  // Handle different top-level response fields
  switch (firstPart) {
    case 'body':
    case 'data':
      // body and data are aliases for response.data
      return getNestedValue(ctx.lastResponse.data, parts.slice(1));

    case 'headers':
      return getNestedValue(ctx.lastResponse.headers, parts.slice(1));

    case 'status':
      return ctx.lastResponse.status;

    case 'statusText':
      return ctx.lastResponse.statusText;

    case 'duration':
      return ctx.lastResponse.duration;

    case 'size':
      return ctx.lastResponse.size;

    default:
      // Try to get from body/data by default
      return getNestedValue(ctx.lastResponse.data, parts);
  }
}

/**
 * Get a value from a specific request's response
 */
export function getResponseValueById(requestId: string, path: string): any {
  const response = getResponse(requestId);
  if (!response) return undefined;

  const parts = parsePath(path);
  if (parts.length === 0) return undefined;

  const firstPart = parts[0];

  switch (firstPart) {
    case 'body':
    case 'data':
      return getNestedValue(response.data, parts.slice(1));

    case 'headers':
      return getNestedValue(response.headers, parts.slice(1));

    case 'status':
      return response.status;

    case 'statusText':
      return response.statusText;

    default:
      return getNestedValue(response.data, parts);
  }
}

/**
 * Get a value from a named request's response
 */
export function getResponseValueByName(requestName: string, path: string): any {
  const ctx = get(responseContext);
  const requestId = ctx.nameToId.get(requestName);
  if (!requestId) return undefined;
  return getResponseValueById(requestId, path);
}

/**
 * Clear all stored responses
 */
export function clearResponseContext(): void {
  responseContext.set({
    responses: new Map(),
    lastResponse: null,
    nameToId: new Map(),
  });
}

/**
 * Clear a specific response by request ID
 */
export function clearResponse(requestId: string): void {
  responseContext.update((ctx) => {
    const newResponses = new Map(ctx.responses);
    newResponses.delete(requestId);
    return {
      ...ctx,
      responses: newResponses,
    };
  });
}

// ============================================
// Path Parsing and Value Resolution
// ============================================

/**
 * Parse a dot-notation path with array indexing support
 * e.g., "body.users[0].name" -> ["body", "users", "0", "name"]
 */
function parsePath(path: string): string[] {
  if (!path) return [];

  const parts: string[] = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '.') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else if (char === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      // Find the closing bracket
      const closingIndex = path.indexOf(']', i);
      if (closingIndex > i + 1) {
        const index = path.substring(i + 1, closingIndex);
        parts.push(index);
        i = closingIndex;
      }
    } else if (char !== ']') {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Get a nested value from an object using parsed path parts
 */
function getNestedValue(obj: any, pathParts: string[]): any {
  if (obj === undefined || obj === null) return undefined;
  if (pathParts.length === 0) return obj;

  let current = obj;

  for (const part of pathParts) {
    if (current === undefined || current === null) {
      return undefined;
    }

    // Check if part is a numeric index
    const index = parseInt(part, 10);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else if (typeof current === 'object') {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

// Export the store for reactive usage
export { responseContext };
