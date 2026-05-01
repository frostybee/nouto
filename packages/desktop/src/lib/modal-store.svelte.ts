import { setPendingInput, clearPendingInput } from '@nouto/ui/stores/notifications.svelte';

let localQuickPickResolve: ((value: string | null) => void) | null = null;
let localInputBoxResolve: ((value: string | null) => void) | null = null;
let localConfirmResolve: ((value: boolean) => void) | null = null;

export function showLocalQuickPick(title: string, items: { label: string; value: string; description?: string; kind?: string; icon?: string; accent?: boolean }[]): Promise<string | null> {
  return new Promise((resolve) => {
    localQuickPickResolve = resolve;
    setPendingInput({ type: 'quickPick', requestId: '_local', data: { title, items, canPickMany: false } });
  });
}

export function showLocalInputBox(prompt: string, placeholder?: string, value?: string): Promise<string | null> {
  return new Promise((resolve) => {
    localInputBoxResolve = resolve;
    setPendingInput({ type: 'inputBox', requestId: '_local', data: { prompt, placeholder, value, validateNotEmpty: true } });
  });
}

export function showLocalConfirm(message: string, confirmLabel?: string, variant?: 'danger' | 'warning' | 'info'): Promise<boolean> {
  return new Promise((resolve) => {
    localConfirmResolve = resolve;
    setPendingInput({ type: 'confirm', requestId: '_local', data: { message, confirmLabel, variant } });
  });
}

export function resolveLocalConfirm(confirmed: boolean) {
  if (localConfirmResolve) {
    localConfirmResolve(confirmed);
    localConfirmResolve = null;
  }
  clearPendingInput();
}

export function resolveLocalQuickPick(value: string | string[] | null) {
  if (localQuickPickResolve) {
    localQuickPickResolve(typeof value === 'string' ? value : null);
    localQuickPickResolve = null;
  }
  clearPendingInput();
}

export function resolveLocalInputBox(value: string | null) {
  if (localInputBoxResolve) {
    localInputBoxResolve(value);
    localInputBoxResolve = null;
  }
  clearPendingInput();
}
