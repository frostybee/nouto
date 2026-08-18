// Launch at login. The OS registration is the single source of truth: nothing
// is mirrored into settings, so a user who removes the entry in Task Manager
// or Login Items sees the toggle agree with reality.

import type { DesktopActionResult } from '@nouto/ui/lib/desktop-host';
import { logger } from './logger';

/** Current OS registration; `false` when the plugin call fails. */
export async function readAutostartState(): Promise<boolean> {
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    return await isEnabled();
  } catch (err) {
    logger.warn('Could not read the autostart state:', err);
    return false;
  }
}

export async function commitAutostart(enabled: boolean): Promise<DesktopActionResult> {
  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
    if (enabled) await enable();
    else await disable();
    return { ok: true };
  } catch (err) {
    logger.warn('Could not change the autostart state:', err);
    return { ok: false, message: String(err) };
  }
}
