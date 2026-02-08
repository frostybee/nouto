import { writable, derived } from 'svelte/store';
import type { WebSocketMessage, WebSocketConnectionStatus } from '../types';

export const wsStatus = writable<WebSocketConnectionStatus>('disconnected');
export const wsMessages = writable<WebSocketMessage[]>([]);
export const wsError = writable<string | null>(null);

export const wsMessageCount = derived(wsMessages, ($msgs) => $msgs.length);

export function setWsStatus(status: WebSocketConnectionStatus, error?: string) {
  wsStatus.set(status);
  if (error) wsError.set(error);
  else if (status === 'connected') wsError.set(null);
}

export function addWsMessage(msg: WebSocketMessage) {
  wsMessages.update((msgs) => [...msgs, msg]);
}

export function clearWsMessages() {
  wsMessages.set([]);
}
