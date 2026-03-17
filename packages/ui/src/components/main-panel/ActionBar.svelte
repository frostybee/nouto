<script lang="ts">
  import CodegenButton from '../shared/CodegenButton.svelte';
  import CookieJarSelector from '../shared/CookieJarSelector.svelte';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import { resolvedShortcuts } from '../../stores/settings.svelte';
  import { bindingToDisplayString } from '../../lib/shortcuts';
  import { postMessage as vsCodePostMessage } from '../../lib/vscode';
  import { requestContext } from '../../stores/request.svelte';
  import { isFolder, type Collection, type CollectionItem } from '../../types';
  import type { OutgoingMessage } from '@nouto/transport/messages';

  interface Props {
    collectionId: string | null;
    collections: Collection[];
    postMessage?: (message: OutgoingMessage) => void;
  }

  let {
    collectionId,
    collections,
    postMessage
  }: Props = $props();

  const messageBus = $derived(postMessage || vsCodePostMessage);

  const shortcuts = $derived(resolvedShortcuts());

  const searchTooltip = $derived.by(() => {
    const binding = shortcuts.get('openCommandPalette');
    return binding ? `Search requests (${bindingToDisplayString(binding)})` : 'Search requests';
  });

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

  const collectionAppearance = $derived.by(() => {
    const ctx = requestContext();
    if (!ctx?.collectionId) return { icon: 'codicon-folder', color: undefined };
    const col = collections.find(c => c.id === ctx.collectionId);
    return { icon: col?.icon || 'codicon-folder', color: col?.color };
  });

  function handleBreadcrumbClick() {
    messageBus({ type: 'revealActiveRequest' } as any);
  }
</script>

<div class="action-bar">
  <div class="action-bar-left">
    {#if breadcrumb.length > 0}
      <nav class="breadcrumb" aria-label="Collection path">
        {#each breadcrumb as segment, i}
          {#if i > 0}<span class="breadcrumb-chevron codicon codicon-chevron-right"></span>{/if}
          <Tooltip text="Click to reveal in sidebar" position="bottom">
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
  </div>
  <div class="action-bar-right">
    <Tooltip text={searchTooltip}>
      <button
        class="action-bar-btn"
        onclick={() => messageBus({ type: 'openCommandPalette' } as any)}
        type="button"
        aria-label="Search requests"
      >
        <span class="codicon codicon-search"></span>
      </button>
    </Tooltip>
    <CodegenButton />
    <div class="labeled-control">
      <span class="control-label">Cookies</span>
      <CookieJarSelector />
    </div>
    <div class="labeled-control">
      <span class="control-label">Environment</span>
      <EnvironmentSelector />
    </div>
  </div>
</div>

<style>
  .action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 32px 4px 12px;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
    min-height: 32px;
    gap: 8px;
  }

  .action-bar-left,
  .action-bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .action-bar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-input-border);
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }

  .action-bar-btn:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }

  .action-bar-btn .codicon {
    font-size: 14px;
  }

  .labeled-control {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .control-label {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    user-select: none;
  }

  .breadcrumb-separator-first {
    width: 1px;
    height: 16px;
    background: var(--hf-panel-border);
    flex-shrink: 0;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }

  .breadcrumb-segment {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    cursor: pointer;
    border-radius: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
    transition: color 0.15s, background 0.15s;
  }

  .breadcrumb-segment:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  .breadcrumb-segment .codicon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .breadcrumb-chevron {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    opacity: 0.6;
    flex-shrink: 0;
  }
</style>
