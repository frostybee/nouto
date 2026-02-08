import type { ConnectionMode } from '../types';

export function detectProtocolMode(url: string): ConnectionMode {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return 'websocket';
  }
  return 'http';
}
