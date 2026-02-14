<script lang="ts">
  interface Props {
    onFilter: (query: string) => void;
    matchCount: number;
    error: string | null;
  }
  let { onFilter, matchCount, error }: Props = $props();

  let query = $state('');
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onFilter(query);
    }, 300);
  }

  function handleClear() {
    query = '';
    clearTimeout(debounceTimer);
    onFilter('');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      onFilter(query);
    }
  }
</script>

<div class="jsonpath-filter" class:has-error={!!error}>
  <div class="filter-row">
    <input
      type="text"
      class="filter-input"
      class:error={!!error}
      placeholder="JSONPath (e.g., $.data[*].name)"
      value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
    />
    {#if query}
      {#if !error && matchCount > 0}
        <span class="match-badge">{matchCount} match{matchCount !== 1 ? 'es' : ''}</span>
      {/if}
      <button class="clear-btn" onclick={handleClear} title="Clear filter">&times;</button>
    {/if}
  </div>
  {#if error}
    <div class="filter-error">{error}</div>
  {/if}
</div>

<style>
  .jsonpath-filter {
    padding: 4px 8px;
    border-top: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .filter-input {
    flex: 1;
    padding: 3px 8px;
    background: var(--hf-input-background, #3c3c3c);
    color: var(--hf-input-foreground, #d4d4d4);
    border: 1px solid var(--hf-input-border, #3c3c3c);
    border-radius: 3px;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    outline: none;
  }

  .filter-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .filter-input.error {
    border-color: var(--hf-inputValidation-errorBorder, #f44336);
  }

  .match-badge {
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    font-size: 10px;
    white-space: nowrap;
  }

  .clear-btn {
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 16px;
    padding: 0 4px;
    line-height: 1;
    opacity: 0.6;
  }

  .clear-btn:hover {
    opacity: 1;
  }

  .filter-error {
    margin-top: 4px;
    font-size: 11px;
    color: var(--hf-errorForeground, #f44336);
  }
</style>
