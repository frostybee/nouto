<script lang="ts">
  import {
    environments,
    activeEnvironmentId,
    activeEnvironment,
    setActiveEnvironment,
    deleteEnvironment,
  } from '../../stores/environment';
  import { postMessage } from '../../lib/vscode';
  import Tooltip from './Tooltip.svelte';

  let showDropdown = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();
  let dropdownPos = $state({ top: 0, right: 0 });

  const envList = $derived($environments);
  const activeId = $derived($activeEnvironmentId);
  const activeEnv = $derived($activeEnvironment);

  function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown && buttonEl) {
      const rect = buttonEl.getBoundingClientRect();
      dropdownPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
    }
  }

  function selectEnvironment(id: string | null) {
    setActiveEnvironment(id);
    showDropdown = false;
  }

  function handleDeleteEnvironment(id: string) {
    if (confirm('Delete this environment?')) {
      deleteEnvironment(id);
    }
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

  <Tooltip text="Manage environments &amp; cookies">
    <button class="manage-btn" onclick={(e) => { e.stopPropagation(); openEnvPanel(); }} aria-label="Manage environments and cookies">
      <i class="codicon codicon-settings-gear"></i>
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
      <div class="dropdown-header">Environments</div>

      <button
        class="env-option"
        class:selected={activeId === null}
        onclick={() => selectEnvironment(null)}
      >
        <span class="option-name">No Environment</span>
      </button>

      {#each envList as env}
        <div class="env-option-row">
          <button
            class="env-option"
            class:selected={activeId === env.id}
            onclick={() => selectEnvironment(env.id)}
          >
            {#if env.color}
              <span class="env-color-dot" style="background: {env.color};"></span>
            {/if}
            <span class="option-name">{env.name}</span>
            <span class="var-count">{env.variables.filter(v => v.enabled).length} vars</span>
          </button>
          <button
            class="delete-btn"
            onclick={(e) => { e.stopPropagation(); handleDeleteEnvironment(env.id); }}
            title="Delete environment"
          >
            <i class="codicon codicon-trash"></i>
          </button>
        </div>
      {/each}

      <button class="manage-environments-btn" onclick={openEnvPanel}>
        <i class="codicon codicon-settings-gear"></i>
        Manage Environments & Cookies
      </button>
    </div>
  {/if}
</div>

<style>
  .env-selector {
    position: relative;
    align-self: stretch;
    display: flex;
    gap: 2px;
  }

  .env-button {
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

  .manage-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    height: 100%;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    opacity: 0.7;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .manage-btn:hover {
    opacity: 1;
    border-color: var(--hf-focusBorder);
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

  .dropdown-header {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .env-option-row {
    display: flex;
    align-items: stretch;
  }

  .env-option {
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

  .env-option:hover {
    background: var(--hf-list-hoverBackground);
  }

  .env-option.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .option-name {
    flex: 1;
  }

  .var-count {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    margin-left: auto;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--hf-foreground);
    transition: color 0.15s, background 0.15s;
  }

  .delete-btn:hover {
    color: var(--hf-errorForeground, #f14c4c);
    background: var(--hf-list-hoverBackground);
  }

  .manage-environments-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--hf-panel-border);
    color: var(--hf-textLink-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .manage-environments-btn:hover {
    background: var(--hf-list-hoverBackground);
  }
</style>
