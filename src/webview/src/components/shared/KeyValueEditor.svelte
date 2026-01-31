<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let items: Array<{ key: string; value: string; enabled: boolean }> = [];
  export let keyPlaceholder = 'Key';
  export let valuePlaceholder = 'Value';

  const dispatch = createEventDispatcher<{
    change: Array<{ key: string; value: string; enabled: boolean }>;
  }>();

  function updateItems(newItems: typeof items) {
    items = newItems;
    dispatch('change', items);
  }

  function toggleEnabled(index: number) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], enabled: !newItems[index].enabled };
    updateItems(newItems);
  }

  function updateKey(index: number, key: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], key };
    updateItems(newItems);
  }

  function updateValue(index: number, value: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], value };
    updateItems(newItems);
  }

  function addRow() {
    updateItems([...items, { key: '', value: '', enabled: true }]);
  }

  function removeRow(index: number) {
    const newItems = items.filter((_, i) => i !== index);
    updateItems(newItems);
  }

  function handleKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      // If on the last row, add a new row
      if (index === items.length - 1) {
        addRow();
        // Focus the new row's key input after Svelte updates
        setTimeout(() => {
          const inputs = document.querySelectorAll('.kv-row .key-input');
          const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
          lastInput?.focus();
        }, 0);
      }
    }
  }
</script>

<div class="kv-editor">
  {#if items.length === 0}
    <div class="empty-state">
      <p>No items added yet</p>
      <button class="add-btn" on:click={addRow}>
        <span class="icon">+</span> Add Item
      </button>
    </div>
  {:else}
    <div class="kv-header">
      <div class="col-check"></div>
      <div class="col-key">{keyPlaceholder}</div>
      <div class="col-value">{valuePlaceholder}</div>
      <div class="col-actions"></div>
    </div>

    {#each items as item, index (index)}
      <div class="kv-row" class:disabled={!item.enabled}>
        <div class="col-check">
          <input
            type="checkbox"
            checked={item.enabled}
            on:change={() => toggleEnabled(index)}
            title={item.enabled ? 'Disable' : 'Enable'}
          />
        </div>
        <div class="col-key">
          <input
            type="text"
            class="key-input"
            placeholder={keyPlaceholder}
            value={item.key}
            on:input={(e) => updateKey(index, e.currentTarget.value)}
            on:keydown={(e) => handleKeyDown(e, index)}
          />
        </div>
        <div class="col-value">
          <input
            type="text"
            class="value-input"
            placeholder={valuePlaceholder}
            value={item.value}
            on:input={(e) => updateValue(index, e.currentTarget.value)}
            on:keydown={(e) => handleKeyDown(e, index)}
          />
        </div>
        <div class="col-actions">
          <button
            class="remove-btn"
            on:click={() => removeRow(index)}
            title="Remove"
          >
            <span class="icon">×</span>
          </button>
        </div>
      </div>
    {/each}

    <button class="add-row-btn" on:click={addRow}>
      <span class="icon">+</span> Add
    </button>
  {/if}
</div>

<style>
  .kv-editor {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: var(--vscode-descriptionForeground);
    gap: 12px;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .add-btn:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .kv-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .kv-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .kv-row.disabled {
    opacity: 0.5;
  }

  .kv-row.disabled input[type="text"] {
    text-decoration: line-through;
  }

  .col-check {
    width: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-check input[type="checkbox"] {
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--vscode-focusBorder);
  }

  .col-key {
    flex: 1;
    min-width: 0;
  }

  .col-value {
    flex: 2;
    min-width: 0;
  }

  .col-actions {
    width: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .key-input,
  .value-input {
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .key-input:focus,
  .value-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .key-input::placeholder,
  .value-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
  }

  .remove-btn:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
    color: var(--vscode-errorForeground);
  }

  .icon {
    font-weight: 400;
  }

  .add-row-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    margin-top: 4px;
    background: transparent;
    color: var(--vscode-textLink-foreground);
    border: 1px dashed var(--vscode-panel-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s, border-color 0.15s;
    width: fit-content;
  }

  .add-row-btn:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-textLink-foreground);
  }
</style>
