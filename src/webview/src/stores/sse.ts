import { writable, derived } from 'svelte/store';
import type { SSEEvent, SSEConnectionStatus } from '../types';

export const sseStatus = writable<SSEConnectionStatus>('disconnected');
export const sseEvents = writable<SSEEvent[]>([]);
export const sseError = writable<string | null>(null);

export const sseEventCount = derived(sseEvents, ($events) => $events.length);

export function setSSEStatus(status: SSEConnectionStatus, error?: string) {
  sseStatus.set(status);
  if (error) sseError.set(error);
  else if (status === 'connected') sseError.set(null);
}

export function addSSEEvent(event: SSEEvent) {
  sseEvents.update((events) => [...events, event]);
}

export function clearSSEEvents() {
  sseEvents.set([]);
}
