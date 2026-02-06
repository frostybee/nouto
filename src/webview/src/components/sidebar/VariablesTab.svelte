<script lang="ts">
  import {
    environments,
    activeEnvironmentId,
    globalVariables,
    addEnvironment,
    type Environment,
  } from '../../stores/environment';
  import EnvironmentItem from './EnvironmentItem.svelte';

  interface Props {
    postMessage: (message: any) => void;
  }
  let { postMessage }: Props = $props();

  let searchQuery = $state('');
  let searchInput: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout>;
  let isCreating = $state(false);
  let newEnvName = $state('');

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
    isCreating = true;
    newEnvName = '';
  }

  function createEnvironment() {
    const name = newEnvName.trim();
    if (name) {
      addEnvironment(name);
    }
    isCreating = false;
    newEnvName = '';
  }

  function cancelCreate() {
    isCreating = false;
    newEnvName = '';
  }

  function handleCreateKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      createEnvironment();
    } else if (e.key === 'Escape') {
      cancelCreate();
    }
  }
</script>

<div class="variables-tab">
  <div class="toolbar">
    <div class="search-wrapper">
      <span class="search-icon">&#128269;</span>
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
          &times;
        </button>
      {/if}
    </div>
    {#if isCreating}
      <div class="create-form">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          class="create-input"
          placeholder="Name..."
          bind:value={newEnvName}
          onkeydown={handleCreateKeydown}
          onblur={createEnvironment}
          autofocus
        />
      </div>
    {:else}
      <button class="toolbar-button" onclick={handleNewEnvironment} title="New Environment">
        <span class="codicon">+</span>
      </button>
    {/if}
  </div>

  <div class="environments-content">
    <!-- Global Variables Section (always shown if matches search) -->
    {#if showGlobal}
      <div class="section">
        <div class="section-header">
          <span class="section-title">Global</span>
          <span class="section-hint">Always active</span>
        </div>
        <EnvironmentItem environment={globalEnv} isGlobal={true} {postMessage} />
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
      <div class="empty-icon">&#128203;</div>
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

  .create-form {
    flex-shrink: 0;
  }

  .create-input {
    width: 100px;
    padding: 6px 8px;
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    outline: none;
  }

  .create-input:focus {
    border-color: var(--vscode-focusBorder);
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
</style>
