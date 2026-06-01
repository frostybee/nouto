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
  }

  let {
    onOpenFolder,
    onNewProject,
    onOpenRecent,
    onRemoveRecent,
    onCloseProject,
    onOpenSettings,
  }: Props = $props();

  const ws = $derived(workspace());
  const name = $derived(currentWorkspaceName());
  const hasWorkspace = $derived(ws.currentPath !== null);

  let showDropdown = $state(false);
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
    }
  }

  function close() {
    showDropdown = false;
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
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="remove-btn"
                role="button"
                tabindex="-1"
                title="Remove from list"
                onclick={(e) => removeRecent(e, r.path)}
                onkeydown={(e) => { if (e.key === 'Enter') removeRecent(e, r.path); }}
              >
                <i class="codicon codicon-close"></i>
              </span>
            {/if}
          </button>
        {/each}
      {/if}

      <div class="divider"></div>

      <button class="ws-action" onclick={() => { close(); onNewProject(); }}>
        <i class="codicon codicon-add"></i>
        <span class="option-name">New Workspace</span>
      </button>

      <button class="ws-action" onclick={() => { close(); onOpenFolder(); }}>
        <i class="codicon codicon-folder-opened"></i>
        <span class="option-name">Open Folder…</span>
      </button>

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
    gap: 0.462rem;
    padding: 0 0.615rem;
    height: 2rem;
    background: transparent;
    color: inherit;
    border: none;
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    font-weight: 500;
  }

  .ws-button:hover {
    background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.18));
  }

  .ws-button .codicon {
    font-size: 1.077rem;
  }

  .ws-name {
    max-width: 13.846rem;
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
    min-width: 20rem;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 0.462rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    padding: 0.308rem 0;
  }

  .section-label {
    padding: 0.308rem 0.923rem;
    font-size: 0.769rem;
    text-transform: uppercase;
    color: var(--hf-descriptionForeground);
    letter-spacing: 0.5px;
  }

  .empty {
    padding: 0.462rem 0.923rem;
    color: var(--hf-descriptionForeground);
    font-size: 0.846rem;
    font-style: italic;
  }

  .ws-option,
  .ws-action {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.615rem;
    padding: 0.462rem 0.923rem;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 0.923rem;
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

  .check-mark {
    width: 1.231rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .check-mark .codicon { font-size: 1.077rem; }

  .option-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ws-action .codicon { font-size: 1.077rem; width: 16px; text-align: center; }

  .remove-btn {
    width: 1.385rem;
    height: 1.385rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    border-radius: 0.231rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .ws-option:hover .remove-btn { opacity: 1; }
  .remove-btn:hover { background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.25)); }
  .remove-btn .codicon { font-size: 0.923rem; }

  .divider {
    height: 0.077rem;
    background: var(--hf-panel-border);
    margin: 0.308rem 0;
  }

</style>
