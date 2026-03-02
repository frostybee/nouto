import './styles/theme.css';
import EnvironmentsPanel from './components/environments/EnvironmentsPanel.svelte';
import { initEnvironmentPanel } from './stores/environmentsPanel';
import { loadEnvFileVariables } from './stores/environment';
import { setCookieJarData } from './stores/cookieJar';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'initEnvironments':
      initEnvironmentPanel(message.data);
      break;
    case 'envFileVariablesUpdated':
      loadEnvFileVariables(message.data);
      break;
    case 'cookieJarData':
      setCookieJarData(message.data || {});
      break;
  }
});

mount(EnvironmentsPanel, { target: document.body });

vscode.postMessage({ type: 'ready' });
