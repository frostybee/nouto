import { mount } from 'svelte';
import CommandPaletteApp from './components/palette/CommandPaletteApp.svelte';
import { palette } from './stores/palette';
import { collections } from './stores/collections';
import { environments } from './stores/environment';

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
        collections.set(message.data.collections);
      }
      if (message.data.environments) {
        environments.set(message.data.environments);
      }
      // Open the palette once data is loaded
      palette.open();
      break;
  }
});

// Signal that the webview is ready
if (window.vscode) {
  window.vscode.postMessage({ type: 'ready' });
}

export default app;
