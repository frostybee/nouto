import { mount } from 'svelte';
import '@vscode/codicons/dist/codicon.css';
import App from './App.svelte';
import './styles/global.css';

// Create app - message handling is done in App.svelte
const app = mount(App, {
  target: document.body,
});

export default app;
