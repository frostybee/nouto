<script lang="ts">
  import { onMount } from 'svelte';
  import {
    setJsonPathFilter, clearJsonPathFilter,
    jsonPathQuery, jsonPathError, jsonPathMatchCount,
  } from '../../stores/jsonExplorer.svelte';

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

  <button class="close-btn" onclick={handleClose} aria-label="Close filter">
    <i class="codicon codicon-close"></i>
  </button>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    background: var(--vscode-editor-background, #1e1e1e);
    flex-shrink: 0;
  }

  .filter-input-container {
    display: flex;
    align-items: center;
    flex: 1;
    max-width: 400px;
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    padding: 0 4px;
  }

  .filter-input-container:focus-within {
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .filter-input-container.error {
    border-color: var(--vscode-inputValidation-errorBorder, #be1100);
  }

  .filter-icon {
    font-size: 12px;
    color: var(--vscode-input-placeholderForeground, #8b8b8b);
    flex-shrink: 0;
  }

  .filter-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--vscode-input-foreground, #ccc);
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    padding: 3px 4px;
    min-width: 100px;
  }

  .filter-input::placeholder {
    color: var(--vscode-input-placeholderForeground, #8b8b8b);
  }

  .input-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--vscode-icon-foreground, #c5c5c5);
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    font-size: 12px;
  }

  .input-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .match-badge {
    padding: 1px 6px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
  }

  .error-text {
    color: var(--vscode-errorForeground, #f48771);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--vscode-icon-foreground, #c5c5c5);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    margin-left: auto;
  }

  .close-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }
</style>
