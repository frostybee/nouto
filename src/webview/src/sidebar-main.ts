import { mount } from 'svelte';
import '@vscode/codicons/dist/codicon.css';
import SidebarApp from './SidebarApp.svelte';
import './styles/sidebar.css';

// Create sidebar app
const app = mount(SidebarApp, {
  target: document.body,
});

export default app;
