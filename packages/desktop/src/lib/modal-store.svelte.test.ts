import { describe, it, expect, beforeEach } from 'vitest';
import {
  showLocalQuickPick,
  showLocalInputBox,
  showLocalConfirm,
  showLocalSaveDiscardCancel,
  resolveLocalQuickPick,
  resolveLocalInputBox,
  resolveLocalConfirm,
  resolveLocalSaveDiscardCancel,
} from './modal-store.svelte';
// The real store: pure $state, no Tauri dependency — lets the tests assert
// which prompt actually owns the single pendingInput slot.
import { pendingInput, clearPendingInput } from '@nouto/ui/stores/notifications.svelte';

beforeEach(() => {
  // Settle any resolver left over from a prior test before clearing the slot.
  resolveLocalQuickPick(null);
  resolveLocalInputBox(null);
  resolveLocalConfirm(false);
  resolveLocalSaveDiscardCancel('cancel');
  clearPendingInput();
});

describe('orphaned prompt resolution', () => {
  it('resolves a pending confirm with false when a new prompt replaces it', async () => {
    const first = showLocalConfirm('Delete?');
    const second = showLocalConfirm('Overwrite?');
    await expect(first).resolves.toBe(false);
    resolveLocalConfirm(true);
    await expect(second).resolves.toBe(true);
  });

  it('resolves a pending save/discard/cancel with cancel when replaced by another prompt kind', async () => {
    const tabClose = showLocalSaveDiscardCancel('api.yaml has unsaved changes.');
    const appClose = showLocalSaveDiscardCancel('2 OpenAPI documents have unsaved changes.');
    await expect(tabClose).resolves.toBe('cancel');
    resolveLocalSaveDiscardCancel('save');
    await expect(appClose).resolves.toBe('save');
  });

  it('resolves pending quick pick and input box with null when replaced', async () => {
    const pick = showLocalQuickPick('Pick', [{ label: 'A', value: 'a' }]);
    const input = showLocalInputBox('Name?');
    await expect(pick).resolves.toBeNull();

    const confirm = showLocalConfirm('Sure?');
    await expect(input).resolves.toBeNull();
    resolveLocalConfirm(true);
    await expect(confirm).resolves.toBe(true);
  });

  it('the surviving prompt owns the pendingInput slot', () => {
    void showLocalSaveDiscardCancel('first');
    void showLocalConfirm('second');
    const pending = pendingInput();
    expect(pending?.type).toBe('confirm');
    expect((pending?.data as { message?: string })?.message).toBe('second');
    resolveLocalConfirm(false);
  });

  it('a normally-resolved prompt is not re-resolved by a later prompt', async () => {
    const first = showLocalConfirm('First?');
    resolveLocalConfirm(true);
    await expect(first).resolves.toBe(true);

    // Opening the next prompt must not disturb the already-settled first.
    const second = showLocalConfirm('Second?');
    resolveLocalConfirm(false);
    await expect(second).resolves.toBe(false);
    await expect(first).resolves.toBe(true);
  });
});
