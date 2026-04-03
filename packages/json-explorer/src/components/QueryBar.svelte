<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { filterByQuery } from '../lib/query-parser';
  import { explorerState, navigateToBreadcrumb, setQueryMatchPaths, setQueryCurrentPath } from '../stores/jsonExplorer.svelte';
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    onClose?: () => void;
    onToggleHelp?: () => void;
    helpActive?: boolean;
  }
  let { onClose, onToggleHelp, helpActive = false }: Props = $props();

  let inputEl = $state<HTMLInputElement>(undefined!);
  let query = $state('');
  let error = $state<string | null>(null);
  let matchIndices = $state<number[]>([]);
  let matchedResults = $state<any[]>([]);
  let currentMatchIdx = $state(0);
  let filterMode = $state(false);
  let showCopied = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    inputEl?.focus();
  });

  onDestroy(() => {
    setQueryMatchPaths(new Set());
    setQueryCurrentPath(null);
  });

  function runQuery() {
    if (!query.trim()) {
      error = null;
      matchIndices = [];
      currentMatchIdx = 0;
      setQueryMatchPaths(new Set());
      setQueryCurrentPath(null);
      return;
    }

    const json = explorerState().rawJson;
    if (json === undefined) return;

    const data = Array.isArray(json) ? json : [json];
    const result = filterByQuery(data, query);
    error = result.error;

    if (!result.error && result.results.length > 0) {
      // Find the indices of matching items in the original array
      const indices: number[] = [];
      for (let i = 0; i < data.length; i++) {
        if (result.results.includes(data[i])) {
          indices.push(i);
        }
      }
      matchIndices = indices;
      matchedResults = result.results;
      currentMatchIdx = 0;
      // Push match paths into the store for tree row highlighting
      setQueryMatchPaths(new Set(indices.map(i => `$[${i}]`)));
      if (indices.length > 0) navigateToMatch(0);
    } else {
      matchIndices = [];
      matchedResults = [];
      currentMatchIdx = 0;
      setQueryMatchPaths(new Set());
      setQueryCurrentPath(null);
    }
  }

  function navigateToMatch(idx: number) {
    if (matchIndices.length === 0) return;
    currentMatchIdx = idx;
    const arrayIndex = matchIndices[idx];
    const path = `$[${arrayIndex}]`;
    setQueryCurrentPath(path);
    navigateToBreadcrumb(path);
  }

  function nextMatch() {
    if (matchIndices.length === 0) return;
    const next = (currentMatchIdx + 1) % matchIndices.length;
    navigateToMatch(next);
  }

  function prevMatch() {
    if (matchIndices.length === 0) return;
    const prev = (currentMatchIdx - 1 + matchIndices.length) % matchIndices.length;
    navigateToMatch(prev);
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runQuery, 400);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      if (matchIndices.length > 0 && query === inputEl.value) {
        // Query unchanged, navigate to next
        if (e.shiftKey) prevMatch();
        else nextMatch();
      } else {
        runQuery();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  }

  async function handleExportResults() {
    if (matchedResults.length === 0) return;
    const json = JSON.stringify(matchedResults, null, 2);
    await copyToClipboard(json);
    showCopied = true;
    setTimeout(() => { showCopied = false; }, 1500);
  }

  function handleClear() {
    query = '';
    error = null;
    matchIndices = [];
    matchedResults = [];
    currentMatchIdx = 0;
    filterMode = false;
    setQueryMatchPaths(new Set());
    setQueryCurrentPath(null);
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

  {#if matchIndices.length > 0 && !error}
    <span class="result-badge">{currentMatchIdx + 1} of {matchIndices.length}</span>
    <Tooltip text="Previous match (Shift+Enter)">
      <button class="nav-btn" onclick={prevMatch} aria-label="Previous match">
        <i class="codicon codicon-arrow-up"></i>
      </button>
    </Tooltip>
    <Tooltip text="Next match (Enter)">
      <button class="nav-btn" onclick={nextMatch} aria-label="Next match">
        <i class="codicon codicon-arrow-down"></i>
      </button>
    </Tooltip>
    <Tooltip text="Copy filtered results as JSON">
      <button class="nav-btn" onclick={handleExportResults} aria-label="Copy results">
        <i class="codicon {showCopied ? 'codicon-check' : 'codicon-copy'}"></i>
      </button>
    </Tooltip>
  {:else if query && !error}
    <span class="result-badge no-results">No matches</span>
  {/if}

  {#if error}
    <Tooltip text={error}>
      <span class="error-badge">
        <i class="codicon codicon-error"></i> Error
      </span>
    </Tooltip>
  {/if}

  <Tooltip text="Query help">
    <button class="nav-btn" onclick={() => onToggleHelp?.()} aria-label="Query help">
      <i class="codicon codicon-question help-icon" class:active={helpActive}></i>
    </button>
  </Tooltip>

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
    padding: 3px 10px;
    background: var(--hf-focusBorder);
    color: #ffffff;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--hf-editor-font-family);
    white-space: nowrap;
  }

  .result-badge.no-results {
    background: var(--hf-inputValidation-errorBackground);
    color: var(--hf-inputValidation-errorForeground);
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

  .help-icon {
    font-size: 14px;
    color: var(--hf-descriptionForeground);
  }

  .help-icon.active {
    color: var(--hf-focusBorder);
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
