<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    workspace,
    currentWorkspaceName,
  } from '@nouto/ui/stores/workspace.svelte';

  interface Props {
    onOpenFolder: () => void;
    onNewProject: () => void;
    onOpenRecent: (path: string) => void;
    onRemoveRecent: (path: string) => void;
    onCloseProject: () => void;
    onOpenSettings: () => void;
    onClearHistory: () => void;
  }

  let {
    onOpenFolder,
    onNewProject,
    onOpenRecent,
    onRemoveRecent,
    onCloseProject,
    onOpenSettings,
    onClearHistory,
  }: Props = $props();

  const ws = $derived(workspace());
  const name = $derived(currentWorkspaceName());
  const hasWorkspace = $derived(ws.currentPath !== null);

  let showDropdown = $state(false);
  let showNewSubmenu = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();
  let dropdownPos = $state({ top: 0, left: 0 });

  onMount(() => {
    window.addEventListener('nouto:closeDropdowns', handleCloseDropdowns);
  });

  onDestroy(() => {
    window.removeEventListener('nouto:closeDropdowns', handleCloseDropdowns);
  });

  function toggleDropdown() {
    showDropdown = !showDropdown;
    showNewSubmenu = false;
    if (showDropdown) {
      window.dispatchEvent(new CustomEvent('nouto:closeDropdowns', { detail: 'workspace' }));
      if (buttonEl) {
        const rect = buttonEl.getBoundingClientRect();
        dropdownPos = { top: rect.bottom + 4, left: rect.left };
      }
    }
  }

  function handleCloseDropdowns(e: Event) {
    const source = (e as CustomEvent).detail;
    if (source !== 'workspace') {
      showDropdown = false;
      showNewSubmenu = false;
    }
  }

  function close() {
    showDropdown = false;
    showNewSubmenu = false;
  }

  function pickRecent(path: string) {
    close();
    onOpenRecent(path);
  }

  function removeRecent(e: MouseEvent, path: string) {
    e.stopPropagation();
    onRemoveRecent(path);
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.ws-menu') && !target.closest('.ws-dropdown')) {
      close();
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="ws-menu">
  <button
    bind:this={buttonEl}
    class="ws-button"
    onclick={(e) => { e.stopPropagation(); toggleDropdown(); }}
    title="Workspace"
  >
    <i class="codicon codicon-folder"></i>
    <span class="ws-name">{name ?? 'No workspace'}</span>
    <svg class="arrow" class:open={showDropdown} width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10.5L2.5 5h11L8 10.5z"/></svg>
  </button>

  {#if showDropdown}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      use:portal
      class="ws-dropdown"
      style="top: {dropdownPos.top}px; left: {dropdownPos.left}px;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <div class="section-label">Workspaces</div>
      {#if ws.recents.length === 0}
        <div class="empty">No recent workspaces</div>
      {:else}
        {#each ws.recents as r (r.path)}
          {@const isCurrent = r.path === ws.currentPath}
          <button
            class="ws-option"
            class:selected={isCurrent}
            onclick={() => pickRecent(r.path)}
            title={r.path}
          >
            <span class="check-mark">{#if isCurrent}<i class="codicon codicon-check"></i>{/if}</span>
            <span class="option-name">{r.name}</span>
            {#if !isCurrent}
              <button
                class="remove-btn"
                title="Remove from list"
                onclick={(e) => removeRecent(e, r.path)}
              >
                <i class="codicon codicon-close"></i>
              </button>
            {/if}
          </button>
        {/each}
      {/if}

      <div class="divider"></div>

      <div
        class="ws-action submenu-trigger"
        onmouseenter={() => (showNewSubmenu = true)}
        onmouseleave={() => (showNewSubmenu = false)}
        role="menuitem"
        tabindex="-1"
      >
        <i class="codicon codicon-add"></i>
        <span class="option-name">New Workspace</span>
        <i class="codicon codicon-chevron-right submenu-arrow"></i>

        {#if showNewSubmenu}
          <div class="ws-submenu">
            <button class="ws-action" onclick={() => { close(); onNewProject(); }}>
              <i class="codicon codicon-new-folder"></i>
              <span class="option-name">Create Empty</span>
            </button>
            <button class="ws-action" onclick={() => { close(); onOpenFolder(); }}>
              <i class="codicon codicon-folder-opened"></i>
              <span class="option-name">Open Folder</span>
            </button>
          </div>
        {/if}
      </div>

      <div class="divider"></div>

      <button
        class="ws-action"
        disabled={!hasWorkspace}
        onclick={() => { close(); onOpenSettings(); }}
      >
        <i class="codicon codicon-settings-gear"></i>
        <span class="option-name">Workspace Settings…</span>
      </button>

      <button
        class="ws-action"
        disabled={!hasWorkspace}
        onclick={() => { close(); onCloseProject(); }}
      >
        <i class="codicon codicon-close"></i>
        <span class="option-name">Close Workspace</span>
      </button>

      <div class="divider"></div>

      <button class="ws-action danger" onclick={() => { close(); onClearHistory(); }}>
        <i class="codicon codicon-trash"></i>
        <span class="option-name">Clear Send History</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .ws-menu {
    position: relative;
    display: flex;
    align-self: stretch;
  }

  .ws-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 26px;
    background: transparent;
    color: inherit;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }

  .ws-button:hover {
    background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.18));
  }

  .ws-button .codicon {
    font-size: 14px;
  }

  .ws-name {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arrow {
    color: var(--hf-descriptionForeground);
    transition: transform 0.15s;
    flex-shrink: 0;
  }
  .arrow.open { transform: rotate(180deg); }

  .ws-dropdown {
    position: fixed;
    min-width: 260px;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    padding: 4px 0;
  }

  .section-label {
    padding: 4px 12px;
    font-size: 10px;
    text-transform: uppercase;
    color: var(--hf-descriptionForeground);
    letter-spacing: 0.5px;
  }

  .empty {
    padding: 6px 12px;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    font-style: italic;
  }

  .ws-option,
  .ws-action {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    position: relative;
  }

  .ws-option:hover,
  .ws-action:hover:not(:disabled) {
    background: var(--hf-list-hoverBackground);
  }

  .ws-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ws-option.selected { font-weight: 500; }

  .ws-action.danger { color: var(--hf-errorForeground, #f48771); }

  .check-mark {
    width: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .check-mark .codicon { font-size: 14px; }

  .option-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ws-action .codicon { font-size: 14px; width: 16px; text-align: center; }

  .remove-btn {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    border-radius: 3px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .ws-option:hover .remove-btn { opacity: 1; }
  .remove-btn:hover { background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.25)); }
  .remove-btn .codicon { font-size: 12px; }

  .divider {
    height: 1px;
    background: var(--hf-panel-border);
    margin: 4px 0;
  }

  .submenu-trigger {
    cursor: default;
  }
  .submenu-arrow {
    margin-left: auto;
    font-size: 12px !important;
    width: auto !important;
  }

  .ws-submenu {
    position: absolute;
    top: 0;
    left: 100%;
    min-width: 200px;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }
</style>
