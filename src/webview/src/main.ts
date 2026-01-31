import App from './App.svelte';
import './styles/global.css';

// Create app - message handling is done in App.svelte
const app = new App({
  target: document.body,
});

export default app;
