// App exit paths. Both the window's close handshake and any explicit Quit
// action go through here, so a new debounced store only has to be added to
// `flushAllStores` once to be safe on exit.

import { invoke } from '@tauri-apps/api/core';
import { getMessageBus } from './tauri';
import { flushDraftSave } from './draft-store.svelte';
import { showLocalConfirm } from './modal-store.svelte';
import { getHasUnsavedChanges, setHasUnsavedChanges } from './stores/dirty.svelte';

/** Drain every debounced store to disk. */
export async function flushAllStores(): Promise<void> {
  flushDraftSave();
  await getMessageBus().flushPendingSaves();
}

/**
 * End the process. `quit_app` sets the Rust-side force-close flag so the
 * window teardown is not intercepted by the close handshake again.
 */
export function quitApp(): Promise<void> {
  return invoke('quit_app');
}

/** Returns true if the user agrees to proceed (or nothing is dirty). */
export async function confirmQuitIfDirty(): Promise<boolean> {
  if (!getHasUnsavedChanges()) return true;
  const proceed = await showLocalConfirm(
    'You have unsaved changes. Close anyway?',
    'Quit',
    'warning',
  );
  if (proceed) setHasUnsavedChanges(false);
  return proceed;
}

/** Flush, then quit. For explicit Quit actions (tray, command palette). */
export async function requestQuit(): Promise<void> {
  if (!(await confirmQuitIfDirty())) return;
  await flushAllStores();
  await quitApp();
}
