import { mount } from 'svelte';
import SettingsPage from '@nouto/ui/components/shared/SettingsPage.svelte';
import './app.css';
import { initTheme, setOnAppearanceChanged, currentTheme } from '@nouto/ui/stores/theme.svelte';
import { loadSettings, type UserSettings } from '@nouto/ui/stores/settings.svelte';
import { listen, emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getMessageBus } from './lib/tauri';
import { initMessageBus } from '@nouto/ui/lib/vscode';
import { logger } from './lib/logger';
import { getPlatform } from './lib/platform';
import { initBrowserKeySuppression } from './lib/browser-keys';
import { syncNativeTheme, watchSystemTheme } from './lib/native-theme';
import { invoke } from '@tauri-apps/api/core';
import { getTauriVersion } from '@tauri-apps/api/app';
import type { DesktopHost } from '@nouto/ui/lib/desktop-host';
import { readAutostartState, commitAutostart } from './lib/autostart';
import { registerGlobalShortcut, unregisterGlobalShortcut } from './lib/global-shortcut';
import { sendTestNotification } from './lib/os-notify';
import { formatDiagnostics, type DiagnosticsReport } from './lib/diagnostics';

const messageBus = getMessageBus();
initMessageBus(messageBus);

initTheme();
void syncNativeTheme(currentTheme());
watchSystemTheme(currentTheme);
initBrowserKeySuppression(getPlatform(), { reload: !import.meta.env?.DEV });

setOnAppearanceChanged((data) => {
  void syncNativeTheme(data.theme);
  void emitTo('main', 'appearanceChanged', data).catch((error) => {
    logger.error('[Settings] Failed to emit appearanceChanged to main window:', error);
  });
});

listen<{
  data?: Partial<UserSettings> & { hasWorkspace?: boolean; appVersion?: string; iconUrl?: string };
}>('loadSettings', (event) => {
  if (event.payload?.data) loadSettings(event.payload.data);
});

listen<string>('focusSection', (event) => {
  window.dispatchEvent(new CustomEvent('nouto:focusSection', { detail: event.payload }));
});

messageBus.send({ type: 'getSettings' });

window.addEventListener('storage', (e) => {
  if (e.key === 'nouto_appearance') {
    initTheme();
    void syncNativeTheme(currentTheme());
  }
});

// Desktop-only actions for the Settings page (@nouto/ui stays Tauri-free).
const desktopHost: DesktopHost = {
  readAutostart: readAutostartState,
  setAutostart: commitAutostart,
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  sendTestNotification,
  async collectDiagnostics() {
    try {
      const tauriVersion = await getTauriVersion();
      const report = await invoke<DiagnosticsReport>('collect_diagnostics', { tauriVersion });
      return { ok: true as const, text: formatDiagnostics(report) };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  },
  async listCrashReports() {
    try {
      return await invoke<string[]>('list_crash_reports');
    } catch {
      return [];
    }
  },
  async clearCrashReports() {
    try {
      const cleared = await invoke<number>('clear_crash_reports');
      return { ok: true as const, cleared };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  },
};

const params = new URLSearchParams(window.location.search);
const section = params.get('section');

mount(SettingsPage, {
  target: document.getElementById('app')!,
  props: {
    standalone: true,
    initialSection: section,
    onclose: () => getCurrentWindow().close(),
    desktopHost,
  },
});

getCurrentWindow().show();
