import './styles/theme.css';
import CollectionSettingsPanel from './components/settings/CollectionSettingsPanel.svelte';
import { initSettings } from './stores/collectionSettings';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'initSettings') {
    initSettings(message.data);
  }
});

mount(CollectionSettingsPanel, { target: document.body });

vscode.postMessage({ type: 'ready' });
