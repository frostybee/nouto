<script lang="ts">
  import Tooltip from './Tooltip.svelte';
  import { postMessage as vsCodePostMessage } from '../../lib/vscode';
  import { requestContext } from '../../stores/request.svelte';
  import { isFolder, type Collection, type CollectionItem } from '../../types';
  import type { OutgoingMessage } from '@nouto/transport/messages';

  interface Props {
    collections: Collection[];
    postMessage?: (message: OutgoingMessage) => void;
    variant?: 'inline' | 'line';
  }

  let { collections, postMessage, variant = 'inline' }: Props = $props();

  const messageBus = $derived(postMessage || vsCodePostMessage);

  interface BreadcrumbSegment {
    id: string;
    name: string;
  }

  function findBreadcrumbPath(items: CollectionItem[], targetId: string, path: BreadcrumbSegment[] = []): BreadcrumbSegment[] | null {
    for (const item of items) {
      if (item.id === targetId) return path;
      if (isFolder(item)) {
        const found = findBreadcrumbPath(item.children, targetId, [...path, { id: item.id, name: item.name }]);
        if (found) return found;
      }
    }
    return null;
  }

  const breadcrumb = $derived.by((): BreadcrumbSegment[] => {
    const ctx = requestContext();
    if (!ctx?.collectionId || !ctx?.requestId) return [];

    const col = collections.find(c => c.id === ctx.collectionId);
    if (!col) return [];

    const folderPath = findBreadcrumbPath(col.items, ctx.requestId) || [];
    return [{ id: col.id, name: col.name }, ...folderPath];
  });

  const fullPath = $derived(breadcrumb.map(s => s.name).join(' › '));
  const tooltipText = $derived(`${fullPath} (click to reveal in sidebar)`);

  const collectionAppearance = $derived.by(() => {
    const ctx = requestContext();
    if (!ctx?.collectionId) return { icon: 'codicon-folder', color: undefined };
    const col = collections.find(c => c.id === ctx.collectionId);
    return { icon: col?.icon || 'codicon-folder', color: col?.color };
  });

  function handleBreadcrumbClick() {
    const ctx = requestContext();
    messageBus({ type: 'revealActiveRequest', data: { requestId: ctx?.requestId } } as any);
  }
</script>

{#if breadcrumb.length > 0}
  <nav class="breadcrumb" class:line={variant === 'line'} aria-label="Collection path">
    {#each breadcrumb as segment, i}
      {#if i > 0}<span class="breadcrumb-chevron codicon codicon-chevron-right"></span>{/if}
      <Tooltip text={tooltipText} position="bottom">
        <button
          class="breadcrumb-segment"
          onclick={handleBreadcrumbClick}
          type="button"
        >
          {#if i === 0}<span class="codicon {collectionAppearance.icon}" style={collectionAppearance.color ? `color: ${collectionAppearance.color}` : ''}></span>{/if}
          {segment.name}
        </button>
      </Tooltip>
    {/each}
  </nav>
{/if}

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.154rem;
    min-width: 0;
    overflow: hidden;
  }

  .breadcrumb.line {
    min-height: 1.846rem;
    padding: 0.154rem 0.923rem;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .breadcrumb-segment {
    display: flex;
    align-items: center;
    gap: 0.308rem;
    padding: 0.154rem 0.308rem;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    font-size: 0.846rem;
    cursor: pointer;
    border-radius: 0.231rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 11.538rem;
    transition: color 0.15s, background 0.15s;
  }

  .breadcrumb-segment:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  .breadcrumb-segment .codicon {
    font-size: 0.923rem;
    flex-shrink: 0;
  }

  .breadcrumb-chevron {
    font-size: 0.769rem;
    color: var(--hf-descriptionForeground);
    opacity: 0.6;
    flex-shrink: 0;
  }
</style>
