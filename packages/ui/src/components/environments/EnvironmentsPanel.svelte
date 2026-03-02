<script lang="ts">
  import {
    environments,
    activeEnvironmentId,
    globalVariables,
    envFileVariables,
    envFilePath,
    addEnvironment,
    deleteEnvironment,
    duplicateEnvironment,
    updateEnvironmentVariables,
    updateGlobalVariables,
    renameEnvironment,
    setActiveEnvironment,
    type Environment,
    type EnvironmentVariable,
  } from '../../stores/environment';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import CookieJarPanel from '../shared/CookieJarPanel.svelte';

  type Tab = 'global' | 'environments' | 'cookies';

  let activeTab = $state<Tab>('environments');

  // ── Global Variables tab ───────────────────────────────────────────
  let globalVarsDirty = $state(false);
  let editingGlobalVars: EnvironmentVariable[] = $state([]);

  $effect(() => {
    editingGlobalVars = $globalVariables.map(v => ({ ...v }));
    globalVarsDirty = false;
  });

  function handleGlobalVarsChange(items: EnvironmentVariable[]) {
    editingGlobalVars = items;
    globalVarsDirty = true;
  }

  function saveGlobalVars() {
    updateGlobalVariables(editingGlobalVars);
    window.vscode.postMessage({ type: 'saveEnvironments', data: buildSaveData() });
    globalVarsDirty = false;
  }

  // ── Environments tab ───────────────────────────────────────────────
  let selectedEnvId = $state<string | null>(null);
  let editingEnvName = $state('');
  let editingEnvVars: EnvironmentVariable[] = $state([]);
  let envEditorDirty = $state(false);

  const selectedEnv = $derived(
    selectedEnvId ? $environments.find(e => e.id === selectedEnvId) ?? null : null
  );

  function selectEnv(env: Environment) {
    if (envEditorDirty && selectedEnvId && selectedEnvId !== env.id) {
      saveSelectedEnv();
    }
    selectedEnvId = env.id;
    editingEnvName = env.name;
    editingEnvVars = env.variables.map(v => ({ ...v }));
    envEditorDirty = false;
  }

  function handleEnvVarsChange(items: EnvironmentVariable[]) {
    editingEnvVars = items;
    envEditorDirty = true;
  }

  function handleEnvNameChange(e: Event) {
    editingEnvName = (e.target as HTMLInputElement).value;
    envEditorDirty = true;
  }

  function saveSelectedEnv() {
    if (!selectedEnvId) return;
    updateEnvironmentVariables(selectedEnvId, editingEnvVars);
    const trimmed = editingEnvName.trim();
    if (trimmed) renameEnvironment(selectedEnvId, trimmed);
    window.vscode.postMessage({ type: 'saveEnvironments', data: buildSaveData() });
    envEditorDirty = false;
  }

  function handleNewEnvironment() {
    const env = addEnvironment('New Environment');
    selectEnv(env);
  }

  function handleDeleteEnv(id: string) {
    if (selectedEnvId === id) {
      selectedEnvId = null;
      envEditorDirty = false;
    }
    deleteEnvironment(id);
    window.vscode.postMessage({ type: 'saveEnvironments', data: buildSaveData() });
  }

  function handleDuplicateEnv(id: string) {
    duplicateEnvironment(id);
    window.vscode.postMessage({ type: 'saveEnvironments', data: buildSaveData() });
  }

  function handleSetActive(id: string) {
    setActiveEnvironment($activeEnvironmentId === id ? null : id);
    window.vscode.postMessage({ type: 'saveEnvironments', data: buildSaveData() });
  }

  // ── .env file section ──────────────────────────────────────────────
  const envFileName = $derived(
    $envFilePath ? $envFilePath.split(/[\\/]/).pop() || '.env' : null
  );

  function handleLinkEnvFile() {
    window.vscode.postMessage({ type: 'linkEnvFile' });
  }

  function handleUnlinkEnvFile() {
    window.vscode.postMessage({ type: 'unlinkEnvFile' });
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function buildSaveData() {
    return {
      environments: $environments,
      activeId: $activeEnvironmentId,
      globalVariables: editingGlobalVars,
    };
  }
</script>

<svelte:window />

<div class="env-panel">
  <!-- Tab bar -->
  <div class="tab-bar">
    <button class="tab" class:active={activeTab === 'global'} onclick={() => { activeTab = 'global'; }}>
      <i class="codicon codicon-symbol-variable"></i>
      Global Variables
    </button>
    <button class="tab" class:active={activeTab === 'environments'} onclick={() => { activeTab = 'environments'; }}>
      <i class="codicon codicon-beaker"></i>
      Environments
      {#if $environments.length > 0}
        <span class="tab-badge">{$environments.length}</span>
      {/if}
    </button>
    <button class="tab" class:active={activeTab === 'cookies'} onclick={() => { activeTab = 'cookies'; }}>
      <i class="codicon codicon-globe"></i>
      Cookies
    </button>
  </div>

  <!-- Global Variables tab -->
  {#if activeTab === 'global'}
    <div class="tab-content">
      <div class="section-info">
        <p>Global variables are available in all requests regardless of the active environment. Use <code>{'{{variableName}}'}</code> to reference them.</p>
      </div>
      <div class="editor-area">
        <KeyValueEditor
          items={editingGlobalVars}
          keyPlaceholder="Variable name"
          valuePlaceholder="Value"
          onchange={handleGlobalVarsChange}
        />
      </div>
      <div class="footer-bar">
        <button class="save-btn" onclick={saveGlobalVars} disabled={!globalVarsDirty}>
          Save
        </button>
      </div>
    </div>
  {/if}

  <!-- Environments tab -->
  {#if activeTab === 'environments'}
    <div class="tab-content env-split">
      <!-- Left: environment list -->
      <div class="env-list-pane">
        <div class="pane-header">
          <span class="pane-title">Environments</span>
          <button class="icon-btn" onclick={handleNewEnvironment} title="New environment">
            <i class="codicon codicon-add"></i>
          </button>
        </div>

        <!-- .env file section -->
        <div class="env-file-section">
          <div class="env-file-header">
            <i class="codicon codicon-file-code"></i>
            <span>.env File</span>
            {#if envFileName}
              <span class="env-file-badge">{envFileName}</span>
            {/if}
          </div>
          {#if $envFilePath}
            <div class="env-file-linked">
              <span class="env-file-count">{$envFileVariables.length} var{$envFileVariables.length !== 1 ? 's' : ''} loaded</span>
              <button class="text-btn danger" onclick={handleUnlinkEnvFile}>Unlink</button>
            </div>
          {:else}
            <button class="text-btn" onclick={handleLinkEnvFile}>
              <i class="codicon codicon-link"></i>
              Link .env file
            </button>
          {/if}
        </div>

        <!-- Environment list -->
        {#if $environments.length === 0}
          <div class="empty-list">
            <p>No environments yet</p>
            <button class="create-btn" onclick={handleNewEnvironment}>Create Environment</button>
          </div>
        {:else}
          <div class="env-items">
            {#each $environments as env (env.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="env-item"
                class:selected={selectedEnvId === env.id}
                onclick={() => selectEnv(env)}
              >
                <div class="env-item-main">
                  {#if $activeEnvironmentId === env.id}
                    <i class="codicon codicon-check active-indicator" title="Active"></i>
                  {:else}
                    <i class="codicon codicon-circle-outline inactive-indicator"></i>
                  {/if}
                  <span class="env-item-name">{env.name}</span>
                  <span class="env-item-count">{env.variables.filter(v => v.enabled).length}</span>
                </div>
                <div class="env-item-actions">
                  <button
                    class="item-btn"
                    onclick={(e) => { e.stopPropagation(); handleSetActive(env.id); }}
                    title={$activeEnvironmentId === env.id ? 'Deactivate' : 'Set active'}
                  >
                    <i class="codicon {$activeEnvironmentId === env.id ? 'codicon-circle-filled' : 'codicon-circle-outline'}"></i>
                  </button>
                  <button
                    class="item-btn"
                    onclick={(e) => { e.stopPropagation(); handleDuplicateEnv(env.id); }}
                    title="Duplicate"
                  >
                    <i class="codicon codicon-copy"></i>
                  </button>
                  <button
                    class="item-btn danger"
                    onclick={(e) => { e.stopPropagation(); handleDeleteEnv(env.id); }}
                    title="Delete"
                  >
                    <i class="codicon codicon-trash"></i>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Right: editor pane -->
      <div class="env-editor-pane">
        {#if selectedEnv}
          <div class="editor-header">
            <input
              class="env-name-input"
              type="text"
              value={editingEnvName}
              oninput={handleEnvNameChange}
              placeholder="Environment name"
            />
            <button class="save-btn" onclick={saveSelectedEnv} disabled={!envEditorDirty}>
              Save
            </button>
          </div>
          <div class="hint-bar">
            Use <code>{'{{variableName}}'}</code> in URLs, headers, and body.
          </div>
          <div class="editor-area">
            <KeyValueEditor
              items={editingEnvVars}
              keyPlaceholder="Variable name"
              valuePlaceholder="Value"
              onchange={handleEnvVarsChange}
            />
          </div>
        {:else}
          <div class="no-selection">
            <i class="codicon codicon-beaker" style="font-size: 40px; opacity: 0.3;"></i>
            <p>Select an environment to edit its variables</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Cookies tab -->
  {#if activeTab === 'cookies'}
    <div class="tab-content">
      <CookieJarPanel />
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--hf-editor-background, var(--vscode-editor-background));
    color: var(--hf-foreground, var(--vscode-foreground));
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
    height: 100vh;
    overflow: hidden;
  }

  .env-panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* Tab bar */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
    background: var(--hf-sideBar-background, var(--vscode-sideBar-background));
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    opacity: 0.65;
    transition: opacity 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .tab:hover {
    opacity: 0.9;
  }

  .tab.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }

  .tab-badge {
    padding: 1px 5px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    font-size: 10px;
  }

  /* Tab content */
  .tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Global Variables tab */
  .section-info {
    padding: 12px 16px 0;
    flex-shrink: 0;
  }

  .section-info p {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    padding: 8px 12px;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textBlockQuote-border);
    border-radius: 0 4px 4px 0;
  }

  .section-info code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .editor-area {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
  }

  .footer-bar {
    display: flex;
    justify-content: flex-end;
    padding: 10px 16px;
    border-top: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  /* Environments tab split */
  .env-split {
    flex-direction: row !important;
  }

  .env-list-pane {
    width: 240px;
    min-width: 200px;
    border-right: 1px solid var(--hf-panel-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-sideBarSectionHeader-background);
    flex-shrink: 0;
  }

  .pane-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-sideBarSectionHeader-foreground);
    opacity: 0.8;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    opacity: 0.7;
  }

  .icon-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  /* .env file section */
  .env-file-section {
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 11px;
    flex-shrink: 0;
  }

  .env-file-header {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 4px;
    font-weight: 500;
  }

  .env-file-badge {
    font-size: 10px;
    padding: 1px 4px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80px;
  }

  .env-file-linked {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .env-file-count {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }

  .text-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    color: var(--hf-foreground);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .text-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .text-btn.danger:hover {
    color: var(--hf-errorForeground, #f44336);
    border-color: var(--hf-errorForeground, #f44336);
  }

  /* Env items list */
  .env-items {
    flex: 1;
    overflow-y: auto;
  }

  .env-item {
    display: flex;
    align-items: center;
    padding: 0 12px;
    height: 36px;
    cursor: pointer;
    border-bottom: 1px solid transparent;
    transition: background 0.1s;
    gap: 4px;
  }

  .env-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .env-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .env-item-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    min-width: 0;
  }

  .active-indicator {
    color: var(--hf-charts-green, #49cc90);
    font-size: 12px;
    flex-shrink: 0;
  }

  .inactive-indicator {
    font-size: 12px;
    opacity: 0.2;
    flex-shrink: 0;
  }

  .env-item-name {
    flex: 1;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .env-item-count {
    font-size: 10px;
    padding: 1px 5px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .env-item-actions {
    display: none;
    gap: 2px;
    flex-shrink: 0;
  }

  .env-item:hover .env-item-actions,
  .env-item.selected .env-item-actions {
    display: flex;
  }

  .item-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
    opacity: 0.6;
  }

  .item-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .item-btn.danger:hover {
    color: var(--hf-errorForeground, #f44336);
  }

  .empty-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    gap: 12px;
    text-align: center;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  /* Right editor pane */
  .env-editor-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .editor-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .env-name-input {
    flex: 1;
    padding: 6px 10px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    outline: none;
  }

  .env-name-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .hint-bar {
    padding: 8px 16px;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    background: var(--hf-textBlockQuote-background);
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .hint-bar code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .no-selection {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--hf-descriptionForeground);
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }

  /* Buttons */
  .save-btn {
    padding: 6px 14px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .save-btn:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .save-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .create-btn {
    padding: 6px 14px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .create-btn:hover {
    background: var(--hf-button-hoverBackground);
  }
</style>
