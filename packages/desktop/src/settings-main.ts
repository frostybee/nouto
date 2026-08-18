import { mount } from 'svelte';
import SettingsPage from '@nouto/ui/components/shared/SettingsPage.svelte';
import './app.css';
import { initTheme, setOnAppearanceChanged, currentTheme } from '@nouto/ui/stores/theme.svelte';
import { loadSettings } from '@nouto/ui/stores/settings.svelte';
import { listen, emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getMessageBus } from './lib/tauri';
import { initMessageBus } from '@nouto/ui/lib/vscode';
import { logger } from './lib/logger';
import { getPlatform } from './lib/platform';
import { initBrowserKeySuppression } from './lib/browser-keys';
import { syncNativeTheme, watchSystemTheme } from './lib/native-theme';
import type { DesktopHost } from '@nouto/ui/lib/desktop-host';
import { readAutostartState, commitAutostart } from './lib/autostart';
import { registerGlobalShortcut, unregisterGlobalShortcut } from './lib/global-shortcut';
import { sendTestNotification } from './lib/os-notify';

const messageBus = getMessageBus();
initMessageBus(messageBus);

initTheme();
void syncNativeTheme(currentTheme());
watchSystemTheme(currentTheme);
initBrowserKeySuppression(getPlatform(), { reload: !(import.meta as any).env?.DEV });

setOnAppearanceChanged((data) => {
  void syncNativeTheme(data.theme);
  void emitTo('main', 'appearanceChanged', data).catch((error) => {
    logger.error('[Settings] Failed to emit appearanceChanged to main window:', error);
  });
});

listen<any>('loadSettings', (event) => {
  if (event.payload?.data) loadSettings(event.payload.data);
});

listen<string>('focusSection', (event) => {
  window.dispatchEvent(new CustomEvent('nouto:focusSection', { detail: event.payload }));
});

messageBus.send({ type: 'getSettings' } as any);

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
