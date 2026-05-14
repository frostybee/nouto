import { mount } from 'svelte';
import SettingsPage from '@nouto/ui/components/shared/SettingsPage.svelte';
import './app.css';
import { initTheme } from '@nouto/ui/stores/theme.svelte';
import { loadSettings } from '@nouto/ui/stores/settings.svelte';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getMessageBus } from './lib/tauri';
import { initMessageBus } from '@nouto/ui/lib/vscode';

const messageBus = getMessageBus();
initMessageBus(messageBus);

initTheme();

listen<any>('loadSettings', (event) => {
  if (event.payload?.data) loadSettings(event.payload.data);
});

listen<string>('focusSection', (event) => {
  window.dispatchEvent(new CustomEvent('nouto:focusSection', { detail: event.payload }));
});

messageBus.send({ type: 'getSettings' } as any);

window.addEventListener('storage', (e) => {
  if (e.key === 'nouto_appearance') initTheme();
});

const params = new URLSearchParams(window.location.search);
const section = params.get('section');

mount(SettingsPage, {
  target: document.getElementById('app')!,
  props: {
    standalone: true,
    initialSection: section,
    onclose: () => getCurrentWindow().close(),
  },
});

getCurrentWindow().show();
