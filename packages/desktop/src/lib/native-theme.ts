// Keeps the native window chrome (title bar, system dialogs) in step with the
// app theme. The Rust side no longer pins the windows to Dark; each window
// calls `syncNativeTheme` after applying its appearance.

import { getCurrentWindow } from '@tauri-apps/api/window';
import { THEMES } from '@nouto/ui/stores/theme.svelte';
import { logger } from './logger';

export type NativeTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Resolve a theme id (including `system`) to the light/dark family it belongs to. */
export function resolveNativeTheme(themeId: string): NativeTheme {
  const category = THEMES.find((t) => t.id === themeId)?.category ?? 'auto';
  if (category === 'light') return 'light';
  if (category === 'dark') return 'dark';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

let _lastApplied: NativeTheme | null = null;

/** Apply the theme family to the current native window. Safe to call often. */
export async function syncNativeTheme(themeId: string): Promise<void> {
  const resolved = resolveNativeTheme(themeId);
  if (resolved === _lastApplied) return;
  try {
    await getCurrentWindow().setTheme(resolved);
    _lastApplied = resolved;
  } catch (err) {
    // Some platforms (Linux) may not support runtime theme changes.
    logger.debug('setTheme not applied:', err);
  }
}

/**
 * Re-sync when the OS preference flips while a `system`-family theme is
 * active. `currentThemeId` is read lazily so the caller's store stays the
 * source of truth. Returns a teardown.
 */
export function watchSystemTheme(currentThemeId: () => string): () => void {
  const mql = window.matchMedia(DARK_QUERY);
  const handler = () => {
    void syncNativeTheme(currentThemeId());
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
