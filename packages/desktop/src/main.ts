// Main entry point for Tauri desktop app
import { mount } from 'svelte';
import { setJsonExplorerOpensInPlace } from '@nouto/ui/stores/hostCapabilities.svelte';
import App from './App.svelte';
import './app.css';

// Desktop has one explorer view: subtree/embedded-JSON opens replace it (stack + Back).
setJsonExplorerOpensInPlace(true);

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
