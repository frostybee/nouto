/**
 * Hosts the real preview shell outside VS Code so the Playwright security suite
 * can drive it. Only the `vscode` API object is faked; the component, frame
 * builder, and renderer bundles are the production ones.
 */
import { mount } from 'svelte';
import OpenApiPreview from '../../src/components/openapi/OpenApiPreview.svelte';

declare global {
  interface Window {
    __posted: unknown[];
    __state: unknown;
    __sendPreviewData: (data: unknown) => void;
    __parentBreached: boolean;
  }
}

window.__posted = [];
window.__state = undefined;
window.__parentBreached = false;

const vscode = {
  postMessage: (message: unknown) => { window.__posted.push(message); },
  getState: () => window.__state,
  setState: (state: unknown) => { window.__state = state; },
};

window.__sendPreviewData = (data: unknown) => {
  window.postMessage({ type: 'openApiPreviewData', data }, '*');
};

mount(OpenApiPreview, {
  target: document.body,
  props: { vscode, sourceUri: 'file:///fixture.yaml' },
});
