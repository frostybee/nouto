import './styles/theme.css';
import '@vscode/codicons/dist/codicon.css';
import SettingsPage from './components/shared/SettingsPage.svelte';
import { loadSettings } from './stores/settings.svelte';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'initSettings':
      loadSettings(message.data);
      break;
    case 'focusSection':
      window.dispatchEvent(new CustomEvent('nouto:focusSection', { detail: message.data.section }));
      break;
  }
  // Other messages (sslFilePicked, etc.) are handled by SettingsPage
  // via the VSCodeMessageBus onMessage listener automatically.
});

mount(SettingsPage, { target: document.body, props: { standalone: false, fullPage: true } });

vscode.postMessage({ type: 'ready' });
