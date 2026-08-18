// OS-wide "bring Nouto to front" hotkey. The saved value lives in
// settings.globalShortcut (display format, e.g. "Ctrl+Shift+N"); Rust owns
// the OS registration (src-tauri/src/commands/global_shortcut.rs).

import { invoke } from '@tauri-apps/api/core';
import type { DesktopActionResult } from '@nouto/ui/lib/desktop-host';
import { logger } from './logger';

export async function registerGlobalShortcut(accelerator: string): Promise<DesktopActionResult> {
  try {
    await invoke('register_global_shortcut', { accelerator });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function unregisterGlobalShortcut(): Promise<DesktopActionResult> {
  try {
    await invoke('unregister_global_shortcut');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

let _applied: string | null | undefined;

/**
 * Bring the OS registration in line with the saved setting. Called by the
 * main window whenever settings load or change; no-op when unchanged.
 */
export async function syncGlobalShortcut(accelerator: string | null): Promise<void> {
  const next = accelerator && accelerator.trim() ? accelerator : null;
  if (next === _applied) return;
  const result = next ? await registerGlobalShortcut(next) : await unregisterGlobalShortcut();
  if (result.ok) {
    _applied = next;
  } else {
    logger.warn('Global shortcut sync failed:', result.message);
  }
}
