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
  } from '../../stores/environment';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import CookieJarPanel from '../shared/CookieJarPanel.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import { postMessage } from '../../lib/vscode';
  import { generateId, type KeyValue } from '../../types';
  import SlidePanel from '../shared/SlidePanel.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  type Tab = 'global' | 'environments' | 'cookies';

  let activeTab = $state<Tab>('environments');
  let confirmDeleteId = $state<string | null>(null);

  // ── Global Variables tab ───────────────────────────────────────────
  let globalVarsDirty = $state(false);
  let editingGlobalVars: KeyValue[] = $state([]);

  $effect(() => {
    const incoming = $globalVariables.map(v => ({ ...v, id: v.id ?? generateId() }));
    // Only reset the draft if the user hasn't started editing.
    // This prevents external store updates (e.g. from script execution) from
    // silently wiping in-progress edits.
    if (!globalVarsDirty) {
      editingGlobalVars = incoming;
    }
  });

  function handleGlobalVarsChange(items: KeyValue[]) {
    editingGlobalVars = items;
    globalVarsDirty = true;
  }

  function saveGlobalVars() {
    updateGlobalVariables(editingGlobalVars);
    // No explicit postMessage needed: updateGlobalVariables() calls saveEnvironments() internally
    globalVarsDirty = false;
  }

  // ── Environments tab ───────────────────────────────────────────────
  let globalsExpanded = $state(false);
  let selectedEnvId = $state<string | null>(null);

  const activeGlobals = $derived($globalVariables.filter(v => v.enabled && v.key));
  let editingEnvName = $state('');
  let editingEnvVars: KeyValue[] = $state([]);

  // Keys defined in the current environment that shadow a global variable
  const envOverriddenKeys = $derived(
    new Set(editingEnvVars.filter(v => v.enabled && v.key).map(v => v.key))
  );
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
    editingEnvVars = env.variables.map(v => ({ ...v, id: v.id ?? generateId() }));
    envEditorDirty = false;
  }

  function handleEnvVarsChange(items: KeyValue[]) {
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
    // No explicit postMessage needed: store functions call saveEnvironments() internally
    envEditorDirty = false;
  }

  function handleNewEnvironment() {
    const env = addEnvironment('New Environment');
    selectEnv(env);
  }

  function handleDeleteEnv(id: string) {
    confirmDeleteId = id;
  }

  function confirmDeleteEnv() {
    if (!confirmDeleteId) return;
    if (selectedEnvId === confirmDeleteId) {
      selectedEnvId = null;
      envEditorDirty = false;
    }
    deleteEnvironment(confirmDeleteId);
    // No explicit postMessage needed: deleteEnvironment() calls saveEnvironments() internally
    confirmDeleteId = null;
  }

  function handleDuplicateEnv(id: string) {
    duplicateEnvironment(id);
    // No explicit postMessage needed: duplicateEnvironment() calls saveEnvironments() internally
  }

  function handleSetActive(id: string) {
    setActiveEnvironment($activeEnvironmentId === id ? null : id);
    // No explicit postMessage needed: setActiveEnvironment() calls saveEnvironments() internally
  }

  // ── .env file section ──────────────────────────────────────────────
  const envFileName = $derived(
    $envFilePath ? $envFilePath.split(/[\\/]/).pop() || '.env' : null
  );

  function handleLinkEnvFile() {
    postMessage({ type: 'linkEnvFile' });
  }

  function handleUnlinkEnvFile() {
    postMessage({ type: 'unlinkEnvFile' });
  }

</script>

<svelte:window />

