import { mount } from 'svelte';
import App from './App.svelte';
import './styles/main.css';

// Create app - message handling is done in App.svelte
const app = mount(App, {
  target: document.body,
});

export default app;
