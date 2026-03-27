import './styles/theme.css';
import { JsonExplorerPanel, initJsonExplorer, restorePersistedState } from '@nouto/json-explorer';
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
