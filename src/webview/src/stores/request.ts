import { writable } from 'svelte/store';
import type { HttpMethod, KeyValue, AuthState, BodyState, Assertion, AuthInheritance, ScriptConfig } from '../types';

// Re-export for backwards compatibility
export type { HttpMethod, KeyValue, AuthState, BodyState };

export interface RequestState {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthState;
  body: BodyState;
  assertions: Assertion[];
  authInheritance?: AuthInheritance;
  scripts: ScriptConfig;
}

const initialState: RequestState = {
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  assertions: [],
  scripts: { preRequest: '', postResponse: '' },
};

export const request = writable<RequestState>(initialState);

// Deep clone helper to prevent state mutation via shared references
function clone<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
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

export function resetRequest() {
  request.set(clone(initialState));
}
