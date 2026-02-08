<script lang="ts">
  import type { BodyState } from '../../types';
  import { handleTextareaTab } from '../../lib/editor-helpers';

  interface Props {
    body: BodyState;
    onchange: (body: BodyState) => void;
  }
  let { body, onchange }: Props = $props();

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
</script>

<div class="graphql-editor">
  <div class="section">
    <label class="section-label">Query</label>
    <textarea
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
    <label class="section-label">Operation Name (optional)</label>
    <input
      type="text"
      class="operation-input"
      placeholder="e.g. GetUsers"
      value={body.graphqlOperationName || ''}
      oninput={(e) => updateOperationName(e.currentTarget.value)}
    />
  </div>
</div>

<style>
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
    padding: 2px 8px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .json-error {
    color: var(--vscode-errorForeground);
    font-size: 11px;
  }
</style>
