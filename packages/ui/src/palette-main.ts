import { mount } from 'svelte';
import CommandPaletteApp from './components/palette/CommandPaletteApp.svelte';
import { postMessage } from './lib/vscode';
import { openPalette } from './stores/palette.svelte';
import { setCollections } from './stores/collections.svelte';
import { setEnvironments } from './stores/environment.svelte';

const app = mount(CommandPaletteApp, {
  target: document.body,
});

// Listen for messages from the extension
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'initialData':
      // Update stores with data from extension
      if (message.data.collections) {
        setCollections(message.data.collections);
      }
      if (message.data.environments) {
        setEnvironments(message.data.environments);
      }
      // Open the palette once data is loaded
      openPalette();
      break;
  }
});

// Signal that the webview is ready
postMessage({ type: 'ready' });

export default app;
