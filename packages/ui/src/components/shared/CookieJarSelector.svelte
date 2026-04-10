<script lang="ts">
  import {
    cookieJars,
    activeCookieJarId,
    activeCookieJar,
    switchCookieJar,
    createCookieJar,
    renameCookieJar,
    deleteCookieJar,
    requestCookieJars,
  } from '../../stores/cookieJar.svelte';
  import { postMessage } from '../../lib/vscode';
  import { onMount } from 'svelte';

  onMount(() => {
    requestCookieJars();
  });
  import Tooltip from './Tooltip.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let showDropdown = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();
  let dropdownPos = $state({ top: 0, right: 0 });
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let renameInputEl: HTMLInputElement | undefined = $state();
  let showNewJarInput = $state(false);
  let newJarName = $state('');
  let newJarInputEl: HTMLInputElement | undefined = $state();
  let confirmDeleteId = $state<string | null>(null);

  const jarList = $derived(cookieJars());
  const activeId = $derived(activeCookieJarId());
  const activeJar = $derived(activeCookieJar());

  function toggleDropdown() {
    showDropdown = !showDropdown;
    renamingId = null;
    if (showDropdown && buttonEl) {
      const rect = buttonEl.getBoundingClientRect();
      dropdownPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
    }
  }

  function selectJar(id: string | null) {
    switchCookieJar(id);
    showDropdown = false;
  }

  function handleCreateJar() {
    showNewJarInput = true;
    newJarName = '';
    requestAnimationFrame(() => newJarInputEl?.focus());
  }

  function submitNewJar() {
    if (newJarName.trim()) {
      createCookieJar(newJarName.trim());
    }
    showNewJarInput = false;
    newJarName = '';
  }

  function handleNewJarKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitNewJar();
    if (e.key === 'Escape') { showNewJarInput = false; newJarName = ''; }
  }

  function startRename(id: string, currentName: string) {
    renamingId = id;
    renameValue = currentName;
    requestAnimationFrame(() => renameInputEl?.focus());
  }

  function finishRename() {
    if (renamingId && renameValue.trim()) {
      renameCookieJar(renamingId, renameValue.trim());
    }
    renamingId = null;
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') finishRename();
    if (e.key === 'Escape') { renamingId = null; }
  }

  function handleDeleteJar(id: string) {
    if (jarList.length <= 1) return;
    confirmDeleteId = id;
  }

  function confirmDeleteJar() {
    if (confirmDeleteId) {
      deleteCookieJar(confirmDeleteId);
    }
    confirmDeleteId = null;
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.jar-selector') && !target.closest('.jar-dropdown')) {
      showDropdown = false;
      renamingId = null;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="jar-selector">
  <Tooltip text="Select cookie jar">
    <button
      bind:this={buttonEl}
      class="jar-button"
      onclick={(e) => { e.stopPropagation(); toggleDropdown(); }}
    >
      <i class="codicon codicon-globe"></i>
      {#if activeJar}
        <span class="jar-name">{activeJar.name}</span>
      {:else}
        <span class="jar-name muted">No Jar</span>
      {/if}
      <svg class="dropdown-arrow" class:open={showDropdown} width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10.5L2.5 5h11L8 10.5z"/></svg>
    </button>
  </Tooltip>

  {#if showDropdown}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      use:portal
      class="jar-dropdown"
      role="listbox"
      tabindex="-1"
      style="top: {dropdownPos.top}px; right: {dropdownPos.right}px;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      {#each jarList as jar}
        {#if renamingId === jar.id}
          <div class="jar-option-row">
            <input
              bind:this={renameInputEl}
              class="rename-input"
              bind:value={renameValue}
              onblur={finishRename}
              onkeydown={handleRenameKeydown}
            />
          </div>
        {:else}
          <button
            class="jar-option"
            class:selected={activeId === jar.id}
            onclick={() => selectJar(jar.id)}
          >
            <span class="check-mark">{#if activeId === jar.id}<i class="codicon codicon-check"></i>{/if}</span>
            <span class="option-name">{jar.name}</span>
          </button>
        {/if}
      {/each}

      {#if activeJar}
        <div class="context-divider"></div>
        <div class="context-label">{activeJar.name}</div>
        <button class="context-action" onclick={() => { showDropdown = false; postMessage({ type: 'openEnvironmentsPanel', data: { tab: 'cookieJar' } }); }}>
          <i class="codicon codicon-browser"></i>
          Manage Cookies
        </button>
        <button class="context-action" onclick={(e) => { e.stopPropagation(); startRename(activeJar.id, activeJar.name); }}>
          <i class="codicon codicon-edit"></i>
          Rename
        </button>
        <button
          class="context-action danger"
          disabled={jarList.length <= 1}
          onclick={(e) => { e.stopPropagation(); handleDeleteJar(activeJar.id); }}
        >
          <i class="codicon codicon-trash"></i>
          Delete
        </button>
      {/if}

      <div class="context-divider"></div>
      {#if showNewJarInput}
        <div class="new-jar-input-row">
          <input
            bind:this={newJarInputEl}
            class="new-jar-input"
            bind:value={newJarName}
            placeholder="Jar name..."
            onblur={submitNewJar}
            onkeydown={handleNewJarKeydown}
          />
        </div>
      {:else}
        <button class="context-action" onclick={handleCreateJar}>
          <i class="codicon codicon-add"></i>
          New Cookie Jar
        </button>
      {/if}

    </div>
  {/if}
</div>

<ConfirmDialog
  open={confirmDeleteId !== null}
  title="Delete Cookie Jar"
  message="Delete this cookie jar? All cookies in it will be lost."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmDeleteJar}
  oncancel={() => { confirmDeleteId = null; }}
/>

<style>
  .jar-selector {
    position: relative;
    align-self: stretch;
    display: flex;
  }

  .jar-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 28px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: border-color 0.15s;
  }

  .jar-button:hover {
    border-color: var(--hf-focusBorder);
  }

  .jar-button .codicon {
    font-size: 13px;
    color: var(--hf-descriptionForeground);
  }

  .jar-name {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jar-name.muted {
    color: var(--hf-descriptionForeground);
  }

  .dropdown-arrow {
    color: var(--hf-descriptionForeground);
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .dropdown-arrow.open {
    transform: rotate(180deg);
  }

  .jar-dropdown {
    position: fixed;
    min-width: 220px;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    overflow: hidden;
  }

  .jar-option-row {
    display: flex;
    align-items: stretch;
  }

  .jar-option {
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
  }

  .jar-option:hover {
    background: var(--hf-list-hoverBackground);
  }

  .jar-option.selected {
    font-weight: 500;
  }

  .check-mark {
    width: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .check-mark .codicon {
    font-size: 14px;
  }

  .option-name {
    flex: 1;
  }

  .rename-input {
    flex: 1;
    padding: 6px 12px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-focusBorder);
    font-size: 12px;
    outline: none;
  }

  .context-divider {
    height: 1px;
    background: var(--hf-panel-border);
    margin: 4px 0;
  }

  .context-label {
    padding: 4px 12px 2px;
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    user-select: none;
  }

  .context-action {
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
    transition: background 0.15s;
  }

  .context-action:hover:not(:disabled) {
    background: var(--hf-list-hoverBackground);
  }

  .context-action:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .context-action.danger {
    color: var(--hf-errorForeground, #f14c4c);
  }

  .context-action .codicon {
    font-size: 14px;
    width: 16px;
    text-align: center;
  }

  .new-jar-input-row {
    padding: 6px 8px;
  }

  .new-jar-input {
    width: 100%;
    padding: 5px 8px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-focusBorder);
    border-radius: 3px;
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }
</style>
