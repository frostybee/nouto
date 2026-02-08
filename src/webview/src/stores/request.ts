import { writable } from 'svelte/store';
import type { HttpMethod, KeyValue, AuthState, BodyState, Assertion, AuthInheritance } from '../types';

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
}

const initialState: RequestState = {
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  assertions: [],
};

export const request = writable<RequestState>(initialState);

// Convenience functions
export function setMethod(method: HttpMethod) {
  request.update((state) => ({ ...state, method }));
}

export function setUrl(url: string) {
  request.update((state) => ({ ...state, url }));
}

export function setParams(params: KeyValue[]) {
  request.update((state) => ({ ...state, params }));
}

export function setHeaders(headers: KeyValue[]) {
  request.update((state) => ({ ...state, headers }));
}

export function setAuth(auth: AuthState) {
  request.update((state) => ({ ...state, auth }));
}

export function setBody(body: BodyState) {
  request.update((state) => ({ ...state, body }));
}

export function setAssertions(assertions: Assertion[]) {
  request.update((state) => ({ ...state, assertions }));
}

export function setAuthInheritance(authInheritance: AuthInheritance | undefined) {
  request.update((state) => ({ ...state, authInheritance }));
}

export function resetRequest() {
  request.set(initialState);
}
