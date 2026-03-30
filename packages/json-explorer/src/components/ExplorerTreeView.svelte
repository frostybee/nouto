<script lang="ts">
  import VirtualList from '@nouto/ui/components/shared/VirtualList.svelte';
  import ExplorerTreeRow from './ExplorerTreeRow.svelte';
  import type { FlatNode } from '../stores/jsonExplorer.svelte';
  import { flatNodes, selectNode, toggleNode, navigateToParent, selectedPath } from '../stores/jsonExplorer.svelte';
  import { getParentPath } from '../lib/path-utils';

  interface Props {
    wordWrap?: boolean;
    onContextMenu?: (e: MouseEvent, node: FlatNode) => void;
  }
  let { wordWrap = false, onContextMenu }: Props = $props();

  let containerEl = $state<HTMLDivElement>(undefined!);

  function handleKeydown(e: KeyboardEvent) {
    const nodes = flatNodes();
    if (nodes.length === 0) return;

    const currentIndex = selectedPath()
      ? nodes.findIndex(n => n.path === selectedPath())
      : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, nodes.length - 1);
        selectNode(nodes[nextIndex].path);
        scrollToIndex(nextIndex);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        selectNode(nodes[prevIndex].path);
        scrollToIndex(prevIndex);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (currentIndex >= 0) {
          const node = nodes[currentIndex];
          if (node.isExpandable && !node.isExpanded) {
            toggleNode(node.path);
          } else if (node.isExpanded && currentIndex + 1 < nodes.length) {
            // Move to first child
            selectNode(nodes[currentIndex + 1].path);
            scrollToIndex(currentIndex + 1);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (currentIndex >= 0) {
          const node = nodes[currentIndex];
          if (node.isExpandable && node.isExpanded) {
            toggleNode(node.path);
          } else {
            const parentPath = getParentPath(node.path);
            navigateToParent();
            const parentIndex = nodes.findIndex(n => n.path === parentPath);
            if (parentIndex >= 0) scrollToIndex(parentIndex);
          }
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        if (nodes.length > 0) {
          selectNode(nodes[0].path);
          scrollToIndex(0);
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        if (nodes.length > 0) {
          selectNode(nodes[nodes.length - 1].path);
          scrollToIndex(nodes.length - 1);
        }
        break;
      }
    }
  }

  // Auto-scroll to the selected node whenever it changes
  // (covers search navigation, query navigation, breadcrumb clicks, etc.)
  $effect(() => {
    const path = selectedPath();
    if (!path) return;
    const nodes = flatNodes();
    const nodeIndex = nodes.findIndex(n => n.path === path);
    if (nodeIndex >= 0) {
      scrollToIndex(nodeIndex);
    }
  });

  function scrollToIndex(index: number) {
    if (!containerEl) return;
    const virtualContainer = containerEl.querySelector('.virtual-container');
    if (!virtualContainer) return;
    const itemHeight = 22;
    const scrollTop = virtualContainer.scrollTop;
    const containerHeight = virtualContainer.clientHeight;
    const itemTop = index * itemHeight;
    const itemBottom = itemTop + itemHeight;

    if (itemTop < scrollTop) {
      virtualContainer.scrollTop = itemTop;
    } else if (itemBottom > scrollTop + containerHeight) {
      virtualContainer.scrollTop = itemBottom - containerHeight;
    }
  }
</script>

<div
  class="explorer-tree-view"
  bind:this={containerEl}
  onkeydown={handleKeydown}
  role="tree"
  tabindex={0}
>
  <VirtualList items={flatNodes()} itemHeight={22}>
    {#snippet children(item: FlatNode, _index: number)}
      <ExplorerTreeRow node={item} {wordWrap} {onContextMenu} />
    {/snippet}
  </VirtualList>
</div>

<style>
  .explorer-tree-view {
    flex: 1;
    overflow: hidden;
    outline: none;
  }

  .explorer-tree-view:focus-visible {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }
</style>
