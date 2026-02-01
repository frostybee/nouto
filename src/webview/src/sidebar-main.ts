import SidebarApp from './SidebarApp.svelte';
import './styles/sidebar.css';

// Create sidebar app
const app = new SidebarApp({
  target: document.body,
});

export default app;
