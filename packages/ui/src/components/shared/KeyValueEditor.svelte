<script lang="ts">
  import { tick } from 'svelte';
  import type { KeyValue } from '../../types';
  import { generateId } from '../../types';
  import VariableIndicator from './VariableIndicator.svelte';
  import AutocompleteInput from './AutocompleteInput.svelte';
  import VariableResolverButton from './VariableResolverButton.svelte';
  import VariableAutocompleteInput from './VariableAutocompleteInput.svelte';
  import Tooltip from './Tooltip.svelte';
  import type { HeaderInfo } from '../../lib/http-header-descriptions';

  interface Props {
    items?: KeyValue[];
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    emptyText?: string;
    showDescription?: boolean;
    showSecretToggle?: boolean;
    onchange?: (items: KeyValue[]) => void;
    keySuggestions?: string[];
    keyDescriptions?: Record<string, HeaderInfo>;
    valueSuggestions?: Record<string, string[]>;
    keyValidator?: (key: string) => string | null;
  }
  let { items = [], keyPlaceholder = 'Key', valuePlaceholder = 'Value', emptyText = 'No items added yet', showDescription = false, showSecretToggle = false, onchange, keySuggestions, keyDescriptions, valueSuggestions, keyValidator }: Props = $props();

  // Track which secret rows have their values revealed
  let revealedIds = $state<Record<string, boolean>>({});

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

  function toggleSecret(index: number) {
    const newItems = [...items];
    const item = newItems[index];
    const wasSecret = !!item.isSecret;
    newItems[index] = { ...item, isSecret: !wasSecret };
    if (wasSecret) {
      const { [item.id]: _, ...rest } = revealedIds;
      revealedIds = rest;
    }
    updateItems(newItems);
  }

  function toggleReveal(id: string) {
    if (revealedIds[id]) {
      const { [id]: _, ...rest } = revealedIds;
      revealedIds = rest;
    } else {
      revealedIds = { ...revealedIds, [id]: true };
    }
  }

  // Auto-detect secret-looking values
  const SECRET_KEY_PATTERN = /(?:key|secret|token|password|passwd|auth|credential|api.?key)/i;
  const SECRET_VALUE_PATTERN = /^(?:sk-|sk_live_|sk_test_|ghp_|gho_|ghs_|Bearer\s|AKIA|xoxb-|xoxp-|xoxs-|glpat-|npm_|pypi-|whsec_|rk_live_|rk_test_|shpat_|shpss_|shppa_)/;

  let dismissedSuggestions = $state<Record<string, boolean>>({});

  function shouldSuggestSecret(item: KeyValue): boolean {
    if (!showSecretToggle || item.isSecret) return false;
    if (dismissedSuggestions[item.id]) return false;
    if (SECRET_KEY_PATTERN.test(item.key)) return true;
    if (item.value.length > 20 && SECRET_VALUE_PATTERN.test(item.value)) return true;
    return false;
  }

  function dismissSuggestion(id: string) {
    dismissedSuggestions = { ...dismissedSuggestions, [id]: true };
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
      <p>{emptyText}</p>
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

    {#each items as item, index (item.id ?? index)}
      {@const keyError = keyValidator ? keyValidator(item.key) : null}
      {@const isSecretRow = showSecretToggle && !!item.isSecret}
      <div class="kv-row" class:disabled={!item.enabled}>
        <div class="col-check">
          <Tooltip text={item.enabled ? 'Disable' : 'Enable'}>
            <input
              type="checkbox"
              checked={item.enabled}
              onchange={() => toggleEnabled(index)}
              aria-label={item.enabled ? 'Disable' : 'Enable'}
            />
          </Tooltip>
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
              class:key-invalid={keyError}
              placeholder={keyPlaceholder}
              value={item.key}
              oninput={(e) => updateKey(index, e.currentTarget.value)}
              onkeydown={(e) => handleKeyDown(e, index)}
            />
          {/if}
          {#if keyError}
            <Tooltip text={keyError}>
              <span class="key-error-hint">
                <i class="codicon codicon-warning"></i>
              </span>
            </Tooltip>
          {/if}
        </div>
        <div class="col-value">
          <div class="value-with-resolver">
            {#if isSecretRow && !revealedIds[item.id]}
              <input
                type="password"
                class="key-input"
                placeholder={valuePlaceholder}
                value={item.value}
                oninput={(e) => updateValue(index, e.currentTarget.value)}
                onkeydown={(e) => handleKeyDown(e, index)}
              />
            {:else if valueSuggestions && getValueSuggestionsForRow(item.key)?.length}
              <AutocompleteInput
                value={item.value}
                placeholder={valuePlaceholder}
                suggestions={getValueSuggestionsForRow(item.key) ?? []}
                oninput={(value) => updateValue(index, value)}
                onkeydown={(e) => handleKeyDown(e, index)}
              />
            {:else}
              <VariableAutocompleteInput
                value={item.value}
                placeholder={valuePlaceholder}
                oninput={(val) => updateValue(index, val)}
                onkeydown={(e) => handleKeyDown(e, index)}
              />
            {/if}
            {#if isSecretRow}
              <Tooltip text={revealedIds[item.id] ? 'Hide value' : 'Reveal value'} position="top">
                <button
                  class="reveal-btn"
                  onclick={() => toggleReveal(item.id)}
                  aria-label={revealedIds[item.id] ? 'Hide value' : 'Reveal value'}
                >
                  <i class="codicon {revealedIds[item.id] ? 'codicon-eye-closed' : 'codicon-eye'}"></i>
                </button>
              </Tooltip>
            {:else}
              <VariableResolverButton oninsert={(text) => updateValue(index, text)} />
            {/if}
          </div>
        </div>
        <div class="col-indicator">
          <VariableIndicator text={`${item.key} ${item.value}`} />
        </div>
        {#if showSecretToggle}
          <div class="col-secret">
            <Tooltip text={item.isSecret ? 'Remove secret protection (value will be saved to disk)' : 'Mark as secret (value stored securely, never saved to disk)'} position="top">
              <button
                class="secret-btn"
                class:active={!!item.isSecret}
                onclick={() => toggleSecret(index)}
                aria-label={item.isSecret ? 'Remove secret protection' : 'Mark as secret'}
              >
                <i class="codicon {item.isSecret ? 'codicon-lock' : 'codicon-unlock'}"></i>
              </button>
            </Tooltip>
          </div>
        {/if}
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
          <Tooltip text="Remove">
            <button
              class="remove-btn"
              onclick={() => removeRow(index)}
              aria-label="Remove"
            >
              <span class="icon codicon codicon-close"></span>
            </button>
          </Tooltip>
        </div>
      </div>
      {#if shouldSuggestSecret(item)}
        <div class="secret-suggestion">
          <i class="codicon codicon-shield"></i>
          <span>This looks like a secret. Mark it to prevent saving to disk.</span>
          <button class="suggestion-action" onclick={() => toggleSecret(index)}>Mark as secret</button>
          <button class="suggestion-dismiss" onclick={() => dismissSuggestion(item.id)} aria-label="Dismiss">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
      {/if}
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
    position: relative;
  }

  .key-invalid {
    border-color: var(--hf-inputValidation-warningBorder, #cca700) !important;
  }

  .key-error-hint {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--hf-inputValidation-warningBorder, #cca700);
    font-size: 12px;
    cursor: help;
    line-height: 1;
  }

  .col-value {
    flex: 2;
    min-width: 0;
  }

  .value-with-resolver {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .value-with-resolver :global(.autocomplete-wrapper),
  .value-with-resolver :global(.var-autocomplete-wrapper) {
    flex: 1;
    min-width: 0;
  }

  .col-indicator {
    width: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-secret {
    width: 24px;
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
  .description-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .key-input::placeholder,
  .description-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  input[type="password"] {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  input[type="password"]:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  input[type="password"]::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .secret-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    font-size: 13px;
    opacity: 0.5;
    transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  }

  .secret-btn:hover {
    opacity: 1;
    border-color: var(--hf-input-border, var(--hf-panel-border));
  }

  .secret-btn.active {
    opacity: 1;
    color: var(--hf-charts-yellow, #e2c08d);
  }

  .reveal-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    font-size: 13px;
    opacity: 0.5;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }

  .reveal-btn:hover {
    opacity: 1;
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

  .secret-suggestion {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 32px;
    font-size: 11px;
    color: var(--hf-charts-yellow, #e2c08d);
    opacity: 0.85;
  }

  .secret-suggestion .codicon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .secret-suggestion span {
    flex: 1;
    min-width: 0;
  }

  .suggestion-action {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--hf-charts-yellow, #e2c08d);
    border-radius: 3px;
    color: var(--hf-charts-yellow, #e2c08d);
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .suggestion-action:hover {
    background: color-mix(in srgb, var(--hf-charts-yellow, #e2c08d) 15%, transparent);
  }

  .suggestion-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .suggestion-dismiss:hover {
    opacity: 1;
  }
</style>
