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

// Bulk restore for tab switching
export function bulkSetSseState(data: { status: string; events: SSEEvent[]; error: string | null }) {
  _sseStatus.value = (data.status || 'disconnected') as SSEConnectionStatus;
  _sseEvents.value = Array.isArray(data.events) ? data.events : [];
  _sseError.value = data.error ?? null;
}
