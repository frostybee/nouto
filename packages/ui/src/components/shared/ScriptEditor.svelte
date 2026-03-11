<script lang="ts">
  import { onMount } from 'svelte';
  import type { ScriptConfig } from '../../types';
  import type { InheritedScriptEntry } from '../../stores/environment.svelte';
  import Tooltip from './Tooltip.svelte';
  import InheritedScriptsViewer from './InheritedScriptsViewer.svelte';
  import { EditorView, lineNumbers, keymap } from '@codemirror/view';
  import { EditorState, Compartment } from '@codemirror/state';
  import { javascript } from '@codemirror/lang-javascript';
  import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
  import { bracketMatching } from '@codemirror/language';
  import { hfAutocomplete } from '../../lib/codemirror/hf-autocomplete';
  import { getThemeExtensions } from '../../lib/codemirror-theme';

  interface Props {
    scripts?: ScriptConfig;
    inheritedScripts?: InheritedScriptEntry[];
    onchange?: (scripts: ScriptConfig) => void;
  }
  let { scripts, inheritedScripts, onchange }: Props = $props();

  let activeSection = $state<'pre' | 'post'>('pre');
  let preContainer: HTMLDivElement | undefined = $state();
  let postContainer: HTMLDivElement | undefined = $state();
  let preView: EditorView | undefined = $state();
  let postView: EditorView | undefined = $state();
  let themeCompartment = new Compartment();
  let updatingFromProp = false;

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
        if (update.docChanged && !updatingFromProp) {
          updateScripts();
        }
      }),
    ];
  }

  onMount(() => {
    if (preContainer) {
      preView = new EditorView({
        state: EditorState.create({
          doc: scripts?.preRequest || '',
          extensions: createExtensions(),
        }),
        parent: preContainer,
      });
    }

    if (postContainer) {
      postView = new EditorView({
        state: EditorState.create({
          doc: scripts?.postResponse || '',
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

  // Sync from props when scripts change externally
  $effect(() => {
    const preContent = scripts?.preRequest || '';
    const postContent = scripts?.postResponse || '';

    if (preView && preView.state.doc.toString() !== preContent) {
      updatingFromProp = true;
      preView.dispatch({
        changes: { from: 0, to: preView.state.doc.length, insert: preContent },
      });
      updatingFromProp = false;
    }

    if (postView && postView.state.doc.toString() !== postContent) {
      updatingFromProp = true;
      postView.dispatch({
        changes: { from: 0, to: postView.state.doc.length, insert: postContent },
      });
      updatingFromProp = false;
    }
  });

  function updateScripts() {
    const preRequest = preView?.state.doc.toString() || '';
    const postResponse = postView?.state.doc.toString() || '';
    onchange?.({ preRequest, postResponse });
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
      <Tooltip text={snippet.code} position="top">
        <button class="snippet-btn" onclick={() => insertSnippet(snippet.code)} aria-label={snippet.label}>
          {snippet.label}
        </button>
      </Tooltip>
    {/each}
  </div>

  {#if inheritedScripts && inheritedScripts.length > 0}
    <InheritedScriptsViewer {inheritedScripts} activePhase={activeSection} />
  {/if}

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
    padding: 4px 10px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .snippet-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
    border-color: var(--hf-focusBorder);
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
