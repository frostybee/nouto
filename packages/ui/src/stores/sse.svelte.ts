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
  // Flush pending events on disconnect so the UI updates immediately
  if (status === 'disconnected' || status === 'error') {
    flushEventBuffer();
  }
}

const MAX_SSE_EVENTS = 1000;
const BATCH_INTERVAL_MS = 100;

let _eventBuffer: SSEEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushEventBuffer() {
  _flushTimer = null;
  if (_eventBuffer.length === 0) return;
  const batch = _eventBuffer;
  _eventBuffer = [];
  const combined = _sseEvents.value.concat(batch);
  _sseEvents.value = combined.length > MAX_SSE_EVENTS
    ? combined.slice(-MAX_SSE_EVENTS)
    : combined;
}

export function addSSEEvent(event: SSEEvent) {
  _eventBuffer.push(event);
  if (!_flushTimer) {
    _flushTimer = setTimeout(flushEventBuffer, BATCH_INTERVAL_MS);
  }
}

export function clearSSEEvents() {
  _eventBuffer = [];
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  _sseEvents.value = [];
}

// Bulk restore for tab switching
export function bulkSetSseState(data: { status: string; events: SSEEvent[]; error: string | null }) {
  _sseStatus.value = (data.status || 'disconnected') as SSEConnectionStatus;
  _sseEvents.value = Array.isArray(data.events) ? data.events : [];
  _sseError.value = data.error ?? null;
}
