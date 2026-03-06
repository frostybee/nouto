<script lang="ts">
  import { tick } from 'svelte';
  import type { Environment, EnvironmentVariable } from '../../stores/environment';

  interface Props {
    environment: Environment;
    isActive?: boolean;
    isGlobal?: boolean;
    postMessage: (message: any) => void;
    onOpenEditor?: (env: Environment, isGlobal: boolean) => void;
  }
  let { environment, isActive = false, isGlobal = false, postMessage, onOpenEditor }: Props = $props();

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let isRenaming = $state(false);
  let renameValue = $state('');
  let renameInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    const close = () => { showContextMenu = false; };
    window.addEventListener('close-context-menus', close);
    return () => window.removeEventListener('close-context-menus', close);
  });

  // Count enabled variables
  const enabledCount = $derived(environment.variables.filter((v) => v.enabled && v.key).length);
  const totalCount = $derived(environment.variables.length);

  function handleClick() {
    onOpenEditor?.(environment, isGlobal);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    showContextMenu = true;
    const menuWidth = 210;
    const menuHeight = 240;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
    contextMenuY = Math.min(e.clientY, window.innerHeight - menuHeight);
  }

  function closeContextMenu() {
    showContextMenu = false;
  }

  function handleSetActive() {
    closeContextMenu();
    postMessage({
      type: 'setActiveEnvironment',
      data: { id: isActive ? null : environment.id },
    });
  }

  function startRename() {
    closeContextMenu();
    renameValue = environment.name;
    isRenaming = true;
    tick().then(() => renameInput?.select());
  }

  function submitRename() {
    const name = renameValue.trim();
    if (name && name !== environment.name) {
      postMessage({
        type: 'renameEnvironment',
        data: { id: environment.id, name },
      });
    }
    isRenaming = false;
  }

  function cancelRename() {
    isRenaming = false;
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      submitRename();
    } else if (e.key === 'Escape') {
      cancelRename();
    }
  }

  function handleDuplicate() {
    closeContextMenu();
    postMessage({
      type: 'duplicateEnvironment',
      data: { id: environment.id },
    });
  }

  function handleExport() {
    closeContextMenu();
    postMessage({
      type: 'exportEnvironment',
      data: { id: environment.id },
    });
  }

  function handleDelete() {
    closeContextMenu();
    postMessage({
      type: 'deleteEnvironment',
      data: { id: environment.id },
    });
  }
</script>

<svelte:window onclick={closeContextMenu} onkeydown={(e) => e.key === 'Escape' && closeContextMenu()} />

<div
  class="environment-item"
  class:active={isActive}
  class:global={isGlobal}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <div class="item-content">
    {#if isRenaming}
      <input
        type="text"
        class="rename-input"
        bind:value={renameValue}
        bind:this={renameInput}
        onblur={submitRename}
        onkeydown={handleRenameKeydown}
        onclick={(e) => e.stopPropagation()}
      />
    {:else}
      <div class="item-left">
        {#if isActive && !isGlobal}
          <span class="active-check codicon codicon-check" title="Active environment"></span>
        {:else if isGlobal}
          <span class="global-icon codicon codicon-globe" title="Global Variables"></span>
        {:else}
          <span class="inactive-spacer"></span>
        {/if}
        <span class="env-name">{environment.name}</span>
      </div>
    {/if}

    <div class="item-right">
      {#if totalCount > 0}
        <span class="var-count" title="{enabledCount} of {totalCount} variables enabled">
          {enabledCount}/{totalCount}
        </span>
      {/if}
      {#if isActive && !isGlobal}
        <span class="active-badge">Active</span>
      {/if}
    </div>
  </div>
</div>

{#if showContextMenu && !isGlobal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    <button class="context-item" onclick={handleClick}>
      <span class="context-icon codicon codicon-edit"></span>
      Edit Variables
    </button>
    <button class="context-item" onclick={handleSetActive}>
      <span class="context-icon codicon" class:codicon-check={isActive} class:codicon-circle-outline={!isActive}></span>
      {isActive ? 'Deactivate' : 'Set Active'}
    </button>
    <div class="context-divider"></div>
    <button class="context-item" onclick={startRename}>
      <span class="context-icon codicon codicon-edit"></span>
      Rename
    </button>
    <button class="context-item" onclick={handleDuplicate}>
      <span class="context-icon codicon codicon-copy"></span>
      Duplicate
    </button>
    <button class="context-item" onclick={handleExport}>
      <span class="context-icon codicon codicon-export"></span>
      Export
    </button>
    <div class="context-divider"></div>
    <button class="context-item danger" onclick={handleDelete}>
      <span class="context-icon codicon codicon-trash"></span>
      Delete
    </button>
  </div>
{/if}

{#if showContextMenu && isGlobal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    <button class="context-item" onclick={handleClick}>
      <span class="context-icon codicon codicon-edit"></span>
      Edit Global Variables
    </button>
    <button class="context-item" onclick={handleExport}>
      <span class="context-icon codicon codicon-export"></span>
      Export
    </button>
  </div>
{/if}

<style>
  .environment-item {
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--hf-panel-border);
    transition: background 0.1s;
  }

  .environment-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .environment-item:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .environment-item.active {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .environment-item.global {
    background: var(--hf-sideBar-background);
    border-bottom: 2px solid var(--hf-panel-border);
  }

  .item-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .global-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .active-check {
    font-size: 12px;
    flex-shrink: 0;
    color: var(--hf-testing-iconPassed, #3fb950);
  }

  .inactive-spacer {
    width: 12px;
    flex-shrink: 0;
  }

  .env-name {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .var-count {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    font-family: var(--hf-editor-font-family), monospace;
  }

  .active-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .rename-input {
    flex: 1;
    padding: 4px 6px;
    font-size: 13px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-focusBorder);
    border-radius: 3px;
    outline: none;
  }

  /* Context Menu */
  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border, var(--hf-panel-border));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .context-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--hf-menu-foreground);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .context-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .context-item.danger {
    color: var(--hf-errorForeground);
  }

  .context-item.danger:hover {
    background: var(--hf-menu-selectionBackground);
  }

  .context-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
  }

  .context-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--hf-menu-separatorBackground, var(--hf-panel-border));
  }
</style>
