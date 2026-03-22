<script lang="ts">
  import { tabs, switchTab, closeTabSearch } from '../../stores/tabs.svelte';
  import type { Tab } from '../../stores/tabs.svelte';

  let searchQuery = $state('');
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement>(undefined!);

  const allTabs = $derived(tabs());

  // Sort by most recently used, then filter by query
  const filteredTabs = $derived.by(() => {
    const sorted = [...allTabs].sort(
      (a, b) => (b.lastActivatedAt || 0) - (a.lastActivatedAt || 0)
    );
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(t =>
      t.label.toLowerCase().includes(q) ||
      (t.collectionName && t.collectionName.toLowerCase().includes(q))
    );
  });

  // Clamp selected index when filtered list changes
  $effect(() => {
    if (selectedIndex >= filteredTabs.length) {
      selectedIndex = Math.max(0, filteredTabs.length - 1);
    }
  });

  // Auto-focus on mount
  $effect(() => {
    if (inputEl) {
      inputEl.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeTabSearch();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
      scrollSelectedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollSelectedIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const tab = filteredTabs[selectedIndex];
      if (tab) {
        switchTab(tab.id);
        closeTabSearch();
      }
    }
  }

  function handleSelect(tab: Tab) {
    switchTab(tab.id);
    closeTabSearch();
  }

  function handleBackdropClick() {
    closeTabSearch();
  }

  function scrollSelectedIntoView() {
    // Let DOM update, then scroll
    requestAnimationFrame(() => {
      const el = document.querySelector('.tab-switcher-item.selected');
      if (el) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function methodColor(method: string): string {
    switch (method?.toUpperCase()) {
      case 'GET': return 'var(--hf-charts-green)';
      case 'POST': return 'var(--hf-charts-yellow)';
      case 'PUT': return 'var(--hf-charts-blue)';
      case 'PATCH': return 'var(--hf-charts-orange)';
      case 'DELETE': return 'var(--hf-charts-red)';
      case 'HEAD': return 'var(--hf-charts-purple)';
      default: return 'var(--hf-descriptionForeground)';
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tab-switcher-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tab-switcher" onclick={(e) => e.stopPropagation()}>
    <input
      bind:this={inputEl}
      type="text"
      class="tab-switcher-input"
      placeholder="Search open tabs..."
      bind:value={searchQuery}
      onkeydown={handleKeydown}
    />
    <div class="tab-switcher-list">
      {#each filteredTabs as tab, i (tab.id)}
        <button
          class="tab-switcher-item"
          class:selected={i === selectedIndex}
          onclick={() => handleSelect(tab)}
          onmouseenter={() => { selectedIndex = i; }}
        >
          {#if tab.type === 'request' && tab.icon}
            <span class="ts-method" style="color: {methodColor(tab.icon)}">{tab.icon}</span>
          {:else if tab.type === 'settings'}
            <span class="codicon codicon-gear ts-icon"></span>
          {:else if tab.type === 'environments'}
            <span class="codicon codicon-symbol-variable ts-icon"></span>
          {/if}
          <span class="ts-label">{tab.label}</span>
          {#if tab.collectionName}
            <span class="ts-collection">{tab.collectionName}</span>
          {/if}
          {#if tab.pinned}
            <span class="codicon codicon-pinned ts-pin"></span>
          {/if}
          {#if tab.dirty}
            <span class="ts-dirty"></span>
          {/if}
        </button>
      {/each}
      {#if filteredTabs.length === 0}
        <div class="ts-empty">No matching tabs</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .tab-switcher-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10001;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    justify-content: center;
    padding-top: 80px;
  }

  .tab-switcher {
    width: 420px;
    max-height: 60vh;
    background: var(--hf-quickInput-background, var(--hf-editor-background));
    border: 1px solid var(--hf-widget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    align-self: flex-start;
  }

  .tab-switcher-input {
    width: 100%;
    padding: 10px 14px;
    border: none;
    border-bottom: 1px solid var(--hf-widget-border, var(--hf-panel-border));
    background: transparent;
    color: var(--hf-input-foreground, var(--hf-foreground));
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }

  .tab-switcher-input::placeholder {
    color: var(--hf-input-placeholderForeground, var(--hf-descriptionForeground));
  }

  .tab-switcher-list {
    overflow-y: auto;
    flex: 1;
    padding: 4px 0;
  }

  .tab-switcher-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 14px;
    border: none;
    background: transparent;
    color: var(--hf-foreground);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }

  .tab-switcher-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .ts-method {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    flex-shrink: 0;
    min-width: 36px;
  }

  .ts-icon {
    font-size: 14px;
    flex-shrink: 0;
    opacity: 0.8;
    min-width: 36px;
    text-align: center;
  }

  .ts-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ts-collection {
    font-size: 11px;
    opacity: 0.5;
    flex-shrink: 0;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ts-pin {
    font-size: 10px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .ts-dirty {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hf-editorInfo-foreground);
    flex-shrink: 0;
  }

  .ts-empty {
    padding: 16px 14px;
    text-align: center;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
  }
</style>
