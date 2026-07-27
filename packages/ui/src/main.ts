import { mount } from 'svelte';
import App from './App.svelte';
import './styles/main.css';
import { setCanEditOpenApiSpec } from './stores/hostCapabilities.svelte';

// This entry only boots the VS Code request-panel webview (the desktop app has
// its own entry in packages/desktop), so VS Code-only capabilities go here.
setCanEditOpenApiSpec(true);

// Create app - message handling is done in App.svelte
const app = mount(App, {
  target: document.body,
});

export default app;
