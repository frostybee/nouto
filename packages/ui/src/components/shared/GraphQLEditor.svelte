<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { BodyState, AuthState, KeyValue } from '../../types';
  import { postMessage, onMessage } from '../../lib/vscode';
  import { setSchemaLoading, setSchema, setSchemaError, clearSchema, graphqlSchemaStore } from '../../stores/graphqlSchema.svelte';
  import GraphQLSchemaExplorer from './GraphQLSchemaExplorer.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import Tooltip from './Tooltip.svelte';

  // CodeMirror imports for the query editor
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers } from '@codemirror/view';
  import { bracketMatching, indentOnInput } from '@codemirror/language';
  import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
  import { graphql as cmGraphql, updateSchema as cmUpdateSchema } from 'cm6-graphql';
  import { parse, print, buildClientSchema } from 'graphql';
  import { getThemeExtensions, isVscodeDark } from '../../lib/codemirror-theme';
  import rainbowBrackets from 'rainbowbrackets';

  interface Props {
    body: BodyState;
    onchange: (body: BodyState) => void;
    url?: string;
    headers?: KeyValue[];
    auth?: AuthState;
  }
  let { body, onchange, url = '', headers = [], auth = { type: 'none' } }: Props = $props();

  let showExplorer = $state(false);

  const store = $derived(graphqlSchemaStore);

  const isValidVariablesJson = $derived((() => {
    if (!body.graphqlVariables?.trim()) return true;
    try {
      JSON.parse(body.graphqlVariables);
      return true;
    } catch {
      return false;
    }
  })());

  function updateQuery(content: string) {
    onchange({ ...body, content });
  }

  function updateVariables(graphqlVariables: string) {
    onchange({ ...body, graphqlVariables });
  }

  function updateOperationName(graphqlOperationName: string) {
    onchange({ ...body, graphqlOperationName });
  }

  function formatVariables() {
    if (!body.graphqlVariables?.trim()) return;
    try {
      const parsed = JSON.parse(body.graphqlVariables);
      updateVariables(JSON.stringify(parsed, null, 2));
    } catch {
      // Invalid JSON, don't format
    }
  }

  function formatQuery() {
    if (!body.content?.trim()) return;
    try {
      const ast = parse(body.content);
      updateQuery(print(ast));
    } catch {
      // Invalid GraphQL query, don't format
    }
  }

  function fetchSchema() {
    if (!url?.trim()) return;
    setSchemaLoading(url);
    showExplorer = true;
    postMessage({
      type: 'introspectGraphQL',
      data: { url, headers: headers || [], auth: auth || { type: 'none' } },
    });
  }

  function toggleExplorer() {
    showExplorer = !showExplorer;
  }

  $effect(() => {
    const cleanup = onMessage((msg) => {
      if (msg.type === 'graphqlSchema') {
        setSchema(msg.data);
      } else if (msg.type === 'graphqlSchemaError') {
        setSchemaError(msg.data.message);
      }
    });
    return cleanup;
  });

  // --- CodeMirror query editor ---
  let queryContainer: HTMLDivElement;
  let queryView: EditorView | undefined;
  let themeObserver: MutationObserver | undefined;
  const themeCompartment = new Compartment();
  let currentIsDark = true;
  let updatingFromProp = false;

  onMount(() => {
    currentIsDark = isVscodeDark();

    const extensions = [
      // Intercept Ctrl+Enter so CodeMirror doesn't insert a newline;
      // the event still bubbles to the window handler which triggers send
      keymap.of([{ key: 'Mod-Enter', run: () => true }]),
      themeCompartment.of(getThemeExtensions()),
      lineNumbers(),
      bracketMatching(),
      rainbowBrackets(),
      closeBrackets(),
      indentOnInput(),
      history(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EditorView.lineWrapping,
      autocompletion(),
      ...cmGraphql(),
      cmPlaceholder("query {\n  users {\n    id\n    name\n  }\n}"),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !updatingFromProp) {
          updateQuery(update.state.doc.toString());
        }
      }),
    ];

    const state = EditorState.create({
      doc: body.content,
      extensions,
    });

    queryView = new EditorView({ state, parent: queryContainer });

    themeObserver = new MutationObserver(() => {
      const isDark = isVscodeDark();
      if (isDark !== currentIsDark && queryView) {
        currentIsDark = isDark;
        queryView.dispatch({
          effects: themeCompartment.reconfigure(getThemeExtensions()),
        });
      }
    });
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-vscode-theme-kind', 'class'],
    });
  });

  onDestroy(() => {
    themeObserver?.disconnect();
    queryView?.destroy();
  });

  // Sync content from parent (e.g., format button)
  $effect(() => {
    if (queryView && body.content !== undefined) {
      const currentDoc = queryView.state.doc.toString();
      if (currentDoc !== body.content) {
        updatingFromProp = true;
        queryView.dispatch({
          changes: { from: 0, to: queryView.state.doc.length, insert: body.content },
        });
        updatingFromProp = false;
      }
    }
  });

  // Feed fetched schema to cm6-graphql for autocomplete
  $effect(() => {
    if (queryView && store.schema) {
      try {
        const clientSchema = buildClientSchema({ __schema: store.schema as any });
        cmUpdateSchema(queryView, clientSchema);
      } catch {
        // Schema conversion failed, autocomplete won't work but editor still functions
      }
    }
  });
