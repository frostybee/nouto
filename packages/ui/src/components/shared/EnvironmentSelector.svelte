<script lang="ts">
  import {
    environments,
    activeEnvironmentId,
    activeEnvironment,
    setActiveEnvironment,
  } from '../../stores/environment.svelte';
  import { postMessage } from '../../lib/vscode';
  import { onMount, onDestroy } from 'svelte';
  import Tooltip from './Tooltip.svelte';

  let showDropdown = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();
  let dropdownPos = $state({ top: 0, right: 0 });

  const envList = $derived(environments());
  const activeId = $derived(activeEnvironmentId());
  const activeEnv = $derived(activeEnvironment());

  onMount(() => {
    window.addEventListener('nouto:closeDropdowns', handleCloseDropdowns);
  });

  onDestroy(() => {
    window.removeEventListener('nouto:closeDropdowns', handleCloseDropdowns);
  });

  function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown) {
      window.dispatchEvent(new CustomEvent('nouto:closeDropdowns', { detail: 'environment' }));
      if (buttonEl) {
        const rect = buttonEl.getBoundingClientRect();
        dropdownPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
      }
    }
  }

  function handleCloseDropdowns(e: Event) {
    const source = (e as CustomEvent).detail;
    if (source !== 'environment') {
      showDropdown = false;
    }
  }

  function selectEnvironment(id: string | null) {
    setActiveEnvironment(id);
    showDropdown = false;
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
    if (!target.closest('.env-selector') && !target.closest('.env-dropdown')) {
      showDropdown = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="env-selector">
  <Tooltip text="Select environment">
    <button
      bind:this={buttonEl}
      class="env-button"
      class:active={activeEnv !== null}
      style={activeEnv?.color ? `--env-color: ${activeEnv.color};` : ''}
      onclick={(e) => { e.stopPropagation(); toggleDropdown(); }}
    >
      {#if activeEnv?.color}
        <span class="env-color-dot" style="background: {activeEnv.color};"></span>
      {:else}
        <span class="env-icon">ENV</span>
      {/if}
      {#if activeEnv}
        <span class="env-name">{activeEnv.name}</span>
      {:else}
        <span class="env-name muted">No Environment</span>
      {/if}
      <svg class="dropdown-arrow" class:open={showDropdown} width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10.5L2.5 5h11L8 10.5z"/></svg>
    </button>
  </Tooltip>

  {#if showDropdown}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      use:portal
      class="env-dropdown"
      role="listbox"
      tabindex="-1"
      style="top: {dropdownPos.top}px; right: {dropdownPos.right}px;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <button
        class="env-option"
        class:selected={activeId === null}
        onclick={() => selectEnvironment(null)}
      >
        <span class="check-mark">{#if activeId === null}<i class="codicon codicon-check"></i>{/if}</span>
        <span class="option-name">No Environment</span>
      </button>

      {#each envList as env}
        <button
          class="env-option"
          class:selected={activeId === env.id}
          onclick={() => selectEnvironment(env.id)}
        >
          <span class="check-mark">{#if activeId === env.id}<i class="codicon codicon-check"></i>{/if}</span>
          {#if env.color}
            <span class="env-color-dot" style="background: {env.color};"></span>
          {/if}
          <span class="option-name">{env.name}</span>
        </button>
      {/each}

      <div class="context-divider"></div>
      <button class="context-action" onclick={openEnvPanel}>
        <i class="codicon codicon-symbol-variable"></i>
        Manage Environments
      </button>
    </div>
  {/if}
</div>

<style>
  .env-selector {
    position: relative;
    align-self: stretch;
    display: flex;
  }

  .env-button {
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

  .env-button:hover {
    border-color: var(--hf-focusBorder);
  }

  .env-button.active {
    border-color: var(--env-color, var(--hf-charts-green, #49cc90));
  }

  .env-color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .env-icon {
    padding: 2px 4px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
  }

  .env-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .env-name.muted {
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

  .env-dropdown {
    position: fixed;
    min-width: 220px;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    overflow: hidden;
  }

  .env-option {
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

  .env-option:hover {
    background: var(--hf-list-hoverBackground);
  }

  .env-option.selected {
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
