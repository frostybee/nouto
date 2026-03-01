import { writable, derived } from 'svelte/store';
import type { HttpMethod, KeyValue, PathParam, AuthState, BodyState, Assertion, AuthInheritance, ScriptConfig, SslConfig } from '../types';

// Re-export for backwards compatibility
export type { HttpMethod, KeyValue, AuthState, BodyState };

export interface RequestState {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  pathParams: PathParam[];
  headers: KeyValue[];
  auth: AuthState;
  body: BodyState;
  assertions: Assertion[];
  authInheritance?: AuthInheritance;
  scripts: ScriptConfig;
  ssl?: SslConfig;
  description: string;
}

const initialState: RequestState = {
  method: 'GET',
  url: '',
  params: [],
  pathParams: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  assertions: [],
  scripts: { preRequest: '', postResponse: '' },
  description: '',
};

export const request = writable<RequestState>(initialState);

export interface RequestContext {
  panelId: string;
  requestId: string;
  collectionId: string;
  collectionName: string;
}

export const originalRequest = writable<RequestState | null>(null);
export const requestContext = writable<RequestContext | null>(null);

export const isDirty = derived(
  [request, originalRequest, requestContext],
  ([$request, $originalRequest, $requestContext]) => {
    if (!$requestContext?.collectionId || !$originalRequest) return false;
    return JSON.stringify($request) !== JSON.stringify($originalRequest);
  }
);

// Deep clone helper to prevent state mutation via shared references
function clone<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

export function setOriginalSnapshot(state: RequestState) {
  originalRequest.set(clone(state));
}

export function clearOriginalSnapshot() {
  originalRequest.set(null);
}

export function setRequestContext(ctx: RequestContext) {
  requestContext.set(ctx);
}

export function clearRequestContext() {
  requestContext.set(null);
}

// Convenience functions
export function setMethod(method: HttpMethod) {
  request.update((state) => ({ ...state, method }));
}

export function setUrl(url: string) {
  request.update((state) => ({ ...state, url }));
}

export function setParams(params: KeyValue[]) {
  request.update((state) => ({ ...state, params: clone(params) }));
}

export function setPathParams(pathParams: PathParam[]) {
  request.update((state) => ({ ...state, pathParams: clone(pathParams) }));
}

export function setUrlAndParams(url: string, params: KeyValue[]) {
  request.update((state) => ({ ...state, url, params: clone(params) }));
}

export function setHeaders(headers: KeyValue[]) {
  request.update((state) => ({ ...state, headers: clone(headers) }));
}

export function setAuth(auth: AuthState) {
  request.update((state) => ({ ...state, auth: clone(auth) }));
}

export function setBody(body: BodyState) {
  request.update((state) => ({ ...state, body: clone(body) }));
}

export function setAssertions(assertions: Assertion[]) {
  request.update((state) => ({ ...state, assertions: clone(assertions) }));
}

export function setAuthInheritance(authInheritance: AuthInheritance | undefined) {
  request.update((state) => ({ ...state, authInheritance }));
}

export function setScripts(scripts: ScriptConfig) {
  request.update((state) => ({ ...state, scripts: clone(scripts) }));
}

export function setDescription(description: string) {
  request.update((state) => ({ ...state, description }));
}

export function setSsl(ssl: SslConfig | undefined) {
  request.update((state) => ({ ...state, ssl: ssl ? clone(ssl) : undefined }));
}

export function resetRequest() {
  request.set(clone(initialState));
  clearOriginalSnapshot();
  clearRequestContext();
}
