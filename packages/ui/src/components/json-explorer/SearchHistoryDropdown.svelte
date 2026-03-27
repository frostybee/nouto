<script lang="ts">
  import { searchHistory, clearSearchHistory, setSearchQuery } from '../../stores/jsonExplorer.svelte';

  interface Props {
    onSelect?: (query: string) => void;
    onClose?: () => void;
  }
  let { onSelect, onClose }: Props = $props();

  function handleSelect(query: string) {
    setSearchQuery(query);
    onSelect?.(query);
    onClose?.();
  }
</script>

{#if searchHistory().length > 0}
  <div class="history-dropdown">
    <div class="history-header">
      <span class="history-title">Recent searches</span>
      <button class="clear-btn" onclick={() => { clearSearchHistory(); onClose?.(); }}>Clear</button>
    </div>
    {#each searchHistory() as query}
      <button class="history-item" onclick={() => handleSelect(query)}>
        <i class="codicon codicon-history"></i>
        <span class="history-text">{query}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .history-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-width: 300px;
    z-index: 100;
    background: var(--vscode-menu-background, #252526);
    border: 1px solid var(--vscode-menu-border, #454545);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    max-height: 200px;
    overflow-y: auto;
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    border-bottom: 1px solid var(--vscode-menu-separatorBackground, #454545);
  }

  .history-title {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8b8b8b);
    text-transform: uppercase;
    font-weight: 500;
  }

  .clear-btn {
    padding: 1px 6px;
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground, #3794ff);
    cursor: pointer;
    font-size: 10px;
  }

  .clear-btn:hover {
    text-decoration: underline;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 12px;
    background: none;
    color: var(--vscode-menu-foreground, #ccc);
    border: none;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
  }

  .history-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #fff);
  }

  .history-item .codicon {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #8b8b8b);
    flex-shrink: 0;
  }

  .history-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
