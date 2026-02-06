<script lang="ts">
  import {
    environments,
    activeEnvironmentId,
    activeEnvironment,
    addEnvironment,
    setActiveEnvironment,
    deleteEnvironment,
    updateEnvironmentVariables,
    type Environment,
    type EnvironmentVariable,
  } from '../../stores/environment';
  import KeyValueEditor from './KeyValueEditor.svelte';

  let showDropdown = $state(false);
  let showEditor = $state(false);
  let editingEnv: Environment | null = $state(null);

  const envList = $derived($environments);
  const activeId = $derived($activeEnvironmentId);
  const activeEnv = $derived($activeEnvironment);

  function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown) {
      showEditor = false;
    }
  }

  function selectEnvironment(id: string | null) {
    setActiveEnvironment(id);
    showDropdown = false;
  }

  function handleAddEnvironment() {
    const name = 'New Environment';
    const env = addEnvironment(name);
    editingEnv = env;
    showEditor = true;
    showDropdown = false;
  }

  function handleEditEnvironment(env: Environment) {
    editingEnv = { ...env, variables: [...env.variables] };
    showEditor = true;
    showDropdown = false;
  }

  function handleDeleteEnvironment(id: string) {
    if (confirm('Are you sure you want to delete this environment?')) {
      deleteEnvironment(id);
    }
  }

  function handleSaveEnvironment() {
    if (editingEnv) {
      updateEnvironmentVariables(editingEnv.id, editingEnv.variables);
    }
    showEditor = false;
    editingEnv = null;
  }

  function handleCancelEdit() {
    showEditor = false;
    editingEnv = null;
  }

  function handleVariablesChange(items: EnvironmentVariable[]) {
    if (editingEnv) {
      editingEnv.variables = items;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.env-selector')) {
      showDropdown = false;
    }
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="env-selector">
  <button
    class="env-button"
    class:active={activeEnv !== null}
    onclick={(e) => { e.stopPropagation(); toggleDropdown(); }}
    title="Select environment"
  >
    <span class="env-icon">ENV</span>
    {#if activeEnv}
      <span class="env-name">{activeEnv.name}</span>
    {:else}
      <span class="env-name muted">No Environment</span>
    {/if}
    <span class="dropdown-arrow">{showDropdown ? '▲' : '▼'}</span>
  </button>

  {#if showDropdown}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="env-dropdown" role="listbox" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="dropdown-header">Environments</div>

      <button
        class="env-option"
        class:selected={activeId === null}
        onclick={() => selectEnvironment(null)}
      >
        <span class="option-name">No Environment</span>
      </button>

      {#each envList as env}
        <div class="env-option-row">
          <button
            class="env-option"
            class:selected={activeId === env.id}
            onclick={() => selectEnvironment(env.id)}
          >
            <span class="option-name">{env.name}</span>
            <span class="var-count">{env.variables.filter(v => v.enabled).length} vars</span>
          </button>
          <button
            class="edit-btn"
            onclick={(e) => { e.stopPropagation(); handleEditEnvironment(env); }}
            title="Edit environment"
          >
            ✏️
          </button>
          <button
            class="delete-btn"
            onclick={(e) => { e.stopPropagation(); handleDeleteEnvironment(env.id); }}
            title="Delete environment"
          >
            🗑️
          </button>
        </div>
      {/each}

      <button class="add-env-btn" onclick={handleAddEnvironment}>
        + New Environment
      </button>
    </div>
  {/if}

  {#if showEditor && editingEnv}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="env-editor-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) handleCancelEdit(); }} onkeydown={handleOverlayKeydown}>
      <div class="env-editor">
        <div class="editor-header">
          <input
            type="text"
            class="env-name-input"
            bind:value={editingEnv.name}
            placeholder="Environment name"
          />
          <button class="close-btn" onclick={handleCancelEdit}>×</button>
        </div>
        <div class="editor-content">
          <p class="editor-hint">
            Use <code>{"{{variableName}}"}</code> in URLs, headers, and body to substitute values.
          </p>
          <KeyValueEditor
            items={editingEnv.variables}
            keyPlaceholder="Variable name"
            valuePlaceholder="Value"
            onchange={handleVariablesChange}
          />
        </div>
        <div class="editor-footer">
          <button class="cancel-btn" onclick={handleCancelEdit}>Cancel</button>
          <button class="save-btn" onclick={handleSaveEnvironment}>Save</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .env-selector {
    position: relative;
  }

  .env-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--vscode-input-background);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: border-color 0.15s;
  }

  .env-button:hover {
    border-color: var(--vscode-focusBorder);
  }

  .env-button.active {
    border-color: var(--vscode-charts-green, #49cc90);
  }

  .env-icon {
    padding: 2px 4px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
  }

  .env-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .env-name.muted {
    color: var(--vscode-descriptionForeground);
  }

  .dropdown-arrow {
    font-size: 8px;
    color: var(--vscode-descriptionForeground);
  }

  .env-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 220px;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 100;
    overflow: hidden;
  }

  .dropdown-header {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .env-option-row {
    display: flex;
    align-items: stretch;
  }

  .env-option {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .env-option:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .env-option.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .option-name {
    flex: 1;
  }

  .var-count {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-left: 8px;
  }

  .edit-btn,
  .delete-btn {
    padding: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.6;
  }

  .edit-btn:hover,
  .delete-btn:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
  }

  .add-env-btn {
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--vscode-panel-border);
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .add-env-btn:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .env-editor-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .env-editor {
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .env-name-input {
    flex: 1;
    padding: 8px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
  }

  .env-name-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .close-btn {
    margin-left: 12px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 18px;
    opacity: 0.7;
  }

  .close-btn:hover {
    opacity: 1;
  }

  .editor-content {
    flex: 1;
    padding: 16px;
    overflow: auto;
  }

  .editor-hint {
    margin: 0 0 12px;
    padding: 8px 12px;
    background: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textBlockQuote-border);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    border-radius: 0 4px 4px 0;
  }

  .editor-hint code {
    background: var(--vscode-textCodeBlock-background);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--vscode-panel-border);
  }

  .cancel-btn {
    padding: 8px 16px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .cancel-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .save-btn {
    padding: 8px 16px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .save-btn:hover {
    background: var(--vscode-button-hoverBackground);
  }
</style>
