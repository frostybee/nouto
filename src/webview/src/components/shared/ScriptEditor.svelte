<script lang="ts">
  import { onMount } from 'svelte';
  import { request } from '../../stores/request';
  import { EditorView, lineNumbers, keymap } from '@codemirror/view';
  import { EditorState, Compartment } from '@codemirror/state';
  import { javascript } from '@codemirror/lang-javascript';
  import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
  import { bracketMatching } from '@codemirror/language';
  import { hfAutocomplete } from '../../lib/codemirror/hf-autocomplete';
  import { getThemeExtensions } from '../../lib/codemirror-theme';

  let activeSection = $state<'pre' | 'post'>('pre');
  let preContainer: HTMLDivElement | undefined = $state();
  let postContainer: HTMLDivElement | undefined = $state();
  let preView: EditorView | undefined = $state();
  let postView: EditorView | undefined = $state();
  let themeCompartment = new Compartment();
  let updatingFromStore = false;

  function createExtensions() {
    return [
      javascript(),
      lineNumbers(),
      history(),
      bracketMatching(),
      hfAutocomplete(),
      themeCompartment.of(getThemeExtensions()),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !updatingFromStore) {
          updateScripts();
        }
      }),
    ];
  }

  onMount(() => {
    if (preContainer) {
      preView = new EditorView({
        state: EditorState.create({
          doc: $request.scripts?.preRequest || '',
          extensions: createExtensions(),
        }),
        parent: preContainer,
      });
    }

    if (postContainer) {
      postView = new EditorView({
        state: EditorState.create({
          doc: $request.scripts?.postResponse || '',
          extensions: createExtensions(),
        }),
        parent: postContainer,
      });
    }

    return () => {
      preView?.destroy();
      postView?.destroy();
    };
  });

  // Sync from store when loadRequest changes the request
  $effect(() => {
    const preContent = $request.scripts?.preRequest || '';
    const postContent = $request.scripts?.postResponse || '';

    if (preView && preView.state.doc.toString() !== preContent) {
      updatingFromStore = true;
      preView.dispatch({
        changes: { from: 0, to: preView.state.doc.length, insert: preContent },
      });
      updatingFromStore = false;
    }

    if (postView && postView.state.doc.toString() !== postContent) {
      updatingFromStore = true;
      postView.dispatch({
        changes: { from: 0, to: postView.state.doc.length, insert: postContent },
      });
      updatingFromStore = false;
    }
  });

  function updateScripts() {
    const preRequest = preView?.state.doc.toString() || '';
    const postResponse = postView?.state.doc.toString() || '';
    request.update((state) => ({
      ...state,
      scripts: { preRequest, postResponse },
    }));
  }

  function insertSnippet(text: string) {
    const view = activeSection === 'pre' ? preView : postView;
    if (!view) return;

    const pos = view.state.selection.main.head;
    const prefix = pos > 0 && view.state.doc.sliceString(pos - 1, pos) !== '\n' ? '\n' : '';
    view.dispatch({
      changes: { from: pos, insert: prefix + text },
      selection: { anchor: pos + prefix.length + text.length },
    });
    view.focus();
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
    { label: 'Set Next Request', code: "hf.setNextRequest('RequestName');" },
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
      {#if preView && preView.state.doc.length > 0}
        <span class="indicator"></span>
      {/if}
    </button>
    <button
      class="section-tab"
      class:active={activeSection === 'post'}
      onclick={() => (activeSection = 'post')}
    >
      Post-response Script
      {#if postView && postView.state.doc.length > 0}
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
    <div class="cm-wrapper" class:hidden={activeSection !== 'pre'} bind:this={preContainer}></div>
    <div class="cm-wrapper" class:hidden={activeSection !== 'post'} bind:this={postContainer}></div>
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
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-tab.active {
    opacity: 1;
    background: var(--hf-button-secondaryBackground);
    border-color: var(--hf-focusBorder);
  }

  .indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hf-charts-green, #49cc90);
  }

  .snippets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }

  .snippet-btn {
    padding: 3px 8px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  .snippet-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .editor-area {
    flex: 1;
    min-height: 120px;
  }

  .cm-wrapper {
    height: 100%;
    min-height: 120px;
    border: 1px solid var(--hf-input-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .cm-wrapper :global(.cm-editor) {
    height: 100%;
    min-height: 120px;
  }

  .cm-wrapper :global(.cm-scroller) {
    overflow: auto;
  }

  .hidden {
    display: none;
  }
</style>
