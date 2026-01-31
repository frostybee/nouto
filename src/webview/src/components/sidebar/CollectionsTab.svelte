<script lang="ts">
  import { collections, addCollection } from '../../stores/collections';
  import CollectionTree from './CollectionTree.svelte';

  let isCreating = false;
  let newCollectionName = '';

  $: hasCollections = $collections.length > 0;

  function handleNewCollection() {
    isCreating = true;
    newCollectionName = '';
  }

  function createCollection() {
    const name = newCollectionName.trim();
    if (name) {
      addCollection(name);
    }
    isCreating = false;
    newCollectionName = '';
  }

  function cancelCreate() {
    isCreating = false;
    newCollectionName = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      createCollection();
    } else if (e.key === 'Escape') {
      cancelCreate();
    }
  }
</script>

<div class="collections-tab">
  <div class="toolbar">
    {#if isCreating}
      <div class="create-form">
        <input
          type="text"
          class="create-input"
          placeholder="Collection name..."
          bind:value={newCollectionName}
          on:keydown={handleKeydown}
          on:blur={createCollection}
          autofocus
        />
      </div>
    {:else}
      <button class="toolbar-button" on:click={handleNewCollection} title="New Collection">
        <span class="codicon">+</span>
        New Collection
      </button>
    {/if}
  </div>

  {#if hasCollections}
    <div class="collections-list">
      <CollectionTree />
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-icon">📁</div>
      <p class="empty-title">No Collections</p>
      <p class="empty-description">
        Create a collection to organize your API requests
      </p>
    </div>
  {/if}
</div>

<style>
  .collections-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .toolbar {
    display: flex;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--vscode-button-secondaryBackground);
    border: none;
    border-radius: 4px;
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
  }

  .toolbar-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .codicon {
    font-weight: bold;
  }

  .create-form {
    flex: 1;
  }

  .create-input {
    width: 100%;
    padding: 6px 10px;
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

  .collections-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
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
    max-width: 200px;
  }
</style>
