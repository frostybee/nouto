<script lang="ts">
  import type { MatchContext } from '../../lib/palette/search';
  import PaletteIcon from './PaletteIcon.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  interface Props {
    context: MatchContext | null;
  }

  let { context }: Props = $props();

  const locationLabels: Record<MatchContext['location'], string> = {
    name: 'Name',
    url: 'URL',
    params: 'Query Params',
    headers: 'Headers',
    body: 'Request Body',
  };

  const locationIcons: Record<MatchContext['location'], string> = {
    name: 'edit',
    url: 'link',
    params: 'search',
    headers: 'files',
    body: 'file-code',
  };
</script>

{#if context}
  <div class="match-context">
    <span class="match-location">
      <span class="location-icon" aria-hidden="true">
        <PaletteIcon name={locationIcons[context.location]} size={12} />
      </span>
      <span class="location-label">
        Matched in: {locationLabels[context.location]}
      </span>
    </span>

    {#if context.snippet}
      <Tooltip text={context.snippet} position="top">
        <code class="match-snippet">
          {context.snippet}
        </code>
      </Tooltip>
    {/if}
  </div>
{/if}

<style>
  .match-context {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    margin-top: 0.25rem;
    font-size: 0.75rem;
  }

  .match-location {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--vscode-descriptionForeground);
  }

  .location-icon {
    display: flex;
    align-items: center;
    opacity: 0.8;
  }

  .location-label {
    font-weight: 500;
  }

  .match-snippet {
    display: inline-block;
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground);
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.85em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: calc(100% - 1.25rem);
    margin-left: 1.25rem;
  }

  .match-snippet:hover {
    background: var(--vscode-inputOption-hoverBackground);
  }
</style>
