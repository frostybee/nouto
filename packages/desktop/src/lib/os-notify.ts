// OS notifications for things that finish while the user is looking elsewhere.

import { getCurrentWindow } from '@tauri-apps/api/window';
import { settings } from '@nouto/ui/stores/settings.svelte';
import type { DesktopActionResult } from '@nouto/ui/lib/desktop-host';
import { logger } from './logger';

async function ensurePermission(): Promise<boolean> {
  const { isPermissionGranted, requestPermission } =
    await import('@tauri-apps/plugin-notification');
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === 'granted';
}

async function send(title: string, body: string): Promise<void> {
  const { sendNotification } = await import('@tauri-apps/plugin-notification');
  sendNotification({ title, body });
}

/**
 * Show an OS notification unless the user turned them off or the main window
 * already has focus (in which case the in-app UI is enough). Never throws.
 */
export async function notifyIfUnfocused(title: string, body: string): Promise<void> {
  if (settings.osNotifications === false) return;
  try {
    if (await getCurrentWindow().isFocused()) return;
    if (!(await ensurePermission())) return;
    await send(title, body);
  } catch (err) {
    logger.debug('OS notification skipped:', err);
  }
}

/** Always sends (ignores focus); used by the Settings page test button. */
export async function sendTestNotification(): Promise<DesktopActionResult> {
  try {
    if (!(await ensurePermission())) {
      return { ok: false, message: 'Notification permission was not granted.' };
    }
    await send('Nouto', 'Notifications are working.');
    return { ok: true };
  } catch (err) {
    logger.warn('Test notification failed:', err);
    return { ok: false, message: String(err) };
  }
}