</script>

<div class="graphql-editor-wrapper">
  <div class="graphql-toolbar">
    <button class="toolbar-btn fetch-btn" onclick={fetchSchema} disabled={!url?.trim() || store.loading}>
      {#if store.loading}
        <span class="btn-spinner"></span>
        Fetching...
      {:else}
        <span class="codicon codicon-cloud-download"></span>
        Fetch Schema
      {/if}
    </button>
    {#if store.schema}
      <button class="toolbar-btn" onclick={toggleExplorer}>
        <span class="codicon codicon-symbol-structure"></span>
        {showExplorer ? 'Hide Explorer' : 'Show Explorer'}
      </button>
    {/if}
  </div>

  <div class="graphql-content" class:with-explorer={showExplorer && (store.schema || store.loading || store.error)}>
    <div class="graphql-editor">
      <div class="section">
        <div class="section-header">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="section-label">Query</label>
          <div class="section-actions">
            <Tooltip text="Format GraphQL query" position="top">
              <button class="toolbar-btn" onclick={formatQuery} aria-label="Format GraphQL query">
                Format
              </button>
            </Tooltip>
          </div>
        </div>
        <div class="cm-query-container" bind:this={queryContainer}></div>
      </div>

      <div class="section">
        <div class="section-header">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="section-label">Variables (JSON)</label>
          <div class="section-actions">
            {#if !isValidVariablesJson}
              <span class="json-error">Invalid JSON</span>
            {/if}
            <Tooltip text="Format JSON" position="top">
              <button class="toolbar-btn" onclick={formatVariables} aria-label="Format JSON">
                Format
              </button>
            </Tooltip>
          </div>
        </div>
        <div class="variables-cm-container">
          <CodeMirrorEditor
            content={body.graphqlVariables || ''}
            language="json"
            placeholder={'{"key": "value"}'}
            onchange={updateVariables}
            enableLint={true}
          />
        </div>
      </div>

      <div class="section">
        <label class="section-label">
          Operation Name (optional)
          <input
            type="text"
            class="operation-input"
            placeholder="e.g. GetUsers"
            value={body.graphqlOperationName || ''}
            oninput={(e) => updateOperationName(e.currentTarget.value)}
          />
        </label>
      </div>
    </div>

    {#if showExplorer && (store.schema || store.loading || store.error)}
      <div class="explorer-panel">
        <GraphQLSchemaExplorer />
      </div>
    {/if}
  </div>
</div>

<style>
  .graphql-editor-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 8px;
  }

  .graphql-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .fetch-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--hf-panel-border);
    border-top-color: var(--hf-focusBorder);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .graphql-content {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 8px;
  }

  .graphql-content.with-explorer .graphql-editor {
    flex: 1;
    min-width: 0;
  }

  .explorer-panel {
    width: 300px;
    flex-shrink: 0;
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .graphql-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section:first-child {
    flex: 1;
    min-height: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cm-query-container {
    flex: 1;
    min-height: 120px;
    overflow: hidden;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
  }

  .cm-query-container :global(.cm-editor) {
    height: 100%;
  }

  .cm-query-container :global(.cm-editor.cm-focused) {
    outline: none;
    border: none;
  }

  .cm-query-container:focus-within {
    border-color: var(--hf-focusBorder);
  }

  .variables-cm-container {
    max-height: 150px;
    overflow: auto;
    border-radius: 4px;
  }

  .variables-cm-container :global(.cm-editor-container) {
    min-height: 60px;
  }

  .operation-input {
    padding: 6px 12px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 13px;
  }

  .operation-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .operation-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }

  .toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .json-error {
    color: var(--hf-errorForeground);
    font-size: 11px;
  }
</style>
