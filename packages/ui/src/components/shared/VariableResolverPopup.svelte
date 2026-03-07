<script lang="ts">
  import { activeVariablesList } from '../../stores/environment';
  import { MOCK_VARIABLES, VALUE_TRANSFORMS } from '../../lib/value-transforms';
  import type { ActiveVariableEntry } from '../../stores/environment';

  interface Props {
    oninsert: (text: string) => void;
    onclose: () => void;
  }
  let { oninsert, onclose }: Props = $props();

  type Tab = 'variables' | 'mock' | 'fixed';
  let activeTab = $state<Tab>('variables');
  let searchQuery = $state('');
  let fixedInput = $state('');
  let selectedTransformId = $state('');
  let transformPreview = $state('');
  let selectedIndex = $state(0);

  const variables = $derived($activeVariablesList);

  const filteredVariables = $derived(
    searchQuery
      ? variables.filter(v => v.key.toLowerCase().includes(searchQuery.toLowerCase()))
      : variables
  );

  const filteredMock = $derived(
    searchQuery
      ? MOCK_VARIABLES.filter(v =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : MOCK_VARIABLES
  );

  function selectVariable(v: ActiveVariableEntry) {
    oninsert(`{{${v.key}}}`);
    onclose();
  }

  function selectMock(name: string) {
    oninsert(`{{${name}}}`);
    onclose();
  }

  async function updatePreview() {
    if (!fixedInput) {
      transformPreview = '';
      return;
    }
    if (!selectedTransformId) {
      transformPreview = fixedInput;
      return;
    }
    const t = VALUE_TRANSFORMS.find(t => t.id === selectedTransformId);
    if (!t) {
      transformPreview = fixedInput;
      return;
    }
    try {
      transformPreview = await t.transform(fixedInput);
    } catch {
      transformPreview = '(error)';
    }
  }

  $effect(() => {
    // Re-run when fixedInput or selectedTransformId changes
    fixedInput;
    selectedTransformId;
    updatePreview();
  });

  // Reset search and selectedIndex when switching tabs
  $effect(() => {
    activeTab;
    searchQuery = '';
    selectedIndex = 0;
  });

  // Reset selectedIndex when search changes
  $effect(() => {
    searchQuery;
    selectedIndex = 0;
  });

  function insertFixed() {
    if (transformPreview) {
      oninsert(transformPreview);
      onclose();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
      return;
    }

    if (activeTab === 'fixed') return;

    const items = activeTab === 'variables' ? filteredVariables : filteredMock;
    const maxIndex = items.length - 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, maxIndex);
      scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollToSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeTab === 'variables' && filteredVariables[selectedIndex]) {
        selectVariable(filteredVariables[selectedIndex]);
      } else if (activeTab === 'mock' && filteredMock[selectedIndex]) {
        selectMock(filteredMock[selectedIndex].name);
      }
    }
  }

  function scrollToSelected() {
    requestAnimationFrame(() => {
      const el = document.querySelector('.resolver-popup .list-item.selected');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="resolver-popup" onkeydown={handleKeyDown}>
  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'variables'}
      onclick={() => activeTab = 'variables'}
    >Variables</button>
    <button
      class="tab"
      class:active={activeTab === 'mock'}
      onclick={() => activeTab = 'mock'}
    >Mock Data</button>
    <button
      class="tab"
      class:active={activeTab === 'fixed'}
      onclick={() => activeTab = 'fixed'}
    >Fixed Value</button>
  </div>

  {#if activeTab !== 'fixed'}
    <div class="search-box">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        class="search-input"
        placeholder="Search..."
        bind:value={searchQuery}
        autofocus
      />
    </div>
  {/if}

  {#if activeTab === 'variables'}
    <div class="list">
      {#if filteredVariables.length === 0}
        <div class="empty">No variables found</div>
      {:else}
        {#each filteredVariables as v, i}
          <button
            class="list-item"
            class:selected={i === selectedIndex}
            onclick={() => selectVariable(v)}
            onpointerenter={() => selectedIndex = i}
          >
            <span class="var-key">{v.key}</span>
            <span class="var-sep">=</span>
            <span class="var-value">{v.isSecret ? '******' : v.value}</span>
          </button>
        {/each}
      {/if}
    </div>

  {:else if activeTab === 'mock'}
    <div class="list">
      {#if filteredMock.length === 0}
        <div class="empty">No mock variables found</div>
      {:else}
        {#each filteredMock as v, i}
          <button
            class="list-item"
            class:selected={i === selectedIndex}
            onclick={() => selectMock(v.name)}
            onpointerenter={() => selectedIndex = i}
          >
            <span class="mock-name">{v.name}</span>
            <span class="mock-desc">{v.description}</span>
          </button>
        {/each}
      {/if}
    </div>

  {:else}
    <div class="fixed-panel">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        class="fixed-input"
        placeholder="Enter a value..."
        bind:value={fixedInput}
        autofocus
      />
      <select class="transform-select" bind:value={selectedTransformId}>
        <option value="">None (raw value)</option>
        {#each VALUE_TRANSFORMS as t}
          <option value={t.id}>{t.label}</option>
        {/each}
      </select>
      {#if transformPreview}
        <div class="preview">
          <span class="preview-label">Preview:</span>
          <code class="preview-value">{transformPreview}</code>
        </div>
      {/if}
      <button
        class="insert-btn"
        disabled={!transformPreview}
        onclick={insertFixed}
      >Insert</button>
    </div>
  {/if}
</div>

<style>
  .resolver-popup {
    width: 340px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border, var(--hf-focusBorder));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-size: 12px;
    overflow: hidden;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .tab {
    flex: 1;
    padding: 7px 8px;
    background: transparent;
    color: var(--hf-descriptionForeground);
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover {
    color: var(--hf-foreground);
  }

  .tab.active {
    color: var(--hf-foreground);
    border-bottom-color: var(--hf-focusBorder);
  }

  .search-box {
    padding: 6px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    padding: 5px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    outline: none;
  }

  .search-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .search-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .list {
    overflow-y: auto;
    max-height: 220px;
    flex: 1;
  }

  .list::-webkit-scrollbar {
    width: 8px;
  }

  .list::-webkit-scrollbar-thumb {
    background: var(--hf-scrollbarSlider-background);
    border-radius: 4px;
  }

  .list::-webkit-scrollbar-thumb:hover {
    background: var(--hf-scrollbarSlider-hoverBackground);
  }

  .empty {
    padding: 16px;
    text-align: center;
    color: var(--hf-descriptionForeground);
    font-style: italic;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--hf-dropdown-foreground);
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    transition: background 0.1s;
  }

  .list-item:hover,
  .list-item.selected {
    background: var(--hf-list-hoverBackground);
  }

  .list-item.selected {
    color: var(--hf-list-activeSelectionForeground);
  }

  .var-key {
    font-weight: 600;
    flex-shrink: 0;
  }

  .var-sep {
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
  }

  .var-value {
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mock-name {
    font-weight: 600;
    flex-shrink: 0;
    color: var(--hf-textLink-foreground);
  }

  .mock-desc {
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fixed-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }

  .fixed-input {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    outline: none;
  }

  .fixed-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .fixed-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .transform-select {
    width: 100%;
    padding: 5px 8px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 12px;
    outline: none;
    cursor: pointer;
  }

  .transform-select:focus {
    border-color: var(--hf-focusBorder);
  }

  .preview {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    background: var(--hf-textCodeBlock-background, rgba(255, 255, 255, 0.05));
    border-radius: 4px;
    min-height: 28px;
  }

  .preview-label {
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
    font-size: 11px;
    line-height: 1.5;
  }

  .preview-value {
    color: var(--hf-foreground);
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 11px;
    word-break: break-all;
    line-height: 1.5;
  }

  .insert-btn {
    padding: 6px 12px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.15s;
  }

  .insert-btn:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .insert-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
