export interface NotificationAction {
  label: string;
  onclick: () => void;
}

export interface Notification {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  duration: number;
  actions?: NotificationAction[];
}

export interface PendingInput {
  type: 'inputBox' | 'quickPick' | 'confirm' | 'createItemDialog';
  requestId: string;
  data: Record<string, any>;
}

const _notifications = $state<{ value: Notification[] }>({ value: [] });
const _pendingInput = $state<{ value: PendingInput | null }>({ value: null });

export function notifications() { return _notifications.value; }
export function pendingInput() { return _pendingInput.value; }

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
  _notifications.value = [..._notifications.value, notif];
}

export function showNotificationWithActions(
  level: 'info' | 'warning' | 'error',
  message: string,
  actions: NotificationAction[],
  duration?: number,
): void {
  const id = `notif-${++notificationCounter}`;
  const notif: Notification = {
    id,
    level,
    message,
    duration: duration ?? DEFAULT_DURATIONS[level] ?? 3000,
    actions,
  };
  _notifications.value = [..._notifications.value, notif];
}

export function dismissNotification(id: string): void {
  _notifications.value = _notifications.value.filter((n) => n.id !== id);
}

export function forceRefreshNotifications(): void {
  _notifications.value = [..._notifications.value];
}

export function setPendingInput(input: PendingInput): void {
  _pendingInput.value = input;
}

export function clearPendingInput(): void {
  _pendingInput.value = null;
}
