<script lang="ts">
  import {
    cookieJars,
    activeCookieJarId,
    activeCookieJar,
    switchCookieJar,
    requestCookieJars,
  } from '../../stores/cookieJar.svelte';
  import { postMessage } from '../../lib/vscode';
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    requestCookieJars();
    window.addEventListener('nouto:closeDropdowns', handleCloseDropdowns);
  });

  onDestroy(() => {
    window.removeEventListener('nouto:closeDropdowns', handleCloseDropdowns);
  });
  import Tooltip from './Tooltip.svelte';

  let showDropdown = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();
  let dropdownPos = $state({ top: 0, right: 0 });

  const jarList = $derived(cookieJars());
  const activeId = $derived(activeCookieJarId());
  const activeJar = $derived(activeCookieJar());

  function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown) {
      window.dispatchEvent(new CustomEvent('nouto:closeDropdowns', { detail: 'cookieJar' }));
      if (buttonEl) {
        const rect = buttonEl.getBoundingClientRect();
        dropdownPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
      }
    }
  }

  function handleCloseDropdowns(e: Event) {
    const source = (e as CustomEvent).detail;
    if (source !== 'cookieJar') {
      showDropdown = false;
    }
  }

  function selectJar(id: string | null) {
    switchCookieJar(id);
    showDropdown = false;
  }

  function openCookiePanel() {
    showDropdown = false;
    postMessage({ type: 'openEnvironmentsPanel', data: { tab: 'cookieJar' } });
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.jar-selector') && !target.closest('.jar-dropdown')) {
      showDropdown = false;
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
        <button
          class="jar-option"
          class:selected={activeId === jar.id}
          onclick={() => selectJar(jar.id)}
        >
          <span class="check-mark">{#if activeId === jar.id}<i class="codicon codicon-check"></i>{/if}</span>
          <span class="option-name">{jar.name}</span>
        </button>
      {/each}

      <div class="context-divider"></div>
      <button class="context-action" onclick={openCookiePanel}>
        <i class="codicon codicon-browser"></i>
        Manage Cookies
      </button>
    </div>
  {/if}
</div>

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

  .context-divider {
    height: 1px;
    background: var(--hf-panel-border);
    margin: 4px 0;
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

  .context-action:hover {
    background: var(--hf-list-hoverBackground);
  }

  .context-action .codicon {
    font-size: 14px;
    width: 16px;
    text-align: center;
  }
</style>
