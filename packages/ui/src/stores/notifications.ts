import { writable } from 'svelte/store';

export interface Notification {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  duration: number;
}

export interface PendingInput {
  type: 'inputBox' | 'quickPick' | 'confirm' | 'createItemDialog';
  requestId: string;
  data: Record<string, any>;
}

export const notifications = writable<Notification[]>([]);
export const pendingInput = writable<PendingInput | null>(null);

let notificationCounter = 0;

const DEFAULT_DURATIONS: Record<string, number> = {
  info: 3000,
  warning: 5000,
  error: 5000,
};

export function showNotification(level: 'info' | 'warning' | 'error', message: string, duration?: number): void {
  const id = `notif-${++notificationCounter}`;
  const notif: Notification = {
    id,
    level,
    message,
    duration: duration ?? DEFAULT_DURATIONS[level] ?? 3000,
  };
  notifications.update((list) => [...list, notif]);
}

export function dismissNotification(id: string): void {
  notifications.update((list) => list.filter((n) => n.id !== id));
}

export function setPendingInput(input: PendingInput): void {
  pendingInput.set(input);
}

export function clearPendingInput(): void {
  pendingInput.set(null);
}
