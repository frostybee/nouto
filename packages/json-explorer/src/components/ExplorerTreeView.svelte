<script lang="ts">
  import VirtualList from '@nouto/ui/components/shared/VirtualList.svelte';
  import ExplorerTreeRow from './ExplorerTreeRow.svelte';
  import type { FlatNode } from '../stores/jsonExplorer.svelte';
  import { flatNodes, selectNode, toggleNode, navigateToParent, selectedPath, navigationRequest, multiSelectAnchor, setMultiSelectRange, clearMultiSelect, selectAllVisible, setMultiSelectAnchor, multiSelectCount } from '../stores/jsonExplorer.svelte';
  import { getParentPath } from '../lib/path-utils';

  interface Props {
    wordWrap?: boolean;
    onContextMenu?: (e: MouseEvent, node: FlatNode) => void;
    onScroll?: (scrollRatio: number, viewportRatio: number, scrollTop: number) => void;
  }
  let { wordWrap = false, onContextMenu, onScroll }: Props = $props();

  let containerEl = $state<HTMLDivElement>(undefined!);
  let virtualListRef = $state<{ scrollToIndex: (index: number, align?: 'nearest' | 'center') => void }>(undefined!);

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
    onScroll(ratio, vpRatio, vc.scrollTop);
  }

  export function scrollToRatio(ratio: number) {
    const vc = getVirtualContainer();
    if (!vc) return;
    vc.scrollTop = ratio * vc.scrollHeight;
  }

  export function scrollToTop() {
    const vc = getVirtualContainer();
    vc?.scrollTo({ top: 0, behavior: 'smooth' });
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

  function handleShiftClick(targetPath: string) {
    const nodes = flatNodes();
    const anchor = multiSelectAnchor() ?? selectedPath();
    if (!anchor) {
      selectNode(targetPath);
      setMultiSelectAnchor(targetPath);
      return;
    }

    const anchorIdx = nodes.findIndex(n => n.path === anchor);
    const targetIdx = nodes.findIndex(n => n.path === targetPath);
    if (anchorIdx < 0 || targetIdx < 0) return;

    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const rangePaths = nodes
      .slice(start, end + 1)
      .filter(n => !n.isShowMore)
      .map(n => n.path);

    setMultiSelectRange(rangePaths);
  }

  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+A: select all visible nodes
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selectAllVisible();
      return;
    }

    // Escape: clear multi-select
    if (e.key === 'Escape' && multiSelectCount() > 0) {
      e.preventDefault();
      clearMultiSelect();
      return;
    }

    const nodes = flatNodes();
    if (nodes.length === 0) return;

    const currentIndex = selectedPath()
      ? nodes.findIndex(n => n.path === selectedPath())
      : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        clearMultiSelect();
        let nextIndex = currentIndex + 1;
        while (nextIndex < nodes.length - 1 && nodes[nextIndex].isShowMore) nextIndex++;
        if (!nodes[nextIndex].isShowMore) {
          selectNode(nodes[nextIndex].path);
          setMultiSelectAnchor(nodes[nextIndex].path);
          scrollToIndex(nextIndex);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        clearMultiSelect();
        let prevIndex = currentIndex - 1;
        while (prevIndex > 0 && nodes[prevIndex].isShowMore) prevIndex--;
        if (!nodes[prevIndex].isShowMore) {
          selectNode(nodes[prevIndex].path);
          setMultiSelectAnchor(nodes[prevIndex].path);
          scrollToIndex(prevIndex);
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        clearMultiSelect();
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
        clearMultiSelect();
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
        clearMultiSelect();
        if (nodes.length > 0) {
          selectNode(nodes[0].path);
          scrollToIndex(0);
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        clearMultiSelect();
        if (nodes.length > 0) {
          selectNode(nodes[nodes.length - 1].path);
          scrollToIndex(nodes.length - 1);
        }
        break;
      }
    }
  }

  // Center the tree on explicit navigation (pins, bookmarks, breadcrumbs, search).
  // Keyed on the request's seq so unrelated flatNodes changes (expand/collapse)
  // never re-center; an unresolved request retries when flatNodes updates
  // (e.g. right after a pagination bump makes the target path appear).
  let lastAppliedSeq = -1;
  $effect(() => {
    const req = navigationRequest();
    const nodes = flatNodes();
    if (!req || req.seq === lastAppliedSeq) return;
    const nodeIndex = nodes.findIndex(n => n.path === req.path);
    if (nodeIndex < 0) return;
    lastAppliedSeq = req.seq;
    centerOnPath(nodeIndex, req.path);
  });

  // Two-phase centering: coarse scroll via fixed-height index math, then a
  // one-frame correction against the rendered row so word-wrapped rows
  // (taller than the assumed item height) still land centered.
  function centerOnPath(index: number, path: string) {
    virtualListRef?.scrollToIndex(index, 'center');
    requestAnimationFrame(() => {
      containerEl
        ?.querySelector(`[data-path="${CSS.escape(path)}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
  }

  function scrollToIndex(index: number) {
    virtualListRef?.scrollToIndex(index, 'nearest');
  }
</script>

<div
  class="explorer-tree-view"
  bind:this={containerEl}
  onkeydown={handleKeydown}
  role="tree"
  tabindex={0}
>
  <VirtualList bind:this={virtualListRef} items={flatNodes()} itemHeight={22}>
    {#snippet children(item: FlatNode, _index: number)}
      <ExplorerTreeRow node={item} {wordWrap} {onContextMenu} onShiftClick={handleShiftClick} />
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
