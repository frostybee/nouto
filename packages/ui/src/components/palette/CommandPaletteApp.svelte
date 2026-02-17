<script lang="ts">
  import { onMount } from 'svelte';
  import { palette, paletteResultsByType } from '../../stores/palette';
  import { frecency } from '../../stores/frecency';
  import PaletteSection from './PaletteSection.svelte';
  import PaletteResultItem from './PaletteResultItem.svelte';
  import PaletteIcon from './PaletteIcon.svelte';
  import EmptyState from './EmptyState.svelte';
  import type { Collection } from '../../types';

  // Props for modal mode
  interface Props {
    isModal?: boolean;
    collections?: Collection[];
    environments?: any;
    onclose?: () => void;
    onselect?: (data: any) => void;
  }
  let { isModal = false, collections = [], environments = null, onclose, onselect }: Props = $props();

  // Input element reference
  let searchInput: HTMLInputElement;
  let resultsContainer: HTMLDivElement;
  let paletteModalElement: HTMLDivElement;

  // Initialize palette in modal mode
  onMount(() => {
    if (isModal) {
      palette.initialize(collections, environments);
      palette.open();
    }
  });

  // Auto-focus input whenever palette opens
  $effect(() => {
    if ($palette.open) {
      // Tick delay to ensure the {#if} block has rendered the input
      requestAnimationFrame(() => {
        searchInput?.focus();
      });
    }
  });

  // Focus trap - keep Tab navigation within modal
  function handleModalKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !paletteModalElement) return;

    // ALWAYS prevent default Tab behavior when palette is open
    e.preventDefault();

    // Get all focusable elements (including those with tabindex="0")
    const focusableSelector = 'input:not([disabled]), button:not([disabled]), [tabindex="0"]';
    const focusableElements = paletteModalElement.querySelectorAll<HTMLElement>(focusableSelector);
    const focusableArray = Array.from(focusableElements).filter(el => {
      // Only include visible elements
      return el.offsetWidth > 0 && el.offsetHeight > 0;
    });

    if (focusableArray.length === 0) {
      // No focusable elements, just keep focus on search input
      searchInput?.focus();
      return;
    }

    const firstFocusable = focusableArray[0];
    const lastFocusable = focusableArray[focusableArray.length - 1];
    const activeElement = document.activeElement as HTMLElement;
    const currentIndex = focusableArray.indexOf(activeElement);

    if (e.shiftKey) {
      // Shift+Tab: moving backwards
      if (currentIndex <= 0 || !paletteModalElement.contains(activeElement)) {
        // At first or outside modal - wrap to last
        lastFocusable?.focus();
      } else {
        // Move to previous
        focusableArray[currentIndex - 1]?.focus();
      }
    } else {
      // Tab: moving forwards
      if (currentIndex === -1 || currentIndex >= focusableArray.length - 1) {
        // Outside modal or at last - wrap to first
        firstFocusable?.focus();
      } else {
        // Move to next
        focusableArray[currentIndex + 1]?.focus();
      }
    }
  }

  // Handle keyboard navigation
  function handleKeyDown(e: KeyboardEvent) {
    // Don't process if palette is not open
    if (!$palette.open) return;

    // Handle Tab for focus trapping first
    if (e.key === 'Tab') {
      handleModalKeyDown(e);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        palette.selectNext();
        scrollSelectedIntoView();
        break;

      case 'ArrowUp':
        e.preventDefault();
        palette.selectPrevious();
        scrollSelectedIntoView();
        break;

      case 'Enter':
        e.preventDefault();
        handleSelect();
        break;

      case 'Escape':
        e.preventDefault();
        handleClose();
        break;
    }
  }

  // Handle result selection
  function handleSelect() {
    const selected = palette.getSelected();
    if (!selected) return;

    if (selected.type === 'action' && selected.action) {
      // Execute action
      executeAction(selected.action.id);
    } else if (selected.request) {
      // Open request
      openRequest(selected.request.id, selected.request.collectionId);
      // Record for frecency
      frecency.recordOpen(selected.request.id);
    }

    handleClose();
  }

  // Handle closing palette
  function handleClose() {
    if (isModal && onclose) {
      onclose();
    } else {
      palette.close();
    }
  }

  // Handle backdrop click
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  // Scroll selected item into view
  function scrollSelectedIntoView() {
    setTimeout(() => {
      const selectedElement = resultsContainer?.querySelector('.result-item.selected');
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }, 10);
  }

  // Execute an action (to be implemented by extension)
  function executeAction(actionId: string) {
    if (isModal && onselect) {
      // Modal mode: use callback
      onselect({
        type: 'executeAction',
        data: { actionId },
      });
    } else {
      // Standalone mode: use postMessage
      if (typeof window !== 'undefined' && (window as any).vscode) {
        (window as any).vscode.postMessage({
          type: 'executeAction',
          actionId,
        });
      }
    }
  }

  // Open a request (to be implemented by extension)
  function openRequest(requestId: string, collectionId: string) {
    if (isModal && onselect) {
      // Modal mode: use callback
      onselect({
        type: 'selectRequest',
        data: { requestId, collectionId },
      });
    } else {
      // Standalone mode: use postMessage
      if (typeof window !== 'undefined' && (window as any).vscode) {
        (window as any).vscode.postMessage({
          type: 'selectRequest',
          requestId,
          collectionId,
        });
      }
    }
  }

  // Handle result item click
  function handleResultClick(index: number) {
    palette.setSelectedIndex(index);
    handleSelect();
  }

  // Handle result item hover
  function handleResultHover(index: number) {
    palette.setSelectedIndex(index);
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if $palette.open}
  <div
    class="palette-backdrop"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="palette-title"
  >
    <div
      bind:this={paletteModalElement}
      class="palette-modal"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Search Input -->
      <div class="search-container">
        <span class="search-icon" aria-hidden="true">
          <PaletteIcon name="search" />
        </span>
        <input
          bind:this={searchInput}
          type="text"
          id="palette-search"
          class="search-input"
          placeholder="search, command, or filter (m:GET, c:Auth, b:token)"
          value={$palette.query}
          oninput={(e) => palette.setQuery(e.currentTarget.value)}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant="result-{$palette.selectedIndex}"
          autocomplete="off"
          spellcheck="false"
        />
        {#if $palette.query}
          <button
            class="clear-button"
            onclick={() => palette.setQuery('')}
            aria-label="Clear search"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        {/if}
      </div>

      <!-- Results -->
      <div
        bind:this={resultsContainer}
        id="palette-results"
        class="results-container"
        role="listbox"
        aria-label="Search results"
      >
        {#if $palette.results.length === 0}
          <EmptyState query={$palette.query} />
        {:else}
          <!-- ACTIONS Section -->
          {#if $paletteResultsByType.action.length > 0}
            <PaletteSection
              title="ACTIONS"
              count={$paletteResultsByType.action.length}
            >
              {#each $paletteResultsByType.action as result, i}
                {@const globalIndex = $palette.results.findIndex(r => r.id === result.id)}
                <PaletteResultItem
                  {result}
                  selected={globalIndex === $palette.selectedIndex}
                  query={$palette.query}
                  onclick={() => handleResultClick(globalIndex)}
                  onmouseenter={() => handleResultHover(globalIndex)}
                />
              {/each}
            </PaletteSection>
          {/if}

          <!-- RECENT Section -->
          {#if $paletteResultsByType.recent.length > 0 && $palette.showingRecent}
            <PaletteSection
              title="RECENT"
              count={$paletteResultsByType.recent.length}
            >
              {#each $paletteResultsByType.recent as result, i}
                {@const globalIndex = $palette.results.findIndex(r => r.id === result.id)}
                <PaletteResultItem
                  {result}
                  selected={globalIndex === $palette.selectedIndex}
                  query={$palette.query}
                  onclick={() => handleResultClick(globalIndex)}
                  onmouseenter={() => handleResultHover(globalIndex)}
                />
              {/each}
            </PaletteSection>
          {/if}

          <!-- SWITCH REQUEST Section -->
          {#if $paletteResultsByType.request.length > 0 && !$palette.showingRecent}
            <PaletteSection
              title="SWITCH REQUEST"
              count={$paletteResultsByType.request.length}
            >
              {#each $paletteResultsByType.request as result, i}
                {@const globalIndex = $palette.results.findIndex(r => r.id === result.id)}
                <PaletteResultItem
                  {result}
                  selected={globalIndex === $palette.selectedIndex}
                  query={$palette.query}
                  onclick={() => handleResultClick(globalIndex)}
                  onmouseenter={() => handleResultHover(globalIndex)}
                />
              {/each}
            </PaletteSection>
          {/if}
        {/if}
      </div>

      <!-- Footer hint -->
      <div class="palette-footer">
        <span class="footer-hint">
          <kbd>↑</kbd><kbd>↓</kbd> navigate
          <kbd>↵</kbd> select
          <kbd>esc</kbd> close
        </span>
      </div>

      <!-- Screen reader announcements -->
      <div class="sr-only" aria-live="polite">
        {$palette.results.length} results found
      </div>
    </div>
  </div>
{/if}

<style global>
  .palette-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 9999;
    animation: fadeIn 200ms ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .palette-modal {
    width: 100%;
    max-width: 600px;
    max-height: 70vh;
    background: var(--vscode-quickInput-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: modalSlideIn 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Search Container */
  .search-container {
    position: relative;
    display: flex;
    align-items: center;
    margin: 0.75rem 1rem;
    padding: 0 0.25rem;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 999px;
    background: var(--vscode-input-background);
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    display: flex;
    align-items: center;
    color: var(--vscode-input-placeholderForeground);
    pointer-events: none;
  }

  .search-input {
    flex: 1;
    padding: 0.5rem 0.5rem 0.5rem 2rem;
    border: none;
    background: transparent;
    color: var(--vscode-input-foreground);
    font-size: 1rem;
    outline: none;
    font-family: var(--vscode-font-family);
  }

  .search-container:focus-within {
    border-color: var(--vscode-focusBorder);
  }

  .search-input:focus {
    outline: none;
  }

  .search-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .clear-button {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    cursor: pointer;
    border-radius: 3px;
    color: var(--vscode-input-placeholderForeground);
    transition: background 150ms ease-out;
  }

  .clear-button:hover {
    background: var(--vscode-toolbar-hoverBackground);
    color: var(--vscode-input-foreground);
  }

  .clear-button:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  /* Results Container */
  .results-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  /* Footer */
  .palette-footer {
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--vscode-widget-border);
    background: var(--vscode-sideBar-background);
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
  }

  .footer-hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .footer-hint kbd {
    padding: 0.15rem 0.35rem;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.7rem;
    background: var(--vscode-keybindingLabel-background);
    color: var(--vscode-keybindingLabel-foreground);
    border: 1px solid var(--vscode-keybindingLabel-border);
    border-radius: 3px;
  }

  /* Accessibility */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* Scrollbar styling */
  .results-container::-webkit-scrollbar {
    width: 10px;
  }

  .results-container::-webkit-scrollbar-track {
    background: var(--vscode-scrollbarSlider-background);
  }

  .results-container::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-hoverBackground);
    border-radius: 5px;
  }

  .results-container::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-activeBackground);
  }
</style>
