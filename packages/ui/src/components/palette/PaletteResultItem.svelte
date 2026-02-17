<script lang="ts">
  import type { PaletteResult } from '../../stores/palette';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import MatchContext from './MatchContext.svelte';
  import { highlightMatches } from '../../lib/palette/highlight';

  interface Props {
    result: PaletteResult;
    selected: boolean;
    query: string;
    onclick?: () => void;
    onmouseenter?: () => void;
  }

  let { result, selected, query, onclick, onmouseenter }: Props = $props();

  // Format URL for display (truncate if too long)
  const displayUrl = $derived(() => {
    if (!result.request) return '';
    const url = result.request.url;
    return url.length > 60 ? url.slice(0, 57) + '...' : url;
  });
</script>

<button
  class="result-item"
  class:selected
  class:action={result.type === 'action'}
  class:request={result.type === 'request'}
  class:recent={result.type === 'recent'}
  role="option"
  aria-selected={selected}
  tabindex="0"
  {onclick}
  onmouseenter={onmouseenter}
>
  {#if result.type === 'action' && result.action}
    <!-- Action Result -->
    <div class="action-content">
      {#if result.action.icon}
        <span class="action-icon" aria-hidden="true">
          <i class="codicon codicon-{result.action.icon}"></i>
        </span>
      {/if}
      <div class="action-info">
        <span class="action-label">
          {@html highlightMatches(result.action.label, query)}
        </span>
        {#if result.action.description}
          <span class="action-description">
            {result.action.description}
          </span>
        {/if}
      </div>
      {#if result.action.keybinding}
        <kbd class="keybinding">{result.action.keybinding}</kbd>
      {/if}
    </div>
  {:else if result.request}
    <!-- Request Result -->
    <div class="request-content">
      <MethodBadge method={result.request.method} />
      <div class="request-info">
        <div class="request-header">
          <span class="request-name">
            {@html highlightMatches(result.request.name, query)}
          </span>
          <span class="collection-name">
            {result.request.collectionName}
          </span>
        </div>
        <span class="request-url">
          {@html highlightMatches(displayUrl(), query)}
        </span>
        {#if result.searchResult?.matchContext}
          <MatchContext context={result.searchResult.matchContext} />
        {/if}
      </div>
      {#if result.type === 'recent'}
        <span class="recent-badge" aria-label="Recently used">
          <i class="codicon codicon-clock"></i>
        </span>
      {/if}
    </div>
  {/if}
</button>

<style>
  .result-item {
    all: unset;
    display: block;
    width: 100%;
    padding: 0.75rem 1rem;
    cursor: pointer;
    border: none;
    background: transparent;
    transition: background 150ms ease-out;
    text-align: left;
  }

  .result-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .result-item.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .result-item:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  /* Action Results */
  .action-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .action-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    color: var(--vscode-symbolIcon-textForeground);
  }

  .action-icon i {
    font-size: 16px;
  }

  .action-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .action-label {
    font-size: 0.9rem;
    font-weight: 500;
  }

  .action-description {
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .keybinding {
    padding: 0.2rem 0.4rem;
    font-size: 0.7rem;
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-keybindingLabel-background);
    color: var(--vscode-keybindingLabel-foreground);
    border: 1px solid var(--vscode-keybindingLabel-border);
    border-radius: 3px;
    flex-shrink: 0;
  }

  /* Request Results */
  .request-content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .request-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .request-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .request-name {
    font-size: 0.9rem;
    font-weight: 500;
    flex-shrink: 1;
    min-width: 0;
  }

  .collection-name {
    font-size: 0.7rem;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .request-url {
    font-size: 0.8rem;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--vscode-charts-blue);
    opacity: 0.6;
  }

  .recent-badge i {
    font-size: 14px;
  }

  /* Highlight matches */
  .result-item :global(mark) {
    background: var(--vscode-editor-findMatchHighlightBackground);
    color: inherit;
    border-radius: 2px;
    padding: 0 2px;
  }

  .result-item.selected :global(mark) {
    background: var(--vscode-editor-findMatchBackground);
  }
</style>
