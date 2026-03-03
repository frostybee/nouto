<script lang="ts">
  import { tick } from 'svelte';
  import type { KeyValue } from '../../types';
  import { generateId } from '../../types';
  import VariableIndicator from './VariableIndicator.svelte';
  import AutocompleteInput from './AutocompleteInput.svelte';
  import type { HeaderInfo } from '../../lib/http-header-descriptions';

  interface Props {
    items?: KeyValue[];
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    showDescription?: boolean;
    onchange?: (items: KeyValue[]) => void;
    keySuggestions?: string[];
    keyDescriptions?: Record<string, HeaderInfo>;
    valueSuggestions?: Record<string, string[]>;
  }
  let { items = [], keyPlaceholder = 'Key', valuePlaceholder = 'Value', showDescription = false, onchange, keySuggestions, keyDescriptions, valueSuggestions }: Props = $props();

  // Get value suggestions for a specific row based on its key
  function getValueSuggestionsForRow(key: string): string[] | undefined {
    if (!valueSuggestions || !key) return undefined;

    // Try exact match first
    if (valueSuggestions[key]) {
      return valueSuggestions[key];
    }

    // Try case-insensitive match
    const normalizedKey = Object.keys(valueSuggestions).find(
      k => k.toLowerCase() === key.toLowerCase()
    );

    return normalizedKey ? valueSuggestions[normalizedKey] : undefined;
  }

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

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function updateDescription(index: number, description: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], description };
    updateItems(newItems);
  }

  function addRow() {
    updateItems([...items, { id: generateId(), key: '', value: '', enabled: true }]);
  }

  function removeRow(index: number) {
    const newItems = items.filter((_, i) => i !== index);
    updateItems(newItems);
  }

  function handleKeyDown(event: KeyboardEvent, index: number) {
    // Allow Ctrl+Enter to bubble up for global send request shortcut
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      // If on the last row, add a new row
      if (index === items.length - 1) {
        addRow();
        // Focus the new row's key input after Svelte updates
        tick().then(() => {
          const inputs = document.querySelectorAll('.kv-row .key-input');
          const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
          lastInput?.focus();
        });
      }
    }
  }
</script>

<div class="kv-editor">
  {#if items.length === 0}
    <div class="empty-state">
      <p>No items added yet</p>
      <button class="add-btn" onclick={addRow}>
        <span class="icon codicon codicon-add"></span> Add Item
      </button>
    </div>
  {:else}
    <div class="kv-header">
      <div class="col-check"></div>
      <div class="col-key">{keyPlaceholder}</div>
      <div class="col-value">{valuePlaceholder}</div>
      {#if showDescription}
        <div class="col-description">Description</div>
      {/if}
      <div class="col-actions"></div>
    </div>

    {#each items as item, index (item.id)}
      <div class="kv-row" class:disabled={!item.enabled}>
        <div class="col-check">
          <input
            type="checkbox"
            checked={item.enabled}
            onchange={() => toggleEnabled(index)}
            title={item.enabled ? 'Disable' : 'Enable'}
          />
        </div>
        <div class="col-key">
          {#if keySuggestions && keySuggestions.length > 0}
            <AutocompleteInput
              value={item.key}
              placeholder={keyPlaceholder}
              suggestions={keySuggestions}
              suggestionDescriptions={keyDescriptions}
              oninput={(value) => updateKey(index, value)}
              onkeydown={(e) => handleKeyDown(e, index)}
            />
          {:else}
            <input
              type="text"
              class="key-input"
              placeholder={keyPlaceholder}
              value={item.key}
              oninput={(e) => updateKey(index, e.currentTarget.value)}
              onkeydown={(e) => handleKeyDown(e, index)}
            />
          {/if}
        </div>
        <div class="col-value">
          {#if valueSuggestions && getValueSuggestionsForRow(item.key)?.length}
            <AutocompleteInput
              value={item.value}
              placeholder={valuePlaceholder}
              suggestions={getValueSuggestionsForRow(item.key) ?? []}
              oninput={(value) => updateValue(index, value)}
              onkeydown={(e) => handleKeyDown(e, index)}
            />
          {:else}
            <input
              type="text"
              class="value-input"
              placeholder={valuePlaceholder}
              value={item.value}
              oninput={(e) => updateValue(index, e.currentTarget.value)}
              onkeydown={(e) => handleKeyDown(e, index)}
            />
          {/if}
        </div>
        <div class="col-indicator">
          <VariableIndicator text={`${item.key} ${item.value}`} />
        </div>
        {#if showDescription}
          <div class="col-description">
            <textarea
              class="description-input"
              placeholder="Description"
              rows={1}
              use:autoResize
              oninput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
                updateDescription(index, el.value);
              }}
            >{item.description ?? ''}</textarea>
          </div>
        {/if}
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
    color: var(--hf-descriptionForeground);
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

  .kv-header {
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
    accent-color: var(--hf-focusBorder);
  }

  .col-key {
    flex: 1;
    min-width: 0;
  }

  .col-value {
    flex: 2;
    min-width: 0;
  }

  .col-indicator {
    width: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-description {
    flex: 1.5;
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
  .value-input,
  .description-input {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .description-input {
    resize: none;
    overflow: auto;
    line-height: 1.4;
    min-height: 28px;
    box-sizing: border-box;
  }

  .key-input:focus,
  .value-input:focus,
  .description-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .key-input::placeholder,
  .value-input::placeholder,
  .description-input::placeholder {
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