<div class="env-panel">
  <!-- Left nav -->
  <nav class="env-nav">
    <button class="nav-item" class:active={activeTab === 'global'} onclick={() => { activeTab = 'global'; }}>
      <i class="codicon codicon-symbol-variable"></i>
      Global Variables
    </button>
    <button class="nav-item" class:active={activeTab === 'environments'} onclick={() => { activeTab = 'environments'; }}>
      <i class="codicon codicon-beaker"></i>
      Environments
      {#if $environments.length > 0}
        <span class="tab-badge">{$environments.length}</span>
      {/if}
    </button>
    <button class="nav-item" class:active={activeTab === 'cookies'} onclick={() => { activeTab = 'cookies'; }}>
      <i class="codicon codicon-globe"></i>
      Cookies
    </button>
  </nav>

  <!-- Right content -->
  <div class="env-content">

  <!-- Content header -->
  <div class="content-header">
    {#if activeTab === 'global'}
      <span class="content-title">Global Variables</span>
      <span class="content-subtitle">
        Unlike environment variables, global variables exist outside any environment.They stay constant regardless of which environment is active. This makes them ideal for values shared across your entire project, such as a base URL or API version. You can reference them anywhere using <code>{'{{variable_name}}'}</code>, just like environment variables.
      </span>
    {:else if activeTab === 'environments'}
      <span class="content-title">Environments Variables</span>
      <span class="content-subtitle">
        Environments let you define <em>separate sets</em> of variables for different contexts, such as local development, staging, or production. Only the <em>active</em> environment's variables are injected into your requests, so you can switch contexts instantly without touching your request configuration. Reference any variable with <code>{'{{variable_name}}'}</code>.
      </span>
    {:else}
      <span class="content-title">Cookie Jar</span>
      <span class="content-subtitle">
        The cookie jar stores cookies received from server responses and automatically attaches them to future requests sent to the same domain - behaving just like a browser would. This is especially useful when testing endpoints that rely on session cookies or login state.
      </span>
    {/if}
  </div>

  <!-- Global Variables tab -->
  {#if activeTab === 'global'}
    <div class="tab-content">
      <div class="editor-toolbar">
        <Tooltip text="Import global variables" position="bottom">
          <button class="icon-btn" onclick={() => postMessage({ type: 'importGlobalVariables' })}>
            <i class="codicon codicon-cloud-download"></i>
          </button>
        </Tooltip>
        <Tooltip text="Export global variables" position="bottom">
          <button class="icon-btn" onclick={() => postMessage({ type: 'exportGlobalVariables' })}>
            <i class="codicon codicon-export"></i>
          </button>
        </Tooltip>
        <button class="save-btn" style="margin-left: 12px;" onclick={saveGlobalVars} disabled={!globalVarsDirty}>Save</button>
      </div>
      <div class="editor-area">
        <KeyValueEditor
          items={editingGlobalVars}
          keyPlaceholder="Variable name"
          valuePlaceholder="Value"
          showDescription
          onchange={handleGlobalVarsChange}
        />
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
          <Tooltip text="New environment" position="bottom">
            <button class="icon-btn" onclick={handleNewEnvironment}>
              <i class="codicon codicon-add"></i>
            </button>
          </Tooltip>
          <Tooltip text="Import environments" position="bottom">
            <button class="icon-btn" onclick={() => postMessage({ type: 'importEnvironments' })}>
              <i class="codicon codicon-cloud-download"></i>
            </button>
          </Tooltip>
          <Tooltip text="Export all environments" position="bottom">
            <button class="icon-btn" onclick={() => postMessage({ type: 'exportAllEnvironments' })}>
              <i class="codicon codicon-export"></i>
            </button>
          </Tooltip>
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
                  <Tooltip text={$activeEnvironmentId === env.id ? 'Deactivate' : 'Set active'} position="top">
                    <button
                      class="item-btn"
                      onclick={(e) => { e.stopPropagation(); handleSetActive(env.id); }}
                    >
                      <i class="codicon {$activeEnvironmentId === env.id ? 'codicon-circle-filled' : 'codicon-circle-outline'}"></i>
                    </button>
                  </Tooltip>
                  <Tooltip text="Duplicate" position="top">
                    <button
                      class="item-btn"
                      onclick={(e) => { e.stopPropagation(); handleDuplicateEnv(env.id); }}
                    >
                      <i class="codicon codicon-copy"></i>
                    </button>
                  </Tooltip>
                  <Tooltip text="Export" position="top">
                    <button
                      class="item-btn"
                      onclick={(e) => { e.stopPropagation(); postMessage({ type: 'exportEnvironment', data: { id: env.id } }); }}
                    >
                      <i class="codicon codicon-export"></i>
                    </button>
                  </Tooltip>
                  <Tooltip text="Delete" position="top">
                    <button
                      class="item-btn danger"
                      onclick={(e) => { e.stopPropagation(); handleDeleteEnv(env.id); }}
                    >
                      <i class="codicon codicon-trash"></i>
                    </button>
                  </Tooltip>
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
            <span>Use <code>{'{{variableName}}'}</code> in URLs, headers, and body.</span>
            <span class="hint-priority">
              <i class="codicon codicon-info"></i>
              Priority: <span class="hint-tier">.env file</span>
              <i class="codicon codicon-arrow-right hint-arrow"></i>
              <span class="hint-tier">globals</span>
              <i class="codicon codicon-arrow-right hint-arrow"></i>
              <span class="hint-tier hint-tier-active">active environment</span>
              <span class="hint-tier-note">(highest wins)</span>
            </span>
          </div>

          <!-- Global variables toggle bar -->
          <div class="globals-toggle-wrap">
            <Tooltip text="Click to view active global variables" position="bottom">
              <button class="globals-toggle-bar" onclick={() => (globalsExpanded = !globalsExpanded)}>
                <i class="codicon codicon-symbol-variable"></i>
                <span>Also active: <strong>{activeGlobals.length}</strong> global variable{activeGlobals.length !== 1 ? 's' : ''}</span>
                <i class="codicon codicon-chevron-right" style="margin-left: auto;"></i>
              </button>
            </Tooltip>
          </div>

          <!-- Sliding globals panel -->
          <SlidePanel
            open={globalsExpanded}
            title="Global Variables"
            onclose={() => (globalsExpanded = false)}
          >
            {#if activeGlobals.length === 0}
              <p class="slide-empty">No global variables defined.</p>
            {:else}
              {#each activeGlobals as v}
                {@const overridden = envOverriddenKeys.has(v.key)}
                <div class="slide-row" class:slide-row-overridden={overridden}>
                  <span class="slide-key">{v.key}</span>
                  <span class="slide-sep">=</span>
                  <span class="slide-value">{v.value}</span>
                  {#if overridden}
                    <span class="slide-override-badge" title="Overridden by the active environment">env wins</span>
                  {/if}
                </div>
              {/each}
            {/if}

            {#snippet footer()}
              <button class="slide-edit-btn" onclick={() => { activeTab = 'global'; globalsExpanded = false; }}>
                <i class="codicon codicon-edit"></i>
                Edit global variables
              </button>
            {/snippet}
          </SlidePanel>

          <div class="editor-area">
            <KeyValueEditor
              items={editingEnvVars}
              keyPlaceholder="Variable name"
              valuePlaceholder="Value"
              showDescription
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

  </div><!-- /env-content -->
</div>

<ConfirmDialog
  open={confirmDeleteId !== null}
  title="Delete environment"
  message="This environment and all its variables will be permanently removed. This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmDeleteEnv}
  oncancel={() => (confirmDeleteId = null)}
/>

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
    flex-direction: row;
    height: 100vh;
    overflow: hidden;
  }

  /* Left nav */
  .env-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 6px;
    width: 160px;
    min-width: 160px;
    background: var(--hf-sideBar-background, var(--hf-editor-background));
    border-right: 1px solid var(--hf-panel-border);
    overflow-y: auto;
    flex-shrink: 0;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    opacity: 0.75;
    transition: opacity 0.15s, background 0.15s;
    white-space: nowrap;
  }

  .nav-item:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .nav-item.active {
    opacity: 1;
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .nav-item .codicon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .tab-badge {
    padding: 1px 5px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    font-size: 10px;
    margin-left: auto;
  }

  /* Right content area */
  .env-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  /* Tab content */
  .tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Content header */
  .content-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 20px 14px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .content-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .content-subtitle {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    padding: 8px 12px;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textBlockQuote-border);
    border-radius: 0 4px 4px 0;
    line-height: 1.5;
    margin: 0;
  }

  .content-subtitle code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .content-subtitle em {
    font-style: italic;
    color: var(--hf-foreground);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .editor-area {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
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
    position: relative;
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 16px;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    background: var(--hf-textBlockQuote-background);
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .hint-bar code {
    background: var(--hf-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .hint-priority {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    opacity: 0.8;
  }

  .hint-priority .codicon {
    font-size: 11px;
    opacity: 0.6;
  }

  .hint-tier {
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--hf-textCodeBlock-background);
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 10px;
  }

  .hint-tier-active {
    background: color-mix(in srgb, var(--hf-charts-green, #49cc90) 15%, var(--hf-textCodeBlock-background));
    color: var(--hf-charts-green, #49cc90);
  }

  .hint-arrow {
    opacity: 0.35;
    font-size: 10px;
  }

  .hint-tier-note {
    opacity: 0.5;
    font-style: italic;
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

  /* Globals toggle bar container */
  .globals-toggle-wrap {
    flex-shrink: 0;
    width: 100%;
  }

  .globals-toggle-wrap :global(.tooltip-wrapper) {
    width: 100%;
    display: flex;
  }

  /* Globals toggle bar */
  .globals-toggle-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 7px 14px 7px 11px;
    background: color-mix(in srgb, var(--hf-charts-green, #49cc90) 6%, var(--hf-editor-background));
    border: none;
    border-top: 1px solid color-mix(in srgb, var(--hf-charts-green, #49cc90) 25%, var(--hf-panel-border));
    border-bottom: 1px solid color-mix(in srgb, var(--hf-charts-green, #49cc90) 25%, var(--hf-panel-border));
    border-left: 3px solid var(--hf-charts-green, #49cc90);
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, color 0.15s;
  }

  .globals-toggle-bar:hover {
    background: color-mix(in srgb, var(--hf-charts-green, #49cc90) 12%, var(--hf-editor-background));
    color: var(--hf-foreground);
  }

  .globals-toggle-bar strong {
    color: var(--hf-charts-green, #49cc90);
    font-weight: 600;
  }

  .globals-toggle-bar .codicon {
    font-size: 13px;
    flex-shrink: 0;
    color: var(--hf-charts-green, #49cc90);
    opacity: 0.85;
  }

  .slide-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    opacity: 0.85;
  }

  .slide-row:last-child {
    border-bottom: none;
  }

  .slide-row-overridden .slide-key,
  .slide-row-overridden .slide-sep,
  .slide-row-overridden .slide-value {
    opacity: 0.4;
    text-decoration: line-through;
  }

  .slide-override-badge {
    flex-shrink: 0;
    margin-left: auto;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 1px 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--hf-charts-yellow, #f0c040) 18%, transparent);
    color: var(--hf-charts-yellow, #f0c040);
    border: 1px solid color-mix(in srgb, var(--hf-charts-yellow, #f0c040) 40%, transparent);
  }

  .slide-key {
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-symbolIcon-variableForeground, var(--hf-foreground));
    flex-shrink: 0;
    min-width: 80px;
  }

  .slide-sep {
    color: var(--hf-descriptionForeground);
    opacity: 0.4;
    flex-shrink: 0;
  }

  .slide-value {
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .slide-empty {
    margin: 0;
    padding: 12px 0;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    font-style: italic;
    text-align: center;
  }

  .slide-edit-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: var(--hf-button-secondaryBackground, transparent);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .slide-edit-btn:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }
</style>
