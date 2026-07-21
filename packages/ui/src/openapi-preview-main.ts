import './styles/theme.css';
import { mount } from 'svelte';
import OpenApiPreview from './components/openapi/OpenApiPreview.svelte';

declare const vscode: {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const sourceUri = (window as unknown as { __noutoOpenApiSourceUri?: string })
  .__noutoOpenApiSourceUri ?? '';

mount(OpenApiPreview, {
  target: document.body,
  props: { vscode, sourceUri },
});
