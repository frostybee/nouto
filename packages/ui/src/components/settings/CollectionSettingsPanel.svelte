<script lang="ts">
  import { onMount } from 'svelte';
  import type { AuthState, KeyValue, ScriptConfig } from '../../types';
  import { settingsData } from '../../stores/collectionSettings';
  import AuthEditor from '../shared/AuthEditor.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import ScriptEditor from '../shared/ScriptEditor.svelte';

  declare const vscode: { postMessage: (msg: any) => void };

  type SettingsTab = 'auth' | 'headers' | 'scripts';

  let entityType = $state<'collection' | 'folder'>('collection');
  let entityName = $state('');
  let collectionId = $state('');
  let folderId = $state<string | undefined>(undefined);
  let activeTab = $state<SettingsTab>('auth');
  let initialized = $state(false);

  let editedAuth = $state<AuthState>({ type: 'none' });
  let editedHeaders = $state<KeyValue[]>([]);
  let editedScripts = $state<ScriptConfig>({ preRequest: '', postResponse: '' });

  // Snapshots for dirty tracking
  let originalAuth = '';
  let originalHeaders = '';
  let originalScripts = '';

  const isDirty = $derived(
    JSON.stringify(editedAuth) !== originalAuth ||
    JSON.stringify(editedHeaders) !== originalHeaders ||
    JSON.stringify(editedScripts) !== originalScripts
  );

  // Initialize from store (use subscribe to avoid reactive loop with child components)
  onMount(() => {
    const unsub = settingsData.subscribe(data => {
      if (!data || initialized) return;

      entityType = data.entityType;
      entityName = data.entityName;
      collectionId = data.collectionId;
      folderId = data.folderId;
      editedAuth = data.initialAuth ?? { type: 'none' };
      editedHeaders = data.initialHeaders ?? [];
      editedScripts = data.initialScripts ?? { preRequest: '', postResponse: '' };

      originalAuth = JSON.stringify(editedAuth);
      originalHeaders = JSON.stringify(editedHeaders);
      originalScripts = JSON.stringify(editedScripts);

      initialized = true;
    });
    return unsub;
  });

  function handleSave() {
    const msgType = entityType === 'collection' ? 'saveCollectionSettings' : 'saveFolderSettings';
    vscode.postMessage({
      type: msgType,
      data: {
        collectionId,
        folderId,
        auth: editedAuth,
        headers: editedHeaders,
        scripts: editedScripts,
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
    { id: 'scripts', label: 'Scripts', icon: 'codicon-code' },
  ];
</script>

<svelte:window onkeydown={handleKeydown} />

{#if initialized}
  <div class="settings-panel">
    <header class="panel-header">
      <span class="codicon {entityType === 'collection' ? 'codicon-folder' : 'codicon-folder-opened'} header-icon"></span>
      <h2 class="panel-title">{entityName}</h2>
      <span class="entity-badge">{entityType}</span>
      {#if isDirty}
        <span class="dirty-badge">Unsaved</span>
      {/if}
    </header>

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
      {:else if activeTab === 'scripts'}
        <div class="tab-pane scripts-pane">
          <p class="tab-description">Scripts run before/after every request in this {entityType}.</p>
          <ScriptEditor scripts={editedScripts} onchange={(s) => (editedScripts = s)} />
        </div>
      {/if}
    </div>

    <footer class="panel-footer">
      <button class="btn btn-secondary" onclick={handleCancel}>Cancel</button>
      <button class="btn btn-primary" disabled={!isDirty} onclick={handleSave}>
        Save
      </button>
    </footer>
  </div>
{:else}
  <div class="loading">Loading settings...</div>
{/if}

<style>
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
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .header-icon {
    font-size: 18px;
    opacity: 0.8;
  }

  .panel-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entity-badge {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
  }

  .dirty-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--hf-charts-yellow, #e2b714);
    color: #000;
    font-weight: 500;
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

  .tab-description {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    margin: 0 0 4px 0;
  }

  .panel-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
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
</style>
