import { setPendingInput, clearPendingInput } from '@nouto/ui/stores/notifications.svelte';

let localQuickPickResolve: ((value: string | null) => void) | null = null;
let localInputBoxResolve: ((value: string | null) => void) | null = null;
let localConfirmResolve: ((value: boolean) => void) | null = null;

/**
 * All four prompts share the single pendingInput slot, so opening a new one
 * replaces whatever is on screen. Without this, the replaced prompt's promise
 * would never settle and its awaiting flow (e.g. a tab-close dirty guard)
 * would hang forever. Each channel resolves to its cancel-equivalent, so an
 * orphaned dirty prompt always degrades to "don't proceed", never to a save
 * or discard the user did not pick.
 */
function orphanPendingPrompts(): void {
  if (localQuickPickResolve) {
    const resolve = localQuickPickResolve;
    localQuickPickResolve = null;
    resolve(null);
  }
  if (localInputBoxResolve) {
    const resolve = localInputBoxResolve;
    localInputBoxResolve = null;
    resolve(null);
  }
  if (localConfirmResolve) {
    const resolve = localConfirmResolve;
    localConfirmResolve = null;
    resolve(false);
  }
  if (localSaveDiscardCancelResolve) {
    const resolve = localSaveDiscardCancelResolve;
    localSaveDiscardCancelResolve = null;
    resolve('cancel');
  }
}

export function showLocalQuickPick(title: string, items: { label: string; value: string; description?: string; kind?: string; icon?: string; accent?: boolean }[]): Promise<string | null> {
  return new Promise((resolve) => {
    orphanPendingPrompts();
    localQuickPickResolve = resolve;
    setPendingInput({ type: 'quickPick', requestId: '_local', data: { title, items, canPickMany: false } });
  });
}

export function showLocalInputBox(prompt: string, placeholder?: string, value?: string): Promise<string | null> {
  return new Promise((resolve) => {
    orphanPendingPrompts();
    localInputBoxResolve = resolve;
    setPendingInput({ type: 'inputBox', requestId: '_local', data: { prompt, placeholder, value, validateNotEmpty: true } });
  });
}

export function showLocalConfirm(message: string, confirmLabel?: string, variant?: 'danger' | 'warning' | 'info'): Promise<boolean> {
  return new Promise((resolve) => {
    orphanPendingPrompts();
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
    orphanPendingPrompts();
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
