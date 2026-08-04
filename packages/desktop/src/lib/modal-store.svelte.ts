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

export type SaveDiscardCancelChoice = 'save' | 'discard' | 'cancel';

let localSaveDiscardCancelResolve: ((value: SaveDiscardCancelChoice) => void) | null = null;

/**
 * Three-way unsaved-changes prompt. Rides the same pendingInput 'confirm'
 * channel as showLocalConfirm; the tertiaryLabel field is what tells
 * App.svelte's responder to resolve tri-state instead of boolean.
 */
export function showLocalSaveDiscardCancel(message: string): Promise<SaveDiscardCancelChoice> {
  return new Promise((resolve) => {
    localSaveDiscardCancelResolve = resolve;
    setPendingInput({
      type: 'confirm',
      requestId: '_local',
      data: { message, confirmLabel: 'Save', cancelLabel: 'Cancel', tertiaryLabel: 'Discard', variant: 'warning' },
    });
  });
}

export function resolveLocalSaveDiscardCancel(value: SaveDiscardCancelChoice) {
  if (localSaveDiscardCancelResolve) {
    localSaveDiscardCancelResolve(value);
    localSaveDiscardCancelResolve = null;
  }
  clearPendingInput();
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
