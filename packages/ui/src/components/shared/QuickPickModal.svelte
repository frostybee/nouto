<script lang="ts">
  import { untrack } from 'svelte';

  interface QuickPickItem {
    label: string;
    value: string;
    description?: string;
    kind?: 'separator';
    icon?: string;
    accent?: boolean;
  }

  interface Props {
    open: boolean;
    title: string;
    items: QuickPickItem[];
    canPickMany?: boolean;
    onselect: (value: string | string[]) => void;
    oncancel: () => void;
  }

  let {
    open,
    title,
    items,
    canPickMany = false,
    onselect,
    oncancel,
  }: Props = $props();

  let filterText = $state('');
  let activeIndex = $state(0);
  let selectedValues = $state<Set<string>>(new Set());
  let filterEl = $state<HTMLInputElement>(undefined!);

  let filtered = $derived(
    filterText.trim()
      ? items.filter((item) => {
          if (item.kind === 'separator') return false;
          const search = filterText.toLowerCase();
          return item.label.toLowerCase().includes(search) ||
            (item.description?.toLowerCase().includes(search) ?? false);
        })
      : items
  );

  let selectableIndices = $derived(
    filtered.reduce<number[]>((acc, item, i) => {
      if (item.kind !== 'separator') acc.push(i);
      return acc;
    }, [])
  );

  // Reset state when modal opens
  $effect(() => {
    if (open) {
      filterText = '';
      activeIndex = untrack(() => selectableIndices[0] ?? 0);
      selectedValues = new Set();
    }
  });

  // Focus filter input when modal opens
  $effect(() => {
    if (open && filterEl) {
      requestAnimationFrame(() => filterEl.focus());
    }
  });

  // Clamp activeIndex to valid selectable bounds
  $effect(() => {
    if (selectableIndices.length === 0) {
      activeIndex = -1;
    } else if (!selectableIndices.includes(activeIndex)) {
      activeIndex = selectableIndices[0];
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;

    const currentPos = selectableIndices.indexOf(activeIndex);

    switch (e.key) {
      case 'Escape':
        oncancel();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (currentPos < selectableIndices.length - 1) {
          activeIndex = selectableIndices[currentPos + 1];
        }
        scrollActiveIntoView();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentPos > 0) {
          activeIndex = selectableIndices[currentPos - 1];
        }
        scrollActiveIntoView();
        break;
      case 'Enter':
        e.preventDefault();
        if (canPickMany) {
          onselect([...selectedValues]);
        } else if (filtered[activeIndex] && filtered[activeIndex].kind !== 'separator') {
          onselect(filtered[activeIndex].value);
        }
        break;
      case ' ':
        if (canPickMany && filtered[activeIndex] && filtered[activeIndex].kind !== 'separator') {
          e.preventDefault();
          toggleSelection(filtered[activeIndex].value);
        }
        break;
    }
  }

  function scrollActiveIntoView() {
    requestAnimationFrame(() => {
      const el = document.querySelector('.quickpick-item.active');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  function toggleSelection(value: string) {
    const next = new Set(selectedValues);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    selectedValues = next;
  }

  function handleItemClick(item: QuickPickItem, index: number) {
    activeIndex = index;
    if (canPickMany) {
      toggleSelection(item.value);
    } else {
      onselect(item.value);
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="quickpick" role="dialog" aria-modal="true" aria-labelledby="quickpick-title">
      <div class="quickpick-header">
        <span id="quickpick-title" class="quickpick-title">{title}</span>
      </div>
      <div class="quickpick-filter">
        <input
          class="quickpick-input"
          type="text"
          bind:value={filterText}
          bind:this={filterEl}
          placeholder="Type to filter..."
        />
      </div>
      <div class="quickpick-list" role="listbox">
        {#if filtered.length === 0}
          <div class="quickpick-empty">No matching items</div>
        {:else}
          {#each filtered as item, i (item.value)}
            {#if item.kind === 'separator'}
              <div class="quickpick-separator" role="separator">
                {#if item.label}
                  <span class="quickpick-separator-label">{item.label}</span>
                {/if}
                <span class="quickpick-separator-line"></span>
              </div>
            {:else}
              <button
                class="quickpick-item"
                class:active={i === activeIndex}
                class:accent={item.accent}
                class:selected={canPickMany && selectedValues.has(item.value)}
                role="option"
                aria-selected={i === activeIndex}
                onclick={() => handleItemClick(item, i)}
                onmouseenter={() => { activeIndex = i; }}
              >
                {#if canPickMany}
                  <span class="quickpick-checkbox codicon {selectedValues.has(item.value) ? 'codicon-check' : 'codicon-chrome-minimize'}"></span>
                {/if}
                {#if item.icon}
                  <span class="quickpick-item-icon codicon {item.icon}"></span>
                {/if}
                <span class="quickpick-item-label">{item.label}</span>
                {#if item.description}
                  <span class="quickpick-item-description">{item.description}</span>
                {/if}
              </button>
            {/if}
          {/each}
        {/if}
      </div>
      {#if canPickMany}
        <div class="quickpick-actions">
          <button class="btn btn-secondary" onclick={oncancel}>Cancel</button>
          <button class="btn btn-primary" onclick={() => onselect([...selectedValues])}>
            OK ({selectedValues.size} selected)
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    background: rgba(0, 0, 0, 0.5);
  }

  .quickpick {
    min-width: 400px;
    max-width: 520px;
    width: 100%;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    animation: modalIn 0.15s ease-out;
  }

  @keyframes modalIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .quickpick-header {
    padding: 10px 14px 0;
  }

  .quickpick-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--hf-foreground);
  }

  .quickpick-filter {
    padding: 8px 14px;
  }

  .quickpick-input {
    width: 100%;
    padding: 6px 10px;
    font-size: 13px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    outline: none;
    box-sizing: border-box;
  }

  .quickpick-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .quickpick-list {
    max-height: 300px;
    overflow-y: auto;
    padding: 0 6px 6px;
  }

  .quickpick-separator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 4px;
    margin-top: 4px;
  }

  .quickpick-separator:first-child {
    margin-top: 0;
  }

  .quickpick-separator-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .quickpick-separator-line {
    flex: 1;
    height: 1px;
    background: var(--hf-panel-border);
    opacity: 0.5;
  }

  .quickpick-empty {
    padding: 12px 14px;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    text-align: center;
  }

  .quickpick-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    font-size: 13px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .quickpick-item:hover,
  .quickpick-item.active {
    background: var(--hf-list-hoverBackground);
  }

  .quickpick-item.selected {
    background: var(--hf-list-activeSelectionBackground);
  }

  .quickpick-checkbox {
    font-size: 14px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .quickpick-item.selected .quickpick-checkbox {
    opacity: 1;
    color: var(--hf-editorInfo-foreground, #3794ff);
  }

  .quickpick-item.accent .quickpick-item-label,
  .quickpick-item.accent .quickpick-item-icon {
    color: var(--hf-textLink-foreground, #3794ff);
  }

  .quickpick-item-icon {
    font-size: 14px;
    flex-shrink: 0;
    color: var(--hf-descriptionForeground);
  }

  .quickpick-item-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quickpick-item-description {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quickpick-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 14px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .btn {
    padding: 6px 14px;
    font-size: 13px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-secondary {
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-button-secondaryBackground, var(--hf-panel-border));
  }

  .btn-secondary:hover {
    background: var(--hf-button-secondaryHoverBackground, rgba(90, 93, 94, 0.31));
  }

  .btn-primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .btn-primary:hover {
    background: var(--hf-button-hoverBackground);
  }
</style>
