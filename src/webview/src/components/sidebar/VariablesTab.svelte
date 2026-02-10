<script lang="ts">
  import {
    environments,
    activeEnvironmentId,
    globalVariables,
    envFileVariables,
    envFilePath,
    addEnvironment,
    updateEnvironmentVariables,
    updateGlobalVariables,
    renameEnvironment,
    type Environment,
    type EnvironmentVariable,
  } from '../../stores/environment';
  import EnvironmentItem from './EnvironmentItem.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';

  interface Props {
    postMessage: (message: any) => void;
  }
  let { postMessage }: Props = $props();

  let searchQuery = $state('');
  let searchInput: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout>;

  // Editor state
  let showEditor = $state(false);
  let editingEnv: Environment | null = $state(null);
  let editingIsGlobal = $state(false);
  let editingVariables: EnvironmentVariable[] = $state([]);
  let editingName = $state('');

  // Create a virtual "Global Variables" environment for display
  const globalEnv = $derived<Environment>({
    id: '__global__',
    name: 'Global Variables',
    variables: $globalVariables,
    isGlobal: true,
  });

  function filterEnvironments(envs: Environment[], query: string): Environment[] {
    if (!query.trim()) return envs;
    const lowerQuery = query.toLowerCase();
    return envs.filter((env) => env.name.toLowerCase().includes(lowerQuery));
  }

  // Filter environments by name
  const filteredEnvironments = $derived(filterEnvironments($environments, searchQuery));
  const hasEnvironments = $derived($environments.length > 0);
  const hasResults = $derived(filteredEnvironments.length > 0);
  const showNoResults = $derived(hasEnvironments && !hasResults && searchQuery.trim().length > 0);

  // Check if global variables match search
  const showGlobal = $derived(
    !searchQuery.trim() || globalEnv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // .env file state
  const envFileName = $derived(
    $envFilePath ? $envFilePath.split(/[\\/]/).pop() || '.env' : null
  );

  function handleLinkEnvFile() {
    postMessage({ type: 'linkEnvFile' });
  }

  function handleUnlinkEnvFile() {
    postMessage({ type: 'unlinkEnvFile' });
  }

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = target.value;
    }, 150);
  }

  function clearSearch() {
    searchQuery = '';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      clearSearch();
    }
  }

  function handleNewEnvironment() {
    const env = addEnvironment('New Environment');
    handleOpenEditor(env, false);
  }

  // Editor handlers
  function handleOpenEditor(env: Environment, isGlobal: boolean) {
    editingEnv = { ...env };
    editingVariables = env.variables.map(v => ({ ...v }));
    editingName = env.name;
    editingIsGlobal = isGlobal;
    showEditor = true;
  }

  function handleSaveEditor() {
    if (!editingEnv) return;
    if (editingIsGlobal) {
      updateGlobalVariables(editingVariables);
    } else {
      updateEnvironmentVariables(editingEnv.id, editingVariables);
      const trimmedName = editingName.trim();
      if (trimmedName && trimmedName !== editingEnv.name) {
        renameEnvironment(editingEnv.id, trimmedName);
      }
    }
    showEditor = false;
    editingEnv = null;
  }

  function handleCancelEditor() {
    showEditor = false;
    editingEnv = null;
  }

  function handleVariablesChange(items: EnvironmentVariable[]) {
    editingVariables = items;
  }

  function handleEditorOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleCancelEditor();
    }
  }
</script>

