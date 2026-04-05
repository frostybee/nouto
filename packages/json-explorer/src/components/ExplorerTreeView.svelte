<script lang="ts">
  import VirtualList from '@nouto/ui/components/shared/VirtualList.svelte';
  import ExplorerTreeRow from './ExplorerTreeRow.svelte';
  import type { FlatNode } from '../stores/jsonExplorer.svelte';
  import { flatNodes, selectNode, toggleNode, navigateToParent, selectedPath } from '../stores/jsonExplorer.svelte';
  import { getParentPath } from '../lib/path-utils';

  interface Props {
    wordWrap?: boolean;
    onContextMenu?: (e: MouseEvent, node: FlatNode) => void;
    onScroll?: (scrollRatio: number, viewportRatio: number) => void;
  }
  let { wordWrap = false, onContextMenu, onScroll }: Props = $props();

  let containerEl = $state<HTMLDivElement>(undefined!);

  function getVirtualContainer(): Element | null {
    return containerEl?.querySelector('.virtual-container') ?? null;
  }

  function handleScroll() {
    const vc = getVirtualContainer();
    if (!vc || !onScroll) return;
    const scrollHeight = vc.scrollHeight;
    if (scrollHeight <= 0) return;
    const ratio = vc.scrollTop / scrollHeight;
    const vpRatio = vc.clientHeight / scrollHeight;
    onScroll(ratio, vpRatio);
  }

  export function scrollToRatio(ratio: number) {
    const vc = getVirtualContainer();
    if (!vc) return;
    vc.scrollTop = ratio * vc.scrollHeight;
  }

  let boundVc: Element | null = null;
  $effect(() => {
    if (!containerEl) return;
    const vc = getVirtualContainer();
    if (vc && vc !== boundVc) {
      boundVc?.removeEventListener('scroll', handleScroll);
      vc.addEventListener('scroll', handleScroll, { passive: true });
      boundVc = vc;
      handleScroll();
    }
    return () => {
      boundVc?.removeEventListener('scroll', handleScroll);
      boundVc = null;
    };
  });

  function handleKeydown(e: KeyboardEvent) {
    const nodes = flatNodes();
    if (nodes.length === 0) return;

    const currentIndex = selectedPath()
      ? nodes.findIndex(n => n.path === selectedPath())
      : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        let nextIndex = currentIndex + 1;
        while (nextIndex < nodes.length - 1 && nodes[nextIndex].isShowMore) nextIndex++;
        if (!nodes[nextIndex].isShowMore) {
          selectNode(nodes[nextIndex].path);
          scrollToIndex(nextIndex);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        let prevIndex = currentIndex - 1;
        while (prevIndex > 0 && nodes[prevIndex].isShowMore) prevIndex--;
        if (!nodes[prevIndex].isShowMore) {
          selectNode(nodes[prevIndex].path);
          scrollToIndex(prevIndex);
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (currentIndex >= 0) {
          const node = nodes[currentIndex];
          if (node.isExpandable && !node.isExpanded) {
            toggleNode(node.path);
          } else if (node.isExpanded && currentIndex + 1 < nodes.length) {
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
