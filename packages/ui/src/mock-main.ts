import './styles/theme.css';
import MockServerPanel from './components/mock/MockServerPanel.svelte';
import {
  initMockServer,
  setMockStatus,
  addLog,
} from './stores/mockServer.svelte';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'initMockServer':
      initMockServer(message.data);
      break;
    case 'mockStatusChanged':
      setMockStatus(message.data.status);
      break;
    case 'mockLogAdded':
      addLog(message.data);
      break;
  }
});

mount(MockServerPanel, { target: document.body });

vscode.postMessage({ type: 'ready' });
