<script lang="ts">
  import type { AuthState, KeyValue, ScriptConfig, EnvironmentVariable, Assertion } from '../../types';
  import { generateId } from '../../types';
  import { settingsData, settingsSavedSignal } from '../../stores/collectionSettings.svelte';
  import AuthEditor from '../shared/AuthEditor.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import ScriptEditor from '../shared/ScriptEditor.svelte';
  import NotesEditor from '../shared/NotesEditor.svelte';
  import AssertionRow from '../shared/AssertionRow.svelte';
  import { createDefaultAssertion } from '../../stores/assertions.svelte';

  declare const vscode: { postMessage: (msg: any) => void };

  type SettingsTab = 'auth' | 'headers' | 'variables' | 'scripts' | 'tests' | 'notes';

  let entityType = $state<'collection' | 'folder'>('collection');
  let entityName = $state('');
  let collectionId = $state('');
  let folderId = $state<string | undefined>(undefined);
  let activeTab = $state<SettingsTab>('auth');
  let initialized = $state(false);

  let editedAuth = $state<AuthState>({ type: 'none' });
  let editedHeaders = $state<KeyValue[]>([]);
  let editedVariables = $state<EnvironmentVariable[]>([]);
  let editedScripts = $state<ScriptConfig>({ preRequest: '', postResponse: '' });
  let editedAssertions = $state<Assertion[]>([]);
  let editedNotes = $state('');

  // Snapshots for dirty tracking
  let originalAuth = $state('');
  let originalHeaders = $state('');
  let originalVariables = $state('');
  let originalScripts = $state('');
  let originalAssertions = $state('');
  let originalNotes = $state('');

  const isDirty = $derived(
    JSON.stringify(editedAuth) !== originalAuth ||
    JSON.stringify(editedHeaders) !== originalHeaders ||
    JSON.stringify(editedVariables) !== originalVariables ||
    JSON.stringify(editedScripts) !== originalScripts ||
    JSON.stringify(editedAssertions) !== originalAssertions ||
    editedNotes !== originalNotes
  );

  // Initialize from store when data becomes available
  $effect(() => {
    const data = settingsData();
    if (!data || initialized) return;

    entityType = data.entityType;
    entityName = data.entityName;
    collectionId = data.collectionId;
    folderId = data.folderId;
    editedAuth = data.initialAuth ?? { type: 'none' };
    editedHeaders = (data.initialHeaders ?? []).map(h => (h.id ? h : { ...h, id: generateId() }));
    editedVariables = (data.initialVariables ?? []).map(v => (v.id ? v : { ...v, id: generateId() }));
    editedScripts = data.initialScripts ?? { preRequest: '', postResponse: '' };
    editedAssertions = data.initialAssertions ?? [];
    editedNotes = data.initialNotes ?? '';

    originalAuth = JSON.stringify(editedAuth);
    originalHeaders = JSON.stringify(editedHeaders);
    originalVariables = JSON.stringify(editedVariables);
    originalScripts = JSON.stringify(editedScripts);
    originalAssertions = JSON.stringify(editedAssertions);
    originalNotes = editedNotes;

    initialized = true;
  });

  // Reset dirty tracking after successful save
  $effect(() => {
    const n = settingsSavedSignal();
    if (n === 0) return;
    originalAuth = JSON.stringify(editedAuth);
    originalHeaders = JSON.stringify(editedHeaders);
    originalVariables = JSON.stringify(editedVariables);
    originalScripts = JSON.stringify(editedScripts);
    originalAssertions = JSON.stringify(editedAssertions);
    originalNotes = editedNotes;
  });

  function handleSave() {
    const msgType = entityType === 'collection' ? 'saveCollectionSettings' : 'saveFolderSettings';
    vscode.postMessage({
      type: msgType,
      data: {
        collectionId,
        folderId,
        auth: $state.snapshot(editedAuth),
        headers: $state.snapshot(editedHeaders),
        variables: $state.snapshot(editedVariables),
        scripts: $state.snapshot(editedScripts),
        assertions: $state.snapshot(editedAssertions),
        notes: editedNotes,
      },
    });
  }

  function handleCancel() {
    vscode.postMessage({ type: 'closeSettingsPanel' });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isDirty) handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'auth', label: 'Auth', icon: 'codicon-key' },
    { id: 'headers', label: 'Headers', icon: 'codicon-list-flat' },
    { id: 'variables', label: 'Variables', icon: 'codicon-symbol-variable' },
    { id: 'scripts', label: 'Scripts', icon: 'codicon-code' },
    { id: 'tests', label: 'Tests', icon: 'codicon-beaker' },
    { id: 'notes', label: 'Notes', icon: 'codicon-note' },
  ];

  // Adapter: EnvironmentVariable[] ↔ KeyValue[] for the KeyValueEditor
  function variablesToKeyValues(vars: EnvironmentVariable[]): KeyValue[] {
    return vars.map(v => ({
      id: v.id ?? generateId(),
      key: v.key,
      value: v.value,
      enabled: v.enabled,
    }));
  }

  function keyValuesToVariables(kvs: KeyValue[]): EnvironmentVariable[] {
    return kvs.map(kv => ({
      id: kv.id,
      key: kv.key,
      value: kv.value,
      enabled: kv.enabled,
    }));
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if initialized}
  <div class="settings-panel">
    <header class="panel-header">
      <div class="header-top">
        <span class="header-label">
          <span class="codicon codicon-settings-gear label-icon"></span>
          {entityType === 'collection' ? 'Collection' : 'Folder'} Settings
        </span>
      </div>
      <div class="header-entity">
        <span class="codicon {entityType === 'collection' ? 'codicon-folder' : 'codicon-folder-opened'} entity-icon"></span>
        <h2 class="panel-title">{entityName}</h2>
      </div>
    </header>

    <p class="panel-description">
      Configure settings that apply to all requests within this {entityType}. Individual requests can override these defaults.
    </p>

    <nav class="tab-bar">
      {#each tabs as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          onclick={() => (activeTab = tab.id)}
        >
          <span class="codicon {tab.icon}"></span>
          {tab.label}
        </button>
      {/each}
      <div class="tab-bar-actions">
        {#if isDirty}
          <span class="dirty-badge">Unsaved</span>
        {/if}
        <button class="btn btn-secondary btn-sm" onclick={handleCancel}>Cancel</button>
        <button class="btn btn-primary btn-sm" disabled={!isDirty} onclick={handleSave}>Save</button>
      </div>
    </nav>

    <div class="tab-content">
      {#if activeTab === 'auth'}
        <div class="tab-pane">
          <p class="tab-description">Authentication inherited by all requests in this {entityType}.</p>
          <AuthEditor auth={editedAuth} onchange={(a) => (editedAuth = a)} />
        </div>
      {:else if activeTab === 'headers'}
        <div class="tab-pane">
          <p class="tab-description">Headers inherited by all requests in this {entityType}.</p>
          <KeyValueEditor
            items={editedHeaders}
            keyPlaceholder="Header Name"
            valuePlaceholder="Header Value"
            onchange={(h) => (editedHeaders = h)}
          />
        </div>
      {:else if activeTab === 'variables'}
        <div class="tab-pane">
          <p class="tab-description">Variables available to all requests in this {entityType}. Override global variables but are overridden by active environment.</p>
          <KeyValueEditor
            items={variablesToKeyValues(editedVariables)}
            keyPlaceholder="Variable Name"
            valuePlaceholder="Variable Value"
            onchange={(kvs) => (editedVariables = keyValuesToVariables(kvs))}
          />
        </div>
      {:else if activeTab === 'scripts'}
        <div class="tab-pane scripts-pane">
          <p class="tab-description">Scripts run before/after every request in this {entityType}.</p>
          <ScriptEditor scripts={editedScripts} onchange={(s) => (editedScripts = s)} />
        </div>
      {:else if activeTab === 'tests'}
        <div class="tab-pane">
          <p class="tab-description">Test assertions applied to every request in this {entityType}. Request-level assertions with the same ID override these.</p>
          <div class="assertion-editor">
            {#each editedAssertions as assertion, i (assertion.id)}
              <AssertionRow
                {assertion}
                onchange={(updated) => {
                  const next = [...editedAssertions];
                  next[i] = updated;
                  editedAssertions = next;
                }}
                onremove={() => {
                  editedAssertions = editedAssertions.filter((_, idx) => idx !== i);
                }}
              />
            {/each}
            <button class="btn btn-secondary btn-sm add-assertion-btn" onclick={() => { editedAssertions = [...editedAssertions, createDefaultAssertion()]; }}>
              <span class="codicon codicon-add"></span>
              Add Assertion
            </button>
          </div>
        </div>
      {:else if activeTab === 'notes'}
        <div class="tab-pane notes-pane">
          <p class="tab-description">Notes for this {entityType}. Supports Markdown.</p>
          <NotesEditor value={editedNotes} onchange={(v) => (editedNotes = v)} />
        </div>
      {/if}
    </div>

  </div>
{:else}
  <div class="loading">Loading settings...</div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    color: var(--hf-foreground);
    background: var(--hf-editor-background);
    font-family: var(--hf-font-family, system-ui, -apple-system, sans-serif);
  }

  .panel-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-textBlockQuote-background, rgba(255, 255, 255, 0.04));
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .header-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--hf-descriptionForeground);
    font-weight: 600;
  }

  .label-icon {
    font-size: 13px;
  }

  .tab-bar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    padding-right: 4px;
  }

  .header-entity {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .entity-icon {
    font-size: 20px;
    opacity: 0.8;
  }

  .panel-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dirty-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    font-weight: 600;
  }

  .btn-sm {
    padding: 4px 12px;
    font-size: 12px;
  }

  .panel-description {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    margin: 12px 20px;
    padding: 8px 12px;
    border-left: 3px solid var(--hf-focusBorder);
    background: var(--hf-textBlockQuote-background, rgba(255, 255, 255, 0.04));
    border-radius: 2px;
    line-height: 1.4;
  }

  .tab-bar {
    display: flex;
    gap: 2px;
    padding: 0 20px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
    font-size: 13px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .tab-btn:hover {
    opacity: 1;
  }

  .tab-btn.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }

  .tab-content {
    flex: 1;
    overflow: auto;
    padding: 16px 20px;
  }

  .tab-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 200px;
  }

  .scripts-pane {
    height: 100%;
    min-height: 300px;
  }

  .notes-pane {
    flex: 1;
    height: 100%;
    padding-bottom: 0;
  }

  .tab-description {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    margin: 0 0 4px 0;
  }

  .btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .btn-secondary {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
  }

  .btn-secondary:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: var(--hf-descriptionForeground);
    font-size: 14px;
  }

  .assertion-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .add-assertion-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    margin-top: 4px;
  }
</style>
