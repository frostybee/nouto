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

const _settingsOpen = $state<{ value: boolean }>({ value: false });
const _hasWorkspace = $state<{ value: boolean }>({ value: false });
const _appVersion = $state<{ value: string }>({ value: '' });
const _iconUrl = $state<{ value: string }>({ value: '' });

export function hasWorkspace() { return _hasWorkspace.value; }

export function appVersion() { return _appVersion.value; }
export function setAppVersion(version: string) { _appVersion.value = version; }

export function iconUrl() { return _iconUrl.value; }
export function setIconUrl(url: string) { _iconUrl.value = url; }

export function settingsOpen() { return _settingsOpen.value; }

export function setSettingsOpen(open: boolean) {
  _settingsOpen.value = open;
}

export const settings = $state<UserSettings>({
  autoCorrectUrls: false,
  shortcuts: {},
  minimap: 'auto',
  saveResponseBody: true,
  sslRejectUnauthorized: true,
  storageMode: 'global',
});

/** Resolved shortcuts: merges user overrides with defaults */
export function resolvedShortcuts() { return resolveShortcuts(settings.shortcuts); }

export function loadSettings(data: UserSettings & { hasWorkspace?: boolean; appVersion?: string; iconUrl?: string }) {
  _hasWorkspace.value = data.hasWorkspace ?? false;
  if (data.appVersion) _appVersion.value = data.appVersion;
  if (data.iconUrl) _iconUrl.value = data.iconUrl;
  settings.autoCorrectUrls = data.autoCorrectUrls ?? false;
  settings.shortcuts = data.shortcuts ?? {};
  settings.minimap = data.minimap ?? 'auto';
  settings.saveResponseBody = data.saveResponseBody ?? true;
  settings.sslRejectUnauthorized = data.sslRejectUnauthorized ?? true;
  settings.storageMode = (data.storageMode as StorageMode) ?? 'global';
  settings.globalProxy = data.globalProxy ?? null;
  settings.defaultTimeout = data.defaultTimeout ?? null;
  settings.defaultFollowRedirects = data.defaultFollowRedirects ?? null;
  settings.defaultMaxRedirects = data.defaultMaxRedirects ?? null;
  settings.globalClientCert = data.globalClientCert ?? null;
}

export function updateShortcut(id: ShortcutAction, binding: ShortcutBinding) {
  const displayString = bindingToDisplayString(binding);
  settings.shortcuts = { ...settings.shortcuts, [id]: displayString };
  postMessage({ type: 'updateSettings', data: $state.snapshot(settings) });
}

export function resetShortcut(id: ShortcutAction) {
  const { [id]: _, ...rest } = settings.shortcuts;
  settings.shortcuts = rest;
  postMessage({ type: 'updateSettings', data: $state.snapshot(settings) });
}

export function resetAllShortcuts() {
  settings.shortcuts = {};
  postMessage({ type: 'updateSettings', data: $state.snapshot(settings) });
}
