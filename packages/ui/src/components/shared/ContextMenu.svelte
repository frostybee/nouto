<script lang="ts">
  import { flushSync, tick } from 'svelte';

  export interface ContextMenuItem {
    /** Omitted for divider entries. */
    label?: string;
    icon?: string;
    danger?: boolean;
    divider?: boolean;
    disabled?: boolean;
    action?: () => void;
    /** Renders a submenu instead of running `action`. One level deep; nested `children` are ignored. */
    children?: ContextMenuItem[];
  }

  interface Props {
    items: ContextMenuItem[];
    x: number;
    y: number;
    show: boolean;
    onclose: () => void;
  }

  let { items, x, y, show, onclose }: Props = $props();

  /** Minimum gap between a menu and the viewport edge, in px. */
  const EDGE = 4;
  /** How far a submenu overlaps its parent menu horizontally, in px. */
  const SUBMENU_OVERLAP = 2;
  /** Grace period before a submenu closes, so the pointer can travel diagonally into it. */
  const SUBMENU_CLOSE_DELAY = 250;

  let menuEl: HTMLDivElement | undefined = $state();
  let submenuEl: HTMLDivElement | undefined = $state();
  let focusedIndex = $state(-1);
  let subFocusedIndex = $state(-1);
  let openSubmenuIndex = $state(-1);
  /** Shows the open submenu inside the main menu, for viewports too narrow to fit it beside. */
  let drilled = $state(false);
  let adjustedX = $state(0);
  let adjustedY = $state(0);
  let submenuX = $state(0);
  let submenuY = $state(0);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const actionableItems = $derived(toActionable(items));
  const submenuParent = $derived(openSubmenuIndex >= 0 ? items[openSubmenuIndex] : undefined);
  const drilledParent = $derived(drilled ? submenuParent : undefined);
  const actionableChildren = $derived(toActionable(submenuParent?.children ?? []));

  function toActionable(list: ContextMenuItem[]) {
    return list.map((item, i) => ({ ...item, originalIndex: i })).filter(item => !item.divider && !item.disabled);
  }

  function hasSubmenu(item: ContextMenuItem): boolean {
    return !!item.children?.length;
  }

  function clampToViewport(pos: number, size: number, viewport: number): number {
    return Math.max(EDGE, Math.min(pos, viewport - size - EDGE));
  }

  /** Whether a submenu about as wide as the main menu fits on either side of it. */
  function hasRoomBeside(): boolean {
    if (!menuEl) return true;
    const { left, right, width } = menuEl.getBoundingClientRect();
    return right - SUBMENU_OVERLAP + width <= window.innerWidth - EDGE || left + SUBMENU_OVERLAP - width >= EDGE;
  }

  // Keep the menu inside the viewport. Only the measured size is used: the
  // DOM may still sit at the previous position when this runs.
  $effect(() => {
    if (!show || !menuEl) return;
    const { width, height } = menuEl.getBoundingClientRect();
    adjustedX = clampToViewport(x, width, window.innerWidth);
    adjustedY = clampToViewport(y, height, window.innerHeight);
  });

  // Place the submenu beside its parent item: right if it fits, else left,
  // else drill in (narrow webviews cannot draw outside their frame).
  $effect(() => {
    if (openSubmenuIndex < 0 || drilled || !submenuEl || !menuEl) return;
    const anchor = menuEl.querySelector<HTMLElement>(`[data-index="${openSubmenuIndex}"]`);
    if (!anchor) return;
    const menuRect = menuEl.getBoundingClientRect();
    const { width, height } = submenuEl.getBoundingClientRect();
    const firstItem = submenuEl.firstElementChild as HTMLElement | null;
    const inset = submenuEl.clientTop + (firstItem?.offsetTop ?? 0);

    let left = menuRect.right - SUBMENU_OVERLAP;
    if (left + width > window.innerWidth - EDGE) {
      left = menuRect.left - width + SUBMENU_OVERLAP;
      if (left < EDGE) {
        // Wider than hasRoomBeside() estimated
        drilled = true;
        return;
      }
    }
    submenuX = left;
    submenuY = clampToViewport(anchor.getBoundingClientRect().top - inset, height, window.innerHeight);
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

  // Each opening starts with the submenu closed; drop a pending close on teardown
  $effect(() => {
    if (show) return cancelSubmenuClose;
    openSubmenuIndex = -1;
    subFocusedIndex = -1;
    drilled = false;
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

  function runItem(item: ContextMenuItem) {
    item.action?.();
    close();
  }

  async function openSubmenu(index: number, focusFirst = false) {
    cancelSubmenuClose();
    if (index === openSubmenuIndex && !focusFirst) return;
    drilled = !hasRoomBeside();
    openSubmenuIndex = index;
    subFocusedIndex = focusFirst ? 0 : -1;
    await tick();
    if (subFocusedIndex >= 0) {
      focusSubItem();
    } else if (drilled) {
      // The clicked parent item is gone; keep keyboard input in the menu
      menuEl?.focus();
    }
  }

  function closeSubmenu() {
    cancelSubmenuClose();
    if (openSubmenuIndex < 0) return;
    const parentIndex = openSubmenuIndex;
    // Drilling in removed the parent item, so focus always has to go back to it
    const restoreFocus = drilled || !!submenuEl?.contains(document.activeElement);
    openSubmenuIndex = -1;
    subFocusedIndex = -1;
    drilled = false;
    // Hand focus back to the parent item so keyboard navigation continues
    if (restoreFocus) {
      focusedIndex = actionableItems.findIndex(a => a.originalIndex === parentIndex);
      flushSync();
      focusItem();
    }
  }

  function scheduleSubmenuClose() {
    cancelSubmenuClose();
    closeTimer = setTimeout(closeSubmenu, SUBMENU_CLOSE_DELAY);
  }

  function cancelSubmenuClose() {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function handleItemHover(index: number, item: ContextMenuItem) {
    if (!hasSubmenu(item)) {
      if (openSubmenuIndex >= 0) scheduleSubmenuClose();
    } else if (hasRoomBeside()) {
      // Drilling in on hover would swap the menu contents under the pointer
      openSubmenu(index);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!actionableItems.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      closeSubmenu();
      focusedIndex = (focusedIndex + 1) % actionableItems.length;
      focusItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      closeSubmenu();
      focusedIndex = (focusedIndex - 1 + actionableItems.length) % actionableItems.length;
      focusItem();
    } else if (e.key === 'ArrowRight') {
      const item = actionableItems[focusedIndex];
      if (item && hasSubmenu(item)) {
        e.preventDefault();
        openSubmenu(item.originalIndex, true);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = actionableItems[focusedIndex];
      if (!item) return;
      if (hasSubmenu(item)) {
        openSubmenu(item.originalIndex, true);
      } else {
        runItem(item);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  function handleSubmenuKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!actionableChildren.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      subFocusedIndex = (subFocusedIndex + step + actionableChildren.length) % actionableChildren.length;
      focusSubItem();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = actionableChildren[subFocusedIndex];
      if (item) runItem(item);
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault();
      closeSubmenu();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  function focusItem() {
    if (!menuEl) return;
    const buttons = menuEl.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])');
    buttons[focusedIndex]?.focus();
  }

  function focusSubItem() {
    const container = drilled ? menuEl : submenuEl;
    // [data-index] skips the drilled-in back row
    const buttons = container?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"][data-index]:not([disabled])');
    buttons?.[subFocusedIndex]?.focus();
  }

  function isTabbable(index: number, nested: boolean): boolean {
    return nested
      ? actionableChildren.findIndex(a => a.originalIndex === index) === subFocusedIndex
      : actionableItems.findIndex(a => a.originalIndex === index) === focusedIndex;
  }
</script>

{#snippet entry(item: ContextMenuItem, i: number, nested: boolean)}
  {#if item.divider}
    <div class="context-divider" role="separator"></div>
  {:else}
    {@const parent = !nested && hasSubmenu(item)}
    {@const open = parent && i === openSubmenuIndex}
    <button
      class="context-item"
      class:danger={item.danger}
      class:open
      role="menuitem"
      data-index={i}
      disabled={item.disabled}
      aria-haspopup={parent ? 'menu' : undefined}
      aria-expanded={parent ? open : undefined}
      tabindex={isTabbable(i, nested) ? 0 : -1}
      onclick={() => (parent ? openSubmenu(i) : runItem(item))}
      onmouseenter={nested ? undefined : () => handleItemHover(i, item)}
    >
      {#if item.icon}
        <span class="context-icon codicon {item.icon}"></span>
      {/if}
      {item.label}
      {#if parent}
        <span class="context-chevron codicon codicon-chevron-right"></span>
      {/if}
    </button>
  {/if}
{/snippet}

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="context-backdrop" onclick={close} onkeydown={(e) => { if (e.key === 'Escape') close(); }} oncontextmenu={(e) => { e.preventDefault(); close(); }} role="none"></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu"
    style="left: {adjustedX}px; top: {adjustedY}px"
    bind:this={menuEl}
    role="menu"
    tabindex="-1"
    aria-label={drilledParent?.label}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => (drilledParent ? handleSubmenuKeydown(e) : handleKeydown(e))}
  >
    {#if drilledParent?.children}
      <button class="context-item context-back" role="menuitem" tabindex="-1" onclick={closeSubmenu}>
        <span class="context-icon codicon codicon-chevron-left"></span>
        {drilledParent.label}
      </button>
      <div class="context-divider" role="separator"></div>
      {#each drilledParent.children as child, i}
        {@render entry(child, i, true)}
      {/each}
    {:else}
      {#each items as item, i}
        {@render entry(item, i, false)}
      {/each}
    {/if}
  </div>

  {#if submenuParent?.children && !drilled}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="context-menu context-submenu"
      style="left: {submenuX}px; top: {submenuY}px"
      bind:this={submenuEl}
      role="menu"
      tabindex="-1"
      aria-label={submenuParent.label}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleSubmenuKeydown}
      onmouseenter={cancelSubmenuClose}
    >
      {#each submenuParent.children as child, i}
        {@render entry(child, i, true)}
      {/each}
    </div>
  {/if}
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
    min-width: 13.846rem;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 0.308rem 0;
  }

  .context-submenu {
    z-index: 1001;
  }

  .context-item {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    width: 100%;
    padding: 0.462rem 0.923rem;
    background: none;
    border: none;
    color: var(--hf-menu-foreground);
    font-size: 1rem;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    outline: none;
  }

  .context-item:hover,
  .context-item:focus,
  .context-item.open {
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
    font-size: 0.923rem;
    width: 1.231rem;
    text-align: center;
  }

  .context-back {
    font-weight: 600;
  }

  .context-chevron {
    margin-left: auto;
    padding-left: 1.231rem;
    font-size: 0.923rem;
  }

  .context-divider {
    height: 0.077rem;
    margin: 0.308rem 0;
    background: var(--hf-menu-separatorBackground, var(--hf-panel-border));
  }
</style>
