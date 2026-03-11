import './styles/theme.css';
import '@vscode/codicons/dist/codicon.css';
import CollectionSettingsPanel from './components/settings/CollectionSettingsPanel.svelte';
import { initSettings, notifySettingsSaved } from './stores/collectionSettings.svelte';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'initSettings') {
    initSettings(message.data);
  } else if (message.type === 'settingsSaved') {
    notifySettingsSaved();
  }
});

mount(CollectionSettingsPanel, { target: document.body });

vscode.postMessage({ type: 'ready' });
