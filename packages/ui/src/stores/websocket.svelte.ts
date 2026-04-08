import type { WebSocketMessage, WebSocketConnectionStatus } from '../types';

const _wsStatus = $state<{ value: WebSocketConnectionStatus }>({ value: 'disconnected' });
const _wsMessages = $state<{ value: WebSocketMessage[] }>({ value: [] });
const _wsError = $state<{ value: string | null }>({ value: null });

export function wsStatus() { return _wsStatus.value; }
export function wsMessages() { return _wsMessages.value; }
export function wsError() { return _wsError.value; }

export function wsMessageCount() { return _wsMessages.value.length; }

export function setWsStatus(status: WebSocketConnectionStatus, error?: string) {
  _wsStatus.value = status;
  if (error) _wsError.value = error;
  else if (status === 'connected') _wsError.value = null;
  if (status === 'disconnected' || status === 'error') {
    flushWsBuffer();
  }
}

const MAX_WS_MESSAGES = 1000;
const WS_BATCH_INTERVAL_MS = 100;

let _msgBuffer: WebSocketMessage[] = [];
let _wsFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushWsBuffer() {
  if (_wsFlushTimer) { clearTimeout(_wsFlushTimer); _wsFlushTimer = null; }
  if (_msgBuffer.length === 0) return;
  const batch = _msgBuffer;
  _msgBuffer = [];
  const combined = _wsMessages.value.concat(batch);
  _wsMessages.value = combined.length > MAX_WS_MESSAGES
    ? combined.slice(-MAX_WS_MESSAGES)
    : combined;
}

export function addWsMessage(msg: WebSocketMessage) {
  _msgBuffer.push(msg);
  if (!_wsFlushTimer) {
    _wsFlushTimer = setTimeout(flushWsBuffer, WS_BATCH_INTERVAL_MS);
  }
}

export function clearWsMessages() {
  _msgBuffer = [];
  if (_wsFlushTimer) { clearTimeout(_wsFlushTimer); _wsFlushTimer = null; }
  _wsMessages.value = [];
}

// Bulk restore for tab switching
export function bulkSetWsState(data: { status: string; messages: WebSocketMessage[]; error: string | null }) {
  _wsStatus.value = (data.status || 'disconnected') as WebSocketConnectionStatus;
  _wsMessages.value = Array.isArray(data.messages) ? data.messages : [];
  _wsError.value = data.error ?? null;
}
