<script lang="ts">
  import { tick } from 'svelte';
  import type { PathParam } from '../../types';
  import { generateId } from '../../types';
  import VariableIndicator from './VariableIndicator.svelte';
  import VariableResolverButton from './VariableResolverButton.svelte';
  import VariableAutocompleteInput from './VariableAutocompleteInput.svelte';

  interface Props {
    items?: PathParam[];
    onchange?: (items: PathParam[]) => void;
  }
  let { items = [], onchange }: Props = $props();

  function updateItems(newItems: typeof items) {
    items = newItems;
    onchange?.(items);
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

  function updateDescription(index: number, description: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], description };
    updateItems(newItems);
  }

  function addRow() {
    updateItems([...items, { id: generateId(), key: '', value: '', description: '', enabled: true }]);
  }

  function removeRow(index: number) {
    const newItems = items.filter((_, i) => i !== index);
    updateItems(newItems);
  }

  function handleKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (index === items.length - 1) {
        addRow();
        tick().then(() => {
          const inputs = document.querySelectorAll('.path-row .key-input');
          const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
          lastInput?.focus();
        });
      }
    }
  }
</script>

<div class="path-editor">
  {#if items.length === 0}
    <div class="empty-state">
      <p>No path parameters</p>
      <span class="empty-hint">Add <code>{'{param}'}</code> or <code>{':param'}</code> placeholders to the URL to auto-detect path parameters, or add them manually.</span>
      <button class="add-btn" onclick={addRow}>
        <span class="icon codicon codicon-add"></span> Add Parameter
      </button>
    </div>
  {:else}
    <div class="path-header">
      <div class="col-check"></div>
      <div class="col-key">Key</div>
      <div class="col-value">Value</div>
      <div class="col-desc">Description</div>
      <div class="col-indicator"></div>
      <div class="col-actions"></div>
    </div>

    {#each items as item, index (item.id)}
      <div class="path-row" class:disabled={!item.enabled}>
        <div class="col-check">
          <input
            type="checkbox"
            checked={item.enabled}
            onchange={() => toggleEnabled(index)}
            title={item.enabled ? 'Disable' : 'Enable'}
          />
        </div>
        <div class="col-key">
          <input
            type="text"
            class="key-input"
            placeholder="Parameter"
            value={item.key}
            oninput={(e) => updateKey(index, e.currentTarget.value)}
            onkeydown={(e) => handleKeyDown(e, index)}
          />
        </div>
        <div class="col-value">
          <div class="value-with-resolver">
            <VariableAutocompleteInput
              value={item.value}
              placeholder="Value"
              oninput={(val) => updateValue(index, val)}
              onkeydown={(e) => handleKeyDown(e, index)}
            />
            <VariableResolverButton oninsert={(text) => updateValue(index, text)} />
          </div>
        </div>
        <div class="col-desc">
          <input
            type="text"
            class="desc-input"
            placeholder="Description"
            value={item.description}
            oninput={(e) => updateDescription(index, e.currentTarget.value)}
            onkeydown={(e) => handleKeyDown(e, index)}
          />
        </div>
        <div class="col-indicator">
          <VariableIndicator text={`${item.key} ${item.value}`} />
        </div>
        <div class="col-actions">
          <button
            class="remove-btn"
            onclick={() => removeRow(index)}
            title="Remove"
          >
            <span class="icon codicon codicon-close"></span>
          </button>
        </div>
      </div>
    {/each}

    <button class="add-row-btn" onclick={addRow}>
      <span class="icon codicon codicon-add"></span> Add
    </button>
  {/if}
</div>

<style>
  .path-editor {
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
    color: var(--hf-descriptionForeground);
    gap: 12px;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .empty-hint {
    font-size: 12px;
    opacity: 0.8;
  }

  .empty-hint code {
    background: var(--hf-textCodeBlock-background, rgba(255, 255, 255, 0.1));
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 12px;
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .add-btn:hover {
    background: var(--hf-button-hoverBackground);
  }

  .path-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .path-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .path-row.disabled {
    opacity: 0.5;
  }

  .path-row.disabled input[type="text"] {
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
    accent-color: var(--hf-focusBorder);
  }

  .col-key {
    flex: 1;
    min-width: 0;
  }

  .col-value {
    flex: 1.5;
    min-width: 0;
  }

  .value-with-resolver {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .col-desc {
    flex: 1.5;
    min-width: 0;
  }

  .col-indicator {
    width: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-actions {
    width: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .key-input,
  .desc-input {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .key-input:focus,
  .desc-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .key-input::placeholder,
  .desc-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    color: var(--hf-descriptionForeground);
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
    background: var(--hf-list-hoverBackground);
    color: var(--hf-errorForeground);
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
    color: var(--hf-textLink-foreground);
    border: 1px dashed var(--hf-panel-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s, border-color 0.15s;
    width: fit-content;
  }

  .add-row-btn:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-textLink-foreground);
  }
</style>
