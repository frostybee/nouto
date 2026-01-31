import { writable } from 'svelte/store';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface AuthState {
  type: 'none' | 'basic' | 'bearer';
  username?: string;
  password?: string;
  token?: string;
}

export interface BodyState {
  type: 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded';
  content: string;
}

export interface RequestState {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthState;
  body: BodyState;
}

const initialState: RequestState = {
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
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

export function resetRequest() {
  request.set(initialState);
}
