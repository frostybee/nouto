import { writable, derived } from 'svelte/store';
import { resolveShortcuts, type ShortcutMap, type ShortcutAction, type ShortcutBinding, SHORTCUT_DEFINITIONS, bindingToDisplayString } from '../lib/shortcuts';
import { postMessage } from '../lib/vscode';

export type MinimapMode = 'auto' | 'always' | 'never';
export type StorageMode = 'global' | 'workspace';

export interface GlobalClientCertConfig {
  certPath?: string;
  keyPath?: string;
  passphrase?: string;
}

export interface GlobalProxyConfig {
  enabled: boolean;
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
  noProxy?: string;
}

export interface UserSettings {
  autoCorrectUrls: boolean;
  shortcuts: ShortcutMap;
  minimap: MinimapMode;
  saveResponseBody: boolean;
  sslRejectUnauthorized: boolean;
  storageMode: StorageMode;
  globalProxy?: GlobalProxyConfig | null;
  defaultTimeout?: number | null;
  defaultFollowRedirects?: boolean | null;
  defaultMaxRedirects?: number | null;
  globalClientCert?: GlobalClientCertConfig | null;
}

export const settingsOpen = writable(false);

export const settings = writable<UserSettings>({
  autoCorrectUrls: false,
  shortcuts: {},
  minimap: 'auto',
  saveResponseBody: true,
  sslRejectUnauthorized: true,
  storageMode: 'global',
});

/** Resolved shortcuts: merges user overrides with defaults */
export const resolvedShortcuts = derived(settings, ($s) => resolveShortcuts($s.shortcuts));

export function loadSettings(data: UserSettings) {
  settings.set({
    autoCorrectUrls: data.autoCorrectUrls ?? false,
    shortcuts: data.shortcuts ?? {},
    minimap: data.minimap ?? 'auto',
    saveResponseBody: data.saveResponseBody ?? true,
    sslRejectUnauthorized: data.sslRejectUnauthorized ?? true,
    storageMode: (data.storageMode as StorageMode) ?? 'global',
    globalProxy: data.globalProxy ?? null,
    defaultTimeout: data.defaultTimeout ?? null,
    defaultFollowRedirects: data.defaultFollowRedirects ?? null,
    defaultMaxRedirects: data.defaultMaxRedirects ?? null,
    globalClientCert: data.globalClientCert ?? null,
  });
}

export function updateShortcut(id: ShortcutAction, binding: ShortcutBinding) {
  const displayString = bindingToDisplayString(binding);
  settings.update((s) => {
    const next = { ...s, shortcuts: { ...s.shortcuts, [id]: displayString } };
    postMessage({ type: 'updateSettings', data: next });
    return next;
  });
}

export function resetShortcut(id: ShortcutAction) {
  settings.update((s) => {
    const { [id]: _, ...rest } = s.shortcuts;
    const next = { ...s, shortcuts: rest };
    postMessage({ type: 'updateSettings', data: next });
    return next;
  });
}

export function resetAllShortcuts() {
  settings.update((s) => {
    const next = { ...s, shortcuts: {} };
    postMessage({ type: 'updateSettings', data: next });
    return next;
  });
}
