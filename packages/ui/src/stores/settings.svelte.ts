import { resolveShortcuts, type ShortcutMap, type ShortcutAction, type ShortcutBinding, bindingToDisplayString } from '../lib/shortcuts';
import { postMessage } from '../lib/vscode';

export type MinimapMode = 'auto' | 'always' | 'never';
export type StorageMode = 'global' | 'workspace';

export interface GlobalClientCertConfig {
  certPath?: string;
  keyPath?: string;
  passphrase?: string;
  caCertPath?: string;
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
  openApiLintEnabled: boolean;
  openApiLintRules: Record<string, 'error' | 'warning' | 'off'>;
  openApiOutlineSortAlphabetically: boolean;
  openApiIntelliSenseEnabled: boolean;
  openApiExternalRefsEnabled: boolean;
  /** Desktop only: closing the main window hides it to the tray instead of quitting. */
  closeToTray: boolean;
  /** Desktop only: OS notifications for long-running completions while unfocused. */
  osNotifications: boolean;
  /** Desktop only: OS-wide hotkey that brings Nouto to the front, in display format ("Ctrl+Shift+N"). */
  globalShortcut: string | null;
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
  openApiLintEnabled: true,
  openApiLintRules: {},
  openApiOutlineSortAlphabetically: false,
  openApiIntelliSenseEnabled: true,
  openApiExternalRefsEnabled: true,
  closeToTray: false,
  osNotifications: true,
  globalShortcut: null,
});

/** Resolved shortcuts: merges user overrides with defaults */
export function resolvedShortcuts() { return resolveShortcuts(settings.shortcuts); }

export function loadSettings(data: Partial<UserSettings> & { hasWorkspace?: boolean; appVersion?: string; iconUrl?: string }) {
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
  settings.openApiLintEnabled = data.openApiLintEnabled ?? true;
  settings.openApiLintRules = data.openApiLintRules ?? {};
  settings.openApiOutlineSortAlphabetically = data.openApiOutlineSortAlphabetically ?? false;
  settings.openApiIntelliSenseEnabled = data.openApiIntelliSenseEnabled ?? true;
  settings.openApiExternalRefsEnabled = data.openApiExternalRefsEnabled ?? true;
  settings.closeToTray = data.closeToTray ?? false;
  settings.osNotifications = data.osNotifications ?? true;
  settings.globalShortcut = data.globalShortcut ?? null;
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
