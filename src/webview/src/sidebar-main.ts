import { mount } from 'svelte';
import SidebarApp from './SidebarApp.svelte';
import './styles/sidebar.css';

// Create sidebar app
const app = mount(SidebarApp, {
  target: document.body,
});

export default app;
