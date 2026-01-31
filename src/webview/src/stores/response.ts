import { writable } from 'svelte/store';

export interface ResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  duration: number;
  size: number;
  error?: boolean;
}

export const response = writable<ResponseState | null>(null);
export const isLoading = writable<boolean>(false);

export function setResponse(res: ResponseState) {
  response.set(res);
  isLoading.set(false);
}

export function setLoading(loading: boolean) {
  isLoading.set(loading);
}

export function clearResponse() {
  response.set(null);
}
