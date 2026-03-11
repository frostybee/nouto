import './styles/theme.css';
import BenchmarkPanel from './components/benchmark/BenchmarkPanel.svelte';
import {
  initBenchmark,
  setRunning,
  updateProgress,
  addIteration,
  setCompleted,
  setCancelled,
} from './stores/benchmark.svelte';
import { mount } from 'svelte';

declare const vscode: { postMessage: (msg: any) => void };

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'initBenchmark':
      initBenchmark(message.data);
      break;
    case 'benchmarkProgress':
      updateProgress(message.data.current, message.data.total);
      break;
    case 'benchmarkIterationComplete':
      addIteration(message.data);
      break;
    case 'benchmarkComplete':
      setCompleted(message.data);
      break;
    case 'benchmarkCancelled':
      setCancelled();
      break;
  }
});

mount(BenchmarkPanel, { target: document.body });

vscode.postMessage({ type: 'ready' });
