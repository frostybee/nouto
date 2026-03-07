<script lang="ts">
  import type { FormDataItem } from '../../lib/form-helpers';
  import { postMessage, onMessage } from '../../lib/vscode';
  import { generateId } from '../../types';
  import VariableResolverButton from './VariableResolverButton.svelte';
  import VariableAutocompleteInput from './VariableAutocompleteInput.svelte';

  interface Props {
    items: FormDataItem[];
    onchange?: (items: FormDataItem[]) => void;
  }
  let { items = [], onchange }: Props = $props();

  function addRow() {
    const newItems = [...items, { key: '', value: '', enabled: true, fieldType: 'text' as const }];
    onchange?.(newItems);
  }

  function removeRow(index: number) {
    const newItems = items.filter((_, i) => i !== index);
    onchange?.(newItems);
  }

  function updateRow(index: number, updates: Partial<FormDataItem>) {
    const newItems = items.map((item, i) => i === index ? { ...item, ...updates } : item);
    onchange?.(newItems);
  }

  function toggleEnabled(index: number) {
    updateRow(index, { enabled: !items[index].enabled });
  }

  function toggleFieldType(index: number) {
    const current = items[index].fieldType || 'text';
    const newType = current === 'text' ? 'file' : 'text';
    updateRow(index, { fieldType: newType, value: '', fileName: undefined, fileSize: undefined, fileMimeType: undefined });
  }

  function selectFile(index: number) {
    const fieldId = `formdata-${index}`;
    postMessage({ type: 'selectFile', data: { fieldId } });
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Listen for file selections
  $effect(() => {
    const cleanup = onMessage((msg: any) => {
      if (msg.type === 'fileSelected' && msg.data.fieldId?.startsWith('formdata-')) {
        const index = parseInt(msg.data.fieldId.split('-')[1], 10);
        if (!isNaN(index) && index < items.length) {
          updateRow(index, {
            value: msg.data.filePath,
            fileName: msg.data.fileName,
            fileSize: msg.data.fileSize,
            fileMimeType: msg.data.fileMimeType,
          });
        }
      }
    });
    return cleanup;
  });
</script>

<div class="formdata-editor">
  <div class="rows">
    {#each items as item, index}
      <div class="row" class:disabled={!item.enabled}>
        <button
          class="toggle-btn"
          class:active={item.enabled}
          onclick={() => toggleEnabled(index)}
          title={item.enabled ? 'Disable' : 'Enable'}
        >
          <i class="codicon" class:codicon-check={item.enabled} class:codicon-circle-outline={!item.enabled}></i>
        </button>

        <input
          class="key-input"
          type="text"
          placeholder="Field name"
          value={item.key}
          oninput={(e) => updateRow(index, { key: e.currentTarget.value })}
        />

        <button
          class="type-toggle"
          onclick={() => toggleFieldType(index)}
          title={item.fieldType === 'file' ? 'Switch to text' : 'Switch to file'}
        >
          {item.fieldType === 'file' ? 'File' : 'Text'}
        </button>

        {#if item.fieldType === 'file'}
          <div class="file-field">
            {#if item.fileName}
              <span class="file-label" title={item.value}>
                {item.fileName}
                {#if item.fileSize}
                  <span class="file-size">({formatSize(item.fileSize)})</span>
                {/if}
              </span>
            {:else}
              <span class="no-file">No file selected</span>
            {/if}
            <button class="select-file-btn" onclick={() => selectFile(index)}>
              Browse
            </button>
          </div>
        {:else}
          <div class="value-with-resolver">
            <VariableAutocompleteInput
              value={item.value}
              placeholder="Value"
              oninput={(val) => updateRow(index, { value: val })}
            />
            <VariableResolverButton oninsert={(text) => updateRow(index, { value: text })} />
          </div>
        {/if}

        <button class="remove-btn" onclick={() => removeRow(index)} title="Remove">
          <i class="codicon codicon-close"></i>
        </button>
      </div>
    {/each}
  </div>

  <button class="add-btn" onclick={addRow}>
    <i class="codicon codicon-add"></i> Add Field
  </button>
</div>

<style>
  .formdata-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .row.disabled { opacity: 0.5; }

  .toggle-btn {
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-foreground);
    opacity: 0.5;
  }

  .toggle-btn.active { opacity: 1; color: #49cc90; }

  .value-with-resolver {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .key-input {
    flex: 1;
    padding: 6px 10px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .key-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .key-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .type-toggle {
    padding: 4px 8px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border: none;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .type-toggle:hover { opacity: 0.8; }

  .file-field {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    min-height: 30px;
  }

  .file-label {
    flex: 1;
    font-size: 12px;
    color: var(--hf-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    color: var(--hf-descriptionForeground);
    font-size: 11px;
  }

  .no-file {
    flex: 1;
    font-size: 12px;
    color: var(--hf-input-placeholderForeground);
    font-style: italic;
  }

  .select-file-btn {
    padding: 2px 8px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  .select-file-btn:hover { background: var(--hf-button-secondaryHoverBackground); }

  .remove-btn {
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-foreground);
    opacity: 0.5;
  }

  .remove-btn:hover { opacity: 1; color: var(--hf-errorForeground); }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: transparent;
    color: var(--hf-textLink-foreground);
    border: 1px dashed var(--hf-panel-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
  }

  .add-btn:hover { background: var(--hf-list-hoverBackground); }
</style>
