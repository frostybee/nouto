import '@vscode/codicons/dist/codicon.css';
import '@nouto/ui/styles/theme.css';
import { JsonExplorerPanel, initJsonExplorer, updateJsonData, restorePersistedState } from '@nouto/json-explorer';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'initJsonExplorer':
      initJsonExplorer(message.data);
      break;
    case 'updateJsonData':
      updateJsonData(message.data.json, message.data.timestamp);
      break;
  }
});

restorePersistedState();
mount(JsonExplorerPanel, { target: document.body });

vscode.postMessage({ type: 'ready' });
