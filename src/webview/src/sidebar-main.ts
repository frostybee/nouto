import { mount } from 'svelte';
import SidebarApp from './SidebarApp.svelte';
import './styles/theme.css';
import './styles/sidebar.css';

// Create sidebar app
const app = mount(SidebarApp, {
  target: document.body,
});

export default app;
