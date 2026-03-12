<script lang="ts">
  import type { PaletteResult } from '../../stores/palette.svelte';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import MatchContext from './MatchContext.svelte';
  import PaletteIcon from './PaletteIcon.svelte';
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
  const displayUrl = $derived.by(() => {
    if (!result.request) return '';
    const url = result.request.url;
    return url.length > 60 ? url.slice(0, 57) + '...' : url;
  });
</script>

<button
  class="result-item"
  class:selected
  class:recent={result.type === 'recent'}
  role="option"
  aria-selected={selected}
  tabindex="0"
  {onclick}
  onmouseenter={onmouseenter}
>
  {#if result.request}
    <div class="request-content">
      <MethodBadge method={result.request.method} connectionMode={result.request.connectionMode} />
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
          {@html highlightMatches(displayUrl, query)}
        </span>
        {#if result.searchResult?.matchContext}
          <MatchContext context={result.searchResult.matchContext} />
        {/if}
      </div>
      {#if result.type === 'recent'}
        <span class="recent-badge" aria-label="Recently used">
          <PaletteIcon name="clock" size={14} />
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
    background: var(--hf-list-hoverBackground);
  }

  .result-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .result-item:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
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
    font-weight: 600;
    flex-shrink: 1;
    min-width: 0;
  }

  .collection-name {
    font-size: 0.7rem;
    color: var(--hf-descriptionForeground);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .request-url {
    font-size: 0.8rem;
    color: var(--hf-descriptionForeground);
    font-family: var(--hf-editor-font-family);
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
    color: var(--hf-charts-blue);
    opacity: 0.6;
  }

  /* Highlight matches */
  .result-item :global(mark) {
    background: var(--hf-editor-findMatchHighlightBackground);
    color: inherit;
    border-radius: 2px;
    padding: 0 2px;
  }

  .result-item.selected :global(mark) {
    background: var(--hf-editor-findMatchBackground);
  }
</style>
