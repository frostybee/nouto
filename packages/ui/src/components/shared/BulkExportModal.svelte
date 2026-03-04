<script lang="ts">
  import { collections } from '../../stores/collections';
  import { countAllItems } from '../../lib/tree-helpers';

  interface Props {
    open: boolean;
    format: 'postman' | 'hivefetch';
    onexport: (collectionIds: string[]) => void;
    oncancel: () => void;
  }

  let { open, format, onexport, oncancel }: Props = $props();

  let selectedIds = $state<Set<string>>(new Set());

  const exportableCollections = $derived(
    $collections.filter(c => c.builtin !== 'recent')
  );

  const allSelected = $derived(
    exportableCollections.length > 0 && selectedIds.size === exportableCollections.length
  );

  const noneSelected = $derived(selectedIds.size === 0);

  // Reset selections when modal opens
  $effect(() => {
    if (open) {
      selectedIds = new Set(exportableCollections.map(c => c.id));
    }
  });

  function toggleAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(exportableCollections.map(c => c.id));
    }
  }

  function toggleCollection(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds = next;
  }

  function handleExport() {
    onexport(Array.from(selectedIds));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      oncancel();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-export-title">
      <div class="modal-header">
        <span class="modal-icon codicon codicon-export"></span>
        <h3 id="bulk-export-title">
          Bulk Export to {format === 'postman' ? 'Postman' : 'HiveFetch'}
        </h3>
      </div>

      <p class="modal-description">Select collections to include in the export file.</p>

      <div class="select-all-row">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={allSelected}
            indeterminate={!allSelected && !noneSelected}
            onchange={toggleAll}
          />
          <span class="label-text">
            {allSelected ? 'Deselect All' : 'Select All'}
          </span>
          <span class="count-badge">{selectedIds.size} / {exportableCollections.length}</span>
        </label>
      </div>

      <div class="collection-list">
        {#each exportableCollections as collection (collection.id)}
          {@const itemCount = countAllItems(collection.items)}
          <label class="collection-row">
            <input
              type="checkbox"
              checked={selectedIds.has(collection.id)}
              onchange={() => toggleCollection(collection.id)}
            />
            <span class="collection-name">{collection.name}</span>
            <span class="item-count">{itemCount} {itemCount === 1 ? 'request' : 'requests'}</span>
          </label>
        {/each}
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={oncancel}>Cancel</button>
        <button class="btn btn-primary" disabled={noneSelected} onclick={handleExport}>
          Export {selectedIds.size} {selectedIds.size === 1 ? 'Collection' : 'Collections'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .modal {
    width: 380px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    padding: 16px 20px;
    animation: modalIn 0.15s ease-out;
  }

  @keyframes modalIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .modal-icon {
    font-size: 18px;
    color: var(--hf-editorInfo-foreground, #3794ff);
  }

  .modal-description {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .select-all-row {
    padding: 6px 0;
    border-bottom: 1px solid var(--hf-panel-border);
    margin-bottom: 4px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--hf-foreground);
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--hf-button-background);
  }

  .label-text {
    font-weight: 500;
  }

  .count-badge {
    margin-left: auto;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .collection-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    max-height: 300px;
    padding: 4px 0;
  }

  .collection-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    cursor: pointer;
    font-size: 12px;
    color: var(--hf-foreground);
  }

  .collection-row:hover {
    background: var(--hf-list-hoverBackground);
    border-radius: 3px;
  }

  .collection-row input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--hf-button-background);
  }

  .collection-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-count {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .btn {
    padding: 6px 14px;
    font-size: 13px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-button-secondaryBackground, var(--hf-panel-border));
  }

  .btn-secondary:hover {
    background: var(--hf-button-secondaryHoverBackground, rgba(90, 93, 94, 0.31));
  }

  .btn-primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }
</style>
