import type { SSEEvent, SSEConnectionStatus } from '../types';

const _sseStatus = $state<{ value: SSEConnectionStatus }>({ value: 'disconnected' });
const _sseEvents = $state<{ value: SSEEvent[] }>({ value: [] });
const _sseError = $state<{ value: string | null }>({ value: null });

export function sseStatus() { return _sseStatus.value; }
export function sseEvents() { return _sseEvents.value; }
export function sseError() { return _sseError.value; }

export function sseEventCount() { return _sseEvents.value.length; }

export function setSSEStatus(status: SSEConnectionStatus, error?: string) {
  _sseStatus.value = status;
  if (error) _sseError.value = error;
  else if (status === 'connected') _sseError.value = null;
}

const MAX_SSE_EVENTS = 1000;

export function addSSEEvent(event: SSEEvent) {
  _sseEvents.value = [..._sseEvents.value, event].slice(-MAX_SSE_EVENTS);
}

export function clearSSEEvents() {
  _sseEvents.value = [];
}
