<script lang="ts">
  import { onMount } from 'svelte';
  import {
    setSearchQuery, setSearchOptions, nextSearchResult, prevSearchResult,
    clearSearch, searchResults, searchCurrentIndex, searchQuery,
    filterMode, toggleFilterMode, searchFuzzy,
  } from '../../stores/jsonExplorer.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  interface Props {
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  let inputEl = $state<HTMLInputElement>(undefined!);
  let localQuery = $state('');
  let regexMode = $state(false);
  let caseSensitive = $state(false);
  let fuzzyMode = $state(false);
  let scope = $state<'all' | 'keys' | 'values'>('all');

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    // Focus input on mount
    inputEl?.focus();
    // Restore previous query if any
    localQuery = searchQuery();
  });

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setSearchQuery(localQuery);
    }, 300);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Immediate search + navigate
      clearTimeout(debounceTimer);
      setSearchQuery(localQuery);
      if (e.shiftKey) {
        prevSearchResult();
      } else {
        nextSearchResult();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearSearch();
      onClose?.();
    }
  }

  function toggleRegex() {
    regexMode = !regexMode;
    setSearchOptions({ regex: regexMode });
  }

  function toggleCaseSensitive() {
    caseSensitive = !caseSensitive;
    setSearchOptions({ caseSensitive });
  }

  function cycleScope() {
    const scopes: Array<'all' | 'keys' | 'values'> = ['all', 'keys', 'values'];
    const idx = scopes.indexOf(scope);
    scope = scopes[(idx + 1) % scopes.length];
    setSearchOptions({ scope });
  }

  function handleClear() {
    localQuery = '';
    clearSearch();
    inputEl?.focus();
  }

  const scopeLabels = { all: 'All', keys: 'Keys', values: 'Values' };
  const scopeIcons = { all: 'codicon-filter', keys: 'codicon-symbol-key', values: 'codicon-symbol-string' };
</script>

<div class="search-bar">
  <div class="search-input-container">
    <i class="codicon codicon-search search-icon"></i>
    <input
      bind:this={inputEl}
      bind:value={localQuery}
      oninput={handleInput}
      onkeydown={handleKeydown}
      type="text"
      class="search-input"
      placeholder="Search keys and values..."
      spellcheck={false}
    />
    {#if localQuery}
      <button class="input-btn clear-btn" onclick={handleClear} aria-label="Clear search">
        <i class="codicon codicon-close"></i>
      </button>
    {/if}
  </div>

  <!-- Options -->
  <Tooltip text="Toggle regex">
    <button
      class="option-btn"
      class:active={regexMode}
      onclick={toggleRegex}
      aria-label="Toggle regex"
    >
      <i class="codicon codicon-regex"></i>
    </button>
  </Tooltip>
  <Tooltip text="Toggle case sensitivity">
    <button
      class="option-btn"
      class:active={caseSensitive}
      onclick={toggleCaseSensitive}
      aria-label="Toggle case sensitivity"
    >
      <i class="codicon codicon-case-sensitive"></i>
    </button>
  </Tooltip>
  <Tooltip text="Search scope: {scopeLabels[scope]}">
    <button class="option-btn scope-btn" onclick={cycleScope} aria-label="Search scope">
      <i class="codicon {scopeIcons[scope]}"></i>
      <span class="scope-label">{scopeLabels[scope]}</span>
    </button>
  </Tooltip>

  <!-- Fuzzy search toggle -->
  <Tooltip text="Fuzzy search (typo-tolerant)">
    <button
      class="option-btn"
      class:active={fuzzyMode}
      onclick={() => {
        fuzzyMode = !fuzzyMode;
        if (fuzzyMode) { regexMode = false; }
        setSearchOptions({ fuzzy: fuzzyMode, regex: false });
      }}
      aria-label="Toggle fuzzy search"
    >
      <i class="codicon codicon-wand"></i>
    </button>
  </Tooltip>

  <!-- Filter mode toggle -->
  <Tooltip text={filterMode() === 'highlight' ? 'Switch to filter mode (hide non-matching)' : 'Switch to highlight mode (show all)'}>
    <button
      class="option-btn"
      class:active={filterMode() === 'filter'}
      onclick={toggleFilterMode}
      aria-label="Toggle filter mode"
    >
      <i class="codicon codicon-filter"></i>
    </button>
  </Tooltip>

  <!-- Results navigation -->
  {#if searchResults().length > 0}
    <span class="result-badge">
      {searchCurrentIndex() + 1} / {searchResults().length}
    </span>
    <Tooltip text="Previous match (Shift+Enter)">
      <button class="nav-btn" onclick={prevSearchResult} aria-label="Previous match">
        <i class="codicon codicon-arrow-up"></i>
      </button>
    </Tooltip>
    <Tooltip text="Next match (Enter)">
      <button class="nav-btn" onclick={nextSearchResult} aria-label="Next match">
        <i class="codicon codicon-arrow-down"></i>
      </button>
    </Tooltip>
  {:else if localQuery}
    <span class="result-badge no-results">No results</span>
  {/if}

  <!-- Close -->
  <button class="nav-btn close-btn" onclick={() => { clearSearch(); onClose?.(); }} aria-label="Close search">
    <i class="codicon codicon-close"></i>
  </button>
</div>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    background: var(--vscode-editor-background, #1e1e1e);
    flex-shrink: 0;
  }

  .search-input-container {
    display: flex;
    align-items: center;
    flex: 1;
    max-width: 300px;
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    padding: 0 4px;
  }

  .search-input-container:focus-within {
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .search-icon {
    font-size: 12px;
    color: var(--vscode-input-placeholderForeground, #8b8b8b);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--vscode-input-foreground, #ccc);
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    padding: 3px 4px;
    min-width: 80px;
  }

  .search-input::placeholder {
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

  .option-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 5px;
    background: none;
    border: 1px solid transparent;
    color: var(--vscode-icon-foreground, #c5c5c5);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
  }

  .option-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .option-btn.active {
    background: var(--vscode-inputOption-activeBackground, rgba(0, 127, 212, 0.4));
    border-color: var(--vscode-inputOption-activeBorder, #007fd4);
    color: var(--vscode-inputOption-activeForeground, #fff);
  }

  .scope-label {
    font-size: 10px;
    font-weight: 500;
  }

  .result-badge {
    padding: 1px 6px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
  }

  .result-badge.no-results {
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    color: var(--vscode-inputValidation-errorForeground, #f48771);
  }

  .nav-btn {
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
  }

  .nav-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .close-btn {
    margin-left: 4px;
  }
</style>
