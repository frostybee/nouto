<script lang="ts">
  import { onMount } from 'svelte';
  import type { FlatNode } from '../stores/jsonExplorer.svelte';
  import { toggleNode, expandToDepth, isBookmarked, toggleBookmark } from '../stores/jsonExplorer.svelte';
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';

  interface Props {
    node: FlatNode;
    x: number;
    y: number;
    onClose: () => void;
    onCreateAssertion?: (node: FlatNode) => void;
    onSaveToEnv?: (node: FlatNode) => void;
  }
  let { node, x, y, onClose, onCreateAssertion, onSaveToEnv }: Props = $props();

  let menuEl = $state<HTMLDivElement>(undefined!);

  // Adjust position to stay within viewport
  let adjustedX = $state(0);
  let adjustedY = $state(0);

  // Initialize from props
  $effect(() => { adjustedX = x; });
  $effect(() => { adjustedY = y; });

  onMount(() => {
    if (menuEl) {
      const rect = menuEl.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      if (x + rect.width > viewportW) {
        adjustedX = viewportW - rect.width - 4;
      }
      if (y + rect.height > viewportH) {
        adjustedY = viewportH - rect.height - 4;
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  });

  async function handleCopyValue() {
    const text = node.isExpandable
      ? JSON.stringify(node.value, null, 2)
      : JSON.stringify(node.value);
    await copyToClipboard(text);
    onClose();
  }

  async function handleCopyPath() {
    await copyToClipboard(node.path);
    onClose();
  }

  async function handleCopyKey() {
    if (node.key !== null) {
      await copyToClipboard(String(node.key));
    }
    onClose();
  }

  function handleExpandSubtree() {
    if (node.isExpandable && !node.isExpanded) {
      toggleNode(node.path);
    }
    // Expanding the full subtree would need a specialized function;
    // for now, expand this node. Full subtree expand is Phase 2.
    onClose();
  }

  function handleCollapseSubtree() {
    if (node.isExpandable && node.isExpanded) {
      toggleNode(node.path);
    }
    onClose();
  }

  function handleExpandToDepth(depth: number) {
    expandToDepth(depth);
    onClose();
  }
</script>

<div
  class="context-menu"
  bind:this={menuEl}
  style="left: {adjustedX}px; top: {adjustedY}px;"
  role="menu"
>
  <button class="menu-item" onclick={handleCopyValue} role="menuitem">
    <i class="codicon codicon-copy"></i>
    <span>Copy Value</span>
  </button>
  <button class="menu-item" onclick={handleCopyPath} role="menuitem">
    <i class="codicon codicon-symbol-key"></i>
    <span>Copy Path</span>
  </button>
  {#if node.key !== null}
    <button class="menu-item" onclick={handleCopyKey} role="menuitem">
      <i class="codicon codicon-symbol-field"></i>
      <span>Copy Key</span>
    </button>
  {/if}
  <button class="menu-item" onclick={() => { toggleBookmark(node.path); onClose(); }} role="menuitem">
    <i class="codicon {isBookmarked(node.path) ? 'codicon-bookmark' : 'codicon-star-empty'}"></i>
    <span>{isBookmarked(node.path) ? 'Remove Bookmark' : 'Bookmark'}</span>
  </button>

  {#if node.isExpandable}
    <div class="menu-separator"></div>
    {#if !node.isExpanded}
      <button class="menu-item" onclick={handleExpandSubtree} role="menuitem">
        <i class="codicon codicon-unfold"></i>
        <span>Expand</span>
      </button>
    {:else}
      <button class="menu-item" onclick={handleCollapseSubtree} role="menuitem">
        <i class="codicon codicon-fold"></i>
        <span>Collapse</span>
      </button>
    {/if}
  {/if}

  <div class="menu-separator"></div>
  {#each [1, 2, 3] as depth}
    <button class="menu-item" onclick={() => handleExpandToDepth(depth)} role="menuitem">
      <span class="indent-spacer"></span>
      <span>Expand to Level {depth}</span>
    </button>
  {/each}

  {#if onCreateAssertion || onSaveToEnv}
    <div class="menu-separator"></div>
    {#if onCreateAssertion}
      <button class="menu-item" onclick={() => { onCreateAssertion!(node); onClose(); }} role="menuitem">
        <i class="codicon codicon-checklist"></i>
        <span>Create Assertion</span>
      </button>
    {/if}
    {#if onSaveToEnv && !node.isExpandable}
      <button class="menu-item" onclick={() => { onSaveToEnv!(node); onClose(); }} role="menuitem">
        <i class="codicon codicon-variable"></i>
        <span>Save as Variable</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 12px;
    background: none;
    color: var(--hf-menu-foreground);
    border: none;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }

  .menu-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .menu-item .codicon {
    font-size: 14px;
    width: 14px;
    text-align: center;
  }

  .indent-spacer {
    display: inline-block;
    width: 14px;
  }

  .menu-separator {
    height: 1px;
    background: var(--hf-menu-separatorBackground);
    margin: 4px 0;
  }
</style>
