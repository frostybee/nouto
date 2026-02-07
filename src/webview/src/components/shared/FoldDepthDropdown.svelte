<script lang="ts">
  interface Props {
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onFoldToDepth: (depth: number) => void;
  }
  let { onExpandAll, onCollapseAll, onFoldToDepth }: Props = $props();

  let open = $state(false);
  let dropdownRef: HTMLDivElement;

  function toggle() {
    open = !open;
  }

  function handleAction(action: () => void) {
    action();
    open = false;
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      open = false;
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  });
</script>

<div class="fold-dropdown" bind:this={dropdownRef}>
  <button class="toolbar-btn" onclick={toggle} title="Fold controls">
    <span class="icon">{'\u{2194}\u{FE0F}'}</span> Fold <span class="chevron" class:open>{'\u25BE'}</span>
  </button>
  {#if open}
    <div class="dropdown-menu">
      <button class="menu-item" onclick={() => handleAction(onExpandAll)}>Expand All</button>
      <button class="menu-item" onclick={() => handleAction(onCollapseAll)}>Collapse All</button>
      <div class="separator"></div>
      {#each [1, 2, 3, 4, 5] as level}
        <button class="menu-item" onclick={() => handleAction(() => onFoldToDepth(level))}>Level {level}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .fold-dropdown {
    position: relative;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .icon {
    font-size: 12px;
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
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, #454545);
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
    color: var(--vscode-foreground);
    border: none;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    transition: background 0.1s;
  }

  .menu-item:hover {
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }

  .separator {
    height: 1px;
    background: var(--vscode-editorWidget-border, #454545);
    margin: 4px 0;
  }
</style>
