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
}

const MAX_WS_MESSAGES = 1000;

export function addWsMessage(msg: WebSocketMessage) {
  _wsMessages.value = [..._wsMessages.value, msg].slice(-MAX_WS_MESSAGES);
}

export function clearWsMessages() {
  _wsMessages.value = [];
}
