import './styles/theme.css';
import JsonExplorerPanel from './components/json-explorer/JsonExplorerPanel.svelte';
import { initJsonExplorer, restorePersistedState } from './stores/jsonExplorer.svelte';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'initJsonExplorer':
      initJsonExplorer(message.data);
      break;
  }
});

restorePersistedState();
mount(JsonExplorerPanel, { target: document.body });

vscode.postMessage({ type: 'ready' });
