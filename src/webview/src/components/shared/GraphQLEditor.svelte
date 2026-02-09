<script lang="ts">
  import type { BodyState, AuthState, KeyValue } from '../../types';
  import { handleTextareaTab } from '../../lib/editor-helpers';
  import { postMessage, onMessage } from '../../lib/vscode';
  import { setSchemaLoading, setSchema, setSchemaError, clearSchema, graphqlSchemaStore } from '../../stores/graphqlSchema';
  import GraphQLSchemaExplorer from './GraphQLSchemaExplorer.svelte';

  interface Props {
    body: BodyState;
    onchange: (body: BodyState) => void;
    url?: string;
    headers?: KeyValue[];
    auth?: AuthState;
  }
  let { body, onchange, url = '', headers = [], auth = { type: 'none' } }: Props = $props();

  let showExplorer = $state(false);

  const store = $derived($graphqlSchemaStore);

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

  function handleQueryKeyDown(event: KeyboardEvent) {
    handleTextareaTab(event, updateQuery);
  }

  function handleVariablesKeyDown(event: KeyboardEvent) {
    handleTextareaTab(event, updateVariables);
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
        <label class="section-label" for="graphql-query">Query</label>
        <textarea
          id="graphql-query"
          class="code-editor query-editor"
          placeholder={"query { \n  users {\n    id\n    name\n  }\n}"}
          value={body.content}
          oninput={(e) => updateQuery(e.currentTarget.value)}
          onkeydown={handleQueryKeyDown}
          spellcheck="false"
        ></textarea>
      </div>

      <div class="section">
        <div class="section-header">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="section-label">Variables (JSON)</label>
          <div class="section-actions">
            {#if !isValidVariablesJson}
              <span class="json-error">Invalid JSON</span>
            {/if}
            <button class="toolbar-btn" onclick={formatVariables} title="Format JSON">
              Format
            </button>
          </div>
        </div>
        <textarea
          aria-label="Variables (JSON)"
          class="code-editor variables-editor"
          class:error={!isValidVariablesJson}
          placeholder={'{"key": "value"}'}
          value={body.graphqlVariables || ''}
          oninput={(e) => updateVariables(e.currentTarget.value)}
          onkeydown={handleVariablesKeyDown}
          spellcheck="false"
        ></textarea>
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
    border: 2px solid var(--vscode-panel-border);
    border-top-color: var(--vscode-focusBorder);
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
    border: 1px solid var(--vscode-panel-border);
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
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .code-editor {
    padding: 8px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    font-family: var(--vscode-editor-font-family), 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
    tab-size: 2;
  }

  .code-editor:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .code-editor::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .code-editor.error {
    border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
  }

  .query-editor {
    flex: 1;
    min-height: 120px;
  }

  .variables-editor {
    min-height: 60px;
    max-height: 150px;
  }

  .operation-input {
    padding: 6px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    font-size: 13px;
  }

  .operation-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .operation-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .json-error {
    color: var(--vscode-errorForeground);
    font-size: 11px;
  }
</style>
