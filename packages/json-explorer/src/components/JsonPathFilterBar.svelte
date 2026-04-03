<script lang="ts">
  import { onMount } from 'svelte';
  import {
    setJsonPathFilter, clearJsonPathFilter,
    jsonPathQuery, jsonPathError, jsonPathMatchCount,
  } from '../stores/jsonExplorer.svelte';

  interface Props {
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  let inputEl = $state<HTMLInputElement>(undefined!);
  let localQuery = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    inputEl?.focus();
    localQuery = jsonPathQuery();
  });

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setJsonPathFilter(localQuery);
    }, 300);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      setJsonPathFilter(localQuery);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  }

  function handleClear() {
    localQuery = '';
    clearJsonPathFilter();
    inputEl?.focus();
  }

  function handleClose() {
    clearJsonPathFilter();
    onClose?.();
  }
</script>

<div class="filter-bar">
  <div class="filter-input-container" class:error={!!jsonPathError()}>
    <i class="codicon codicon-filter filter-icon"></i>
    <input
      bind:this={inputEl}
      bind:value={localQuery}
      oninput={handleInput}
      onkeydown={handleKeydown}
      type="text"
      class="filter-input"
      placeholder="JSONPath (e.g., $.data[*].name)"
      spellcheck={false}
    />
    {#if localQuery}
      <button class="input-btn" onclick={handleClear} aria-label="Clear filter">
        <i class="codicon codicon-close"></i>
      </button>
    {/if}
  </div>

  {#if jsonPathMatchCount() > 0}
    <span class="match-badge">{jsonPathMatchCount()} match{jsonPathMatchCount() === 1 ? '' : 'es'}</span>
  {/if}

  {#if jsonPathError()}
    <span class="error-text">{jsonPathError()}</span>
  {/if}

  <button class="nav-btn" onclick={handleClose} aria-label="Close filter">
    <i class="codicon codicon-close"></i>
  </button>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
    flex-shrink: 0;
  }

  .filter-input-container {
    display: flex;
    align-items: center;
    width: 500px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    padding: 0 4px;
  }

  .filter-input-container:focus-within {
    border-color: var(--hf-focusBorder);
  }

  .filter-input-container.error {
    border-color: var(--hf-inputValidation-errorBorder);
  }

  .filter-icon {
    font-size: 12px;
    color: var(--hf-input-placeholderForeground);
    flex-shrink: 0;
  }

  .filter-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--hf-input-foreground);
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
    padding: 3px 4px;
    min-width: 100px;
  }

  .filter-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .input-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    font-size: 12px;
  }

  .input-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .match-badge {
    padding: 3px 10px;
    background: var(--hf-focusBorder);
    color: #ffffff;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--hf-editor-font-family);
    white-space: nowrap;
  }

  .error-text {
    color: var(--hf-errorForeground);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
  }

  .nav-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }
</style>
