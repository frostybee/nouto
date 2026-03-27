<script lang="ts">
  import { onMount } from 'svelte';
  import { filterByQuery } from '../lib/query-parser';
  import { explorerState } from '../stores/jsonExplorer.svelte';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  let inputEl = $state<HTMLInputElement>(undefined!);
  let query = $state('');
  let error = $state<string | null>(null);
  let resultCount = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    inputEl?.focus();
  });

  function runQuery() {
    if (!query.trim()) {
      error = null;
      resultCount = 0;
      return;
    }

    const json = explorerState().rawJson;
    if (json === undefined) return;

    // The query language works on arrays of objects
    const data = Array.isArray(json) ? json : [json];
    const result = filterByQuery(data, query);
    error = result.error;
    resultCount = result.results.length;
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runQuery, 400);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      runQuery();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  }

  function handleClear() {
    query = '';
    error = null;
    resultCount = 0;
    inputEl?.focus();
  }
</script>

<div class="query-bar">
  <div class="query-input-container" class:error={!!error}>
    <i class="codicon codicon-terminal query-icon"></i>
    <input
      bind:this={inputEl}
      bind:value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
      type="text"
      class="query-input"
      placeholder={'Query (e.g., age > 30 AND name ~ "john")'}
      spellcheck={false}
    />
    {#if query}
      <button class="input-btn" onclick={handleClear} aria-label="Clear query">
        <i class="codicon codicon-close"></i>
      </button>
    {/if}
  </div>

  {#if resultCount > 0 && !error}
    <span class="result-badge">{resultCount} match{resultCount === 1 ? '' : 'es'}</span>
  {/if}

  {#if error}
    <Tooltip text={error}>
      <span class="error-badge">
        <i class="codicon codicon-error"></i> Error
      </span>
    </Tooltip>
  {/if}

  <div class="query-help">
    <Tooltip text="Operators: =, !=, >, <, >=, <=, ~ (regex), contains, startsWith, endsWith. Combinators: AND, OR, NOT. Grouping: ()">
      <i class="codicon codicon-question help-icon"></i>
    </Tooltip>
  </div>

  <button class="close-btn" onclick={() => onClose?.()} aria-label="Close query">
    <i class="codicon codicon-close"></i>
  </button>
</div>

<style>
  .query-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
    flex-shrink: 0;
  }

  .query-input-container {
    display: flex;
    align-items: center;
    flex: 1;
    max-width: 500px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    padding: 0 4px;
  }

  .query-input-container:focus-within {
    border-color: var(--hf-focusBorder);
  }

  .query-input-container.error {
    border-color: var(--hf-inputValidation-errorBorder);
  }

  .query-icon {
    font-size: 12px;
    color: var(--hf-input-placeholderForeground);
    flex-shrink: 0;
  }

  .query-input {
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

  .query-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .input-btn {
    display: inline-flex;
    align-items: center;
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

  .result-badge {
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
  }

  .error-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    background: var(--hf-inputValidation-errorBackground);
    color: var(--hf-inputValidation-errorForeground);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
    cursor: help;
  }

  .query-help {
    display: inline-flex;
    align-items: center;
  }

  .help-icon {
    font-size: 14px;
    color: var(--hf-descriptionForeground);
    cursor: help;
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
  }

  .close-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }
</style>
