<script lang="ts">
  import Tooltip from './Tooltip.svelte';

  interface Props {
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onFoldToDepth: (depth: number) => void;
  }
  let { onExpandAll, onCollapseAll, onFoldToDepth }: Props = $props();

  let open = $state(false);
  let dropdownRef = $state<HTMLDivElement>(undefined!);

  function handleAction(action: () => void) {
    action();
    open = false;
  }

  $effect(() => {
    if (open) {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
          open = false;
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  });
</script>

<div class="fold-controls">
  <!-- Expand split button -->
  <div class="split-btn-container" bind:this={dropdownRef}>
    <Tooltip text="Expand All">
      <button class="toolbar-btn split-btn-main" onclick={onExpandAll} aria-label="Expand All">
        <span class="codicon codicon-unfold"></span>
      </button>
    </Tooltip>
    <Tooltip text="Expand to level...">
      <button class="toolbar-btn split-btn-dropdown" onclick={() => { open = !open; }} aria-label="Expand to level">
        <span class="codicon codicon-chevron-down chevron" class:open></span>
      </button>
    </Tooltip>
    {#if open}
      <div class="dropdown-menu">
        {#each [1, 2, 3, 4, 5] as level}
          <button class="menu-item" onclick={() => handleAction(() => onFoldToDepth(level))}>Level {level}</button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Collapse button -->
  <Tooltip text="Collapse All">
    <button class="toolbar-btn" onclick={onCollapseAll} aria-label="Collapse All">
      <span class="codicon codicon-fold"></span>
    </button>
  </Tooltip>
</div>

<style>
  .fold-controls {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .split-btn-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .split-btn-main {
    border: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    padding-right: 4px;
    border-right: 1px solid var(--hf-input-border, var(--hf-panel-border));
  }

  .split-btn-dropdown {
    border: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    padding-left: 2px;
    padding-right: 4px;
  }

  .chevron {
    font-size: 10px;
    transition: transform 0.15s;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 140px;
    background: var(--hf-editorWidget-background, #252526);
    border: 1px solid var(--hf-editorWidget-border, #454545);
    border-radius: 4px;
    padding: 4px 0;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 5px 12px;
    background: transparent;
    color: var(--hf-foreground);
    border: none;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    transition: background 0.1s;
  }

  .menu-item:hover {
    background: var(--hf-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }
</style>
