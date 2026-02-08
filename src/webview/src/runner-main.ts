import CollectionRunnerPanel from './components/runner/CollectionRunnerPanel.svelte';
import { initRunner } from './stores/collectionRunner';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

// Listen for initialization data
window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'initRunner') {
    initRunner(message.data);
  }
});

// Mount the runner panel
mount(CollectionRunnerPanel, { target: document.body });

// Notify the extension that we're ready
vscode.postMessage({ type: 'ready' });
