<script lang="ts">
  export interface ContextMenuItem {
    label: string;
    icon?: string;
    danger?: boolean;
    divider?: boolean;
    disabled?: boolean;
    action?: () => void;
  }

  interface Props {
    items: ContextMenuItem[];
    x: number;
    y: number;
    show: boolean;
    onclose: () => void;
  }

  let { items, x, y, show, onclose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let focusedIndex = $state(-1);
  let adjustedX = $state(0);
  let adjustedY = $state(0);

  const actionableItems = $derived(
    items.map((item, i) => ({ ...item, originalIndex: i })).filter(item => !item.divider && !item.disabled)
  );

  // Update position when props change
  $effect(() => {
    adjustedX = x;
    adjustedY = y;
  });

  // Viewport clamping after mount
  $effect(() => {
    if (!show || !menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      adjustedY = Math.max(4, window.innerHeight - rect.height - 4);
    }
    if (rect.right > window.innerWidth) {
      adjustedX = Math.max(4, window.innerWidth - rect.width - 4);
    }
  });

  // Focus first item on open
  $effect(() => {
    if (show && menuEl) {
      focusedIndex = 0;
      requestAnimationFrame(() => {
        const firstBtn = menuEl?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not([disabled])');
        firstBtn?.focus();
      });
    }
  });

  // Listen for close-context-menus broadcast
  $effect(() => {
    if (!show) return;
    const close = () => onclose();
    window.addEventListener('close-context-menus', close);
    return () => window.removeEventListener('close-context-menus', close);
  });

  function close() {
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!actionableItems.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = (focusedIndex + 1) % actionableItems.length;
      focusItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = (focusedIndex - 1 + actionableItems.length) % actionableItems.length;
      focusItem();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = actionableItems[focusedIndex];
      if (item?.action) {
        item.action();
        close();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  function focusItem() {
    if (!menuEl) return;
    const buttons = menuEl.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])');
    buttons[focusedIndex]?.focus();
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="context-backdrop" onclick={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu"
    style="left: {adjustedX}px; top: {adjustedY}px"
    bind:this={menuEl}
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
  >
    {#each items as item, i}
      {#if item.divider}
        <div class="context-divider" role="separator"></div>
      {:else}
        <button
          class="context-item"
          class:danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          tabindex={actionableItems.findIndex(a => a.originalIndex === i) === focusedIndex ? 0 : -1}
          onclick={() => { item.action?.(); close(); }}
        >
          {#if item.icon}
            <span class="context-icon codicon {item.icon}"></span>
          {/if}
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .context-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
    background: transparent;
  }

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
    outline: none;
  }

  .context-item:hover,
  .context-item:focus {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .context-item.danger {
    color: var(--hf-errorForeground);
  }

  .context-item:disabled {
    opacity: 0.5;
    cursor: default;
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
