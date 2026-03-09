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
  } from '../../stores/cookieJar';
  import { onMount } from 'svelte';

  onMount(() => {
    requestCookieJars();
  });
  import { postMessage } from '../../lib/vscode';
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

  const jarList = $derived($cookieJars);
  const activeId = $derived($activeCookieJarId);
  const activeJar = $derived($activeCookieJar);

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

  function openEnvPanel() {
    showDropdown = false;
    postMessage({ type: 'openEnvironmentsPanel' });
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
      <div class="dropdown-header">Cookie Jars</div>

      {#each jarList as jar}
        <div class="jar-option-row">
          {#if renamingId === jar.id}
            <input
              bind:this={renameInputEl}
              class="rename-input"
              bind:value={renameValue}
              onblur={finishRename}
              onkeydown={handleRenameKeydown}
            />
          {:else}
            <button
              class="jar-option"
              class:selected={activeId === jar.id}
              onclick={() => selectJar(jar.id)}
            >
              <span class="option-name">{jar.name}</span>
              <span class="cookie-count">{jar.cookieCount}</span>
            </button>
            <Tooltip text="Rename">
              <button
                class="action-btn"
                aria-label="Rename"
                onclick={(e) => { e.stopPropagation(); startRename(jar.id, jar.name); }}
              >
                <i class="codicon codicon-edit"></i>
              </button>
            </Tooltip>
            <Tooltip text={jarList.length <= 1 ? 'Cannot delete the last cookie jar' : 'Delete cookie jar'}>
              <button
                class="action-btn delete-btn"
                aria-label="Delete cookie jar"
                disabled={jarList.length <= 1}
                onclick={(e) => { e.stopPropagation(); handleDeleteJar(jar.id); }}
              >
                <i class="codicon codicon-trash"></i>
              </button>
            </Tooltip>
          {/if}
        </div>
      {/each}

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
        <button class="new-jar-btn" onclick={handleCreateJar}>
          <i class="codicon codicon-add"></i>
          New Cookie Jar
        </button>
      {/if}

      <button class="manage-btn-link" onclick={openEnvPanel}>
        <i class="codicon codicon-settings-gear"></i>
        Manage Cookies
      </button>
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
    height: 100%;
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

  .dropdown-header {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .jar-option-row {
    display: flex;
    align-items: stretch;
  }

  .jar-option {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
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
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .option-name {
    flex: 1;
  }

  .cookie-count {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    background: rgba(128, 128, 128, 0.15);
    padding: 1px 6px;
    border-radius: 8px;
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

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--hf-descriptionForeground);
    transition: color 0.15s, background 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  .action-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .action-btn.delete-btn:hover {
    color: var(--hf-errorForeground, #f14c4c);
  }

  .new-jar-btn,
  .manage-btn-link {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--hf-panel-border);
    color: var(--hf-textLink-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .new-jar-btn:hover,
  .manage-btn-link:hover {
    background: var(--hf-list-hoverBackground);
  }

  .new-jar-input-row {
    padding: 6px 8px;
    border-top: 1px solid var(--hf-panel-border);
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
