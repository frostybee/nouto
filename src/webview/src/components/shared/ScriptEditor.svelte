<script lang="ts">
  import { request } from '../../stores/request';
  import type { ScriptConfig } from '../../types';

  let preRequest = $state($request.scripts?.preRequest || '');
  let postResponse = $state($request.scripts?.postResponse || '');
  let activeSection = $state<'pre' | 'post'>('pre');

  // Sync from store when loadRequest changes the request
  $effect(() => {
    preRequest = $request.scripts?.preRequest || '';
    postResponse = $request.scripts?.postResponse || '';
  });

  function updateScripts() {
    request.update((state) => ({
      ...state,
      scripts: { preRequest, postResponse },
    }));
  }

  function handlePreChange(event: Event) {
    preRequest = (event.target as HTMLTextAreaElement).value;
    updateScripts();
  }

  function handlePostChange(event: Event) {
    postResponse = (event.target as HTMLTextAreaElement).value;
    updateScripts();
  }

  function insertSnippet(text: string) {
    if (activeSection === 'pre') {
      preRequest += (preRequest ? '\n' : '') + text;
    } else {
      postResponse += (postResponse ? '\n' : '') + text;
    }
    updateScripts();
  }

  const preSnippets = [
    { label: 'Set Header', code: "hf.request.setHeader('X-Custom', 'value');" },
    { label: 'Get Variable', code: "const val = hf.getVar('myVar');" },
    { label: 'Set Variable', code: "hf.setVar('myVar', 'value');" },
    { label: 'Log', code: "console.log('Pre-request running');" },
    { label: 'UUID', code: "const id = hf.uuid();" },
    { label: 'Base64 Encode', code: "const encoded = hf.base64.encode('data');" },
  ];

  const postSnippets = [
    { label: 'Test Status', code: "hf.test('Status is 200', () => {\n  if (hf.response.status !== 200) throw new Error('Expected 200');\n});" },
    { label: 'Test Body', code: "hf.test('Has data', () => {\n  const body = hf.response.json();\n  if (!body.data) throw new Error('Missing data');\n});" },
    { label: 'Set Variable', code: "hf.setVar('token', hf.response.json().token);" },
    { label: 'Log Response', code: "console.log('Status:', hf.response.status);" },
    { label: 'Hash', code: "const hash = hf.hash.sha256(hf.response.text());" },
  ];

  const snippets = $derived(activeSection === 'pre' ? preSnippets : postSnippets);
</script>

<div class="script-editor">
  <div class="section-tabs">
    <button
      class="section-tab"
      class:active={activeSection === 'pre'}
      onclick={() => (activeSection = 'pre')}
    >
      Pre-request Script
      {#if preRequest.trim()}
        <span class="indicator"></span>
      {/if}
    </button>
    <button
      class="section-tab"
      class:active={activeSection === 'post'}
      onclick={() => (activeSection = 'post')}
    >
      Post-response Script
      {#if postResponse.trim()}
        <span class="indicator"></span>
      {/if}
    </button>
  </div>

  <div class="snippets">
    {#each snippets as snippet}
      <button class="snippet-btn" onclick={() => insertSnippet(snippet.code)} title={snippet.code}>
        {snippet.label}
      </button>
    {/each}
  </div>

  <div class="editor-area">
    {#if activeSection === 'pre'}
      <textarea
        class="script-textarea"
        value={preRequest}
        oninput={handlePreChange}
        placeholder="// JavaScript to run before the request is sent&#10;// Access request via hf.request (url, method, headers, body)&#10;// Set variables with hf.setVar(name, value)"
        spellcheck="false"
      ></textarea>
    {:else}
      <textarea
        class="script-textarea"
        value={postResponse}
        oninput={handlePostChange}
        placeholder="// JavaScript to run after the response is received&#10;// Access response via hf.response (status, headers, body, json())&#10;// Write tests with hf.test(name, fn)"
        spellcheck="false"
      ></textarea>
    {/if}
  </div>
</div>

<style>
  .script-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .section-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }

  .section-tab {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-tab.active {
    opacity: 1;
    background: var(--vscode-button-secondaryBackground);
    border-color: var(--vscode-focusBorder);
  }

  .indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--vscode-charts-green, #49cc90);
  }

  .snippets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }

  .snippet-btn {
    padding: 3px 8px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  .snippet-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .editor-area {
    flex: 1;
    min-height: 120px;
  }

  .script-textarea {
    width: 100%;
    height: 100%;
    min-height: 120px;
    resize: vertical;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 8px;
    font-family: var(--vscode-editor-font-family, 'Consolas, monospace');
    font-size: 12px;
    line-height: 1.5;
    tab-size: 2;
    box-sizing: border-box;
  }

  .script-textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .script-textarea::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
</style>