<div class="variables-tab">
  <div class="toolbar">
    <div class="search-wrapper">
      <span class="search-icon codicon codicon-search"></span>
      <input
        type="text"
        class="search-input"
        placeholder="Filter environments..."
        bind:this={searchInput}
        oninput={handleSearchInput}
        onkeydown={handleSearchKeydown}
      />
      {#if searchQuery}
        <button class="clear-search" onclick={clearSearch} title="Clear search">
          <i class="codicon codicon-close"></i>
        </button>
      {/if}
    </div>
    <button class="toolbar-button" onclick={handleNewEnvironment} title="New Environment">
      <span class="codicon codicon-add"></span>
    </button>
  </div>

  <div class="environments-content">
    <!-- .env File Section -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">.env File</span>
        {#if envFileName}
          <span class="section-hint">{envFileName}</span>
        {/if}
      </div>
      {#if $envFilePath}
        <div class="env-file-linked">
          <div class="env-file-info">
            <span class="env-file-icon codicon codicon-file"></span>
            <span class="env-file-name" title={$envFilePath}>{envFileName}</span>
            <span class="env-file-count">{$envFileVariables.length} var{$envFileVariables.length !== 1 ? 's' : ''}</span>
          </div>
          {#if $envFileVariables.length > 0}
            <div class="env-file-vars">
              {#each $envFileVariables as v}
                <div class="env-var-row">
                  <span class="env-var-key">{v.key}</span>
                  <span class="env-var-value">{v.value}</span>
                </div>
              {/each}
            </div>
          {/if}
          <button class="unlink-btn" onclick={handleUnlinkEnvFile}>
            <span class="codicon codicon-unlink"></span>
            Unlink
          </button>
        </div>
      {:else}
        <div class="env-file-unlinked">
          <button class="link-btn" onclick={handleLinkEnvFile}>
            <span class="codicon codicon-link"></span>
            Link .env File
          </button>
        </div>
      {/if}
    </div>

    <!-- Global Variables Section (always shown if matches search) -->
    {#if showGlobal}
      <div class="section">
        <div class="section-header">
          <span class="section-title">Global</span>
          <span class="section-hint">Always active</span>
        </div>
        <EnvironmentItem environment={globalEnv} isGlobal={true} {postMessage} onOpenEditor={handleOpenEditor} />
      </div>
    {/if}

    <!-- Environments Section -->
    {#if hasEnvironments || !searchQuery}
      <div class="section">
        <div class="section-header">
          <span class="section-title">Environments</span>
          <span class="section-count">{$environments.length}</span>
        </div>

        {#if hasResults}
          <div class="environments-list">
            {#each filteredEnvironments as env (env.id)}
              <EnvironmentItem
                environment={env}
                isActive={env.id === $activeEnvironmentId}
                {postMessage}
                onOpenEditor={handleOpenEditor}
              />
            {/each}
          </div>
        {:else if showNoResults}
          <div class="empty-state small">
            <p class="empty-description">No environments match "{searchQuery}"</p>
            <button class="clear-search-button" onclick={clearSearch}>
              Clear search
            </button>
          </div>
        {:else if !hasEnvironments}
          <div class="empty-state small">
            <p class="empty-description">
              Click + to create an environment
            </p>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Full empty state when no environments and no global vars -->
  {#if !hasEnvironments && $globalVariables.length === 0 && !searchQuery}
    <div class="empty-state full">
      <div class="empty-icon codicon codicon-symbol-variable"></div>
      <p class="empty-title">No Variables</p>
      <p class="empty-description">
        Create environments to manage variables across requests. Use <code>{'{{varName}}'}</code> in
        URLs, headers, and body.
      </p>
      <button class="create-button" onclick={handleNewEnvironment}>
        Create Environment
      </button>
    </div>
  {/if}

  <!-- Environment Variable Editor Modal -->
  {#if showEditor && editingEnv}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="env-editor-overlay"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => { if (e.target === e.currentTarget) handleCancelEditor(); }}
      onkeydown={handleEditorOverlayKeydown}
    >
      <div class="env-editor">
        <div class="editor-header">
          {#if editingIsGlobal}
            <span class="editor-title">Global Variables</span>
          {:else}
            <input
              type="text"
              class="env-name-input"
              bind:value={editingName}
              placeholder="Environment name"
            />
          {/if}
          <button class="close-btn" onclick={handleCancelEditor} title="Close">
            <span class="codicon codicon-close"></span>
          </button>
        </div>
        <div class="editor-content">
          <p class="editor-hint">
            Use <code>{"{{variableName}}"}</code> in URLs, headers, and body to substitute values.
          </p>
          <KeyValueEditor
            items={editingVariables}
            keyPlaceholder="Variable name"
            valuePlaceholder="Value"
            onchange={handleVariablesChange}
          />
        </div>
        <div class="editor-footer">
          <button class="cancel-btn" onclick={handleCancelEditor}>Cancel</button>
          <button class="save-btn" onclick={handleSaveEditor}>Save</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .variables-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .search-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 8px;
    font-size: 12px;
    opacity: 0.6;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 6px 28px 6px 28px;
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    outline: none;
  }

  .search-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .search-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .clear-search {
    position: absolute;
    right: 4px;
    padding: 2px 6px;
    background: none;
    border: none;
    color: var(--vscode-foreground);
    font-size: 14px;
    cursor: pointer;
    opacity: 0.6;
    border-radius: 3px;
  }

  .clear-search:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--vscode-button-secondaryBackground);
    border: none;
    border-radius: 4px;
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .toolbar-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .codicon {
    line-height: 1;
  }

  .environments-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .section {
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: var(--vscode-sideBarSectionHeader-background);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-sideBarSectionHeader-foreground);
  }

  .section-title {
    opacity: 0.8;
  }

  .section-hint {
    font-weight: normal;
    font-size: 10px;
    opacity: 0.6;
    text-transform: none;
    letter-spacing: normal;
  }

  .section-count {
    font-weight: normal;
    padding: 1px 5px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    font-size: 10px;
  }

  .environments-list {
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
  }

  .empty-state.full {
    flex: 1;
  }

  .empty-state.small {
    padding: 16px 12px;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .empty-title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .empty-description {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    max-width: 220px;
  }

  .empty-description code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 11px;
  }

  .clear-search-button,
  .create-button {
    margin-top: 12px;
    padding: 6px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .clear-search-button:hover,
  .create-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .create-button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .create-button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  /* .env File Section */
  .env-file-linked {
    padding: 8px 12px;
  }

  .env-file-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--vscode-foreground);
    margin-bottom: 6px;
  }

  .env-file-icon {
    font-size: 14px;
    opacity: 0.7;
  }

  .env-file-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .env-file-count {
    margin-left: auto;
    font-size: 10px;
    padding: 1px 5px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    flex-shrink: 0;
  }

  .env-file-vars {
    margin-bottom: 8px;
    max-height: 150px;
    overflow-y: auto;
  }

  .env-var-row {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    font-size: 11px;
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .env-var-key {
    color: var(--vscode-symbolIcon-variableForeground, var(--vscode-foreground));
    font-weight: 500;
    flex-shrink: 0;
  }

  .env-var-value {
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unlink-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: none;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .unlink-btn:hover {
    background: var(--vscode-list-hoverBackground);
    color: var(--vscode-errorForeground);
    border-color: var(--vscode-errorForeground);
  }

  .env-file-unlinked {
    padding: 12px;
    display: flex;
    justify-content: center;
  }

  .link-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .link-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  /* Environment Editor Modal */
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
    width: 92%;
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
    gap: 8px;
  }

  .editor-title {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .env-name-input {
    flex: 1;
    padding: 8px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
  }

  .env-name-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .close-btn {
    padding: 4px 8px;
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 14px;
    opacity: 0.7;
    border-radius: 4px;
  }

  .close-btn:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
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
