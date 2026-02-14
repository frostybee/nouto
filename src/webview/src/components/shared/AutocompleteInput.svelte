<script lang="ts">
  import { tick } from 'svelte';
  import type { HeaderInfo } from '../../lib/http-header-descriptions';

  interface Props {
    value: string;
    placeholder?: string;
    suggestions?: string[];
    suggestionDescriptions?: Record<string, HeaderInfo>;
    oninput?: (value: string) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  }
  let { value = '', placeholder = '', suggestions = [], suggestionDescriptions, oninput, onkeydown }: Props = $props();

  let inputElement: HTMLInputElement | undefined = $state();
  let showDropdown = $state(false);
  let selectedIndex = $state(-1);
  let hoveredSuggestion: string | null = $state(null);
  let hideTooltipTimeout: number | null = null;
  let filteredSuggestions = $derived.by(() => {
    if (!value || !suggestions.length) return [];
    const lowerValue = value.toLowerCase();
    return suggestions
      .filter(s => s.toLowerCase().includes(lowerValue))
      .slice(0, 50); // Limit to 50 results for performance
  });

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    oninput?.(target.value);
    showDropdown = filteredSuggestions.length > 0;
    selectedIndex = -1;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!showDropdown || filteredSuggestions.length === 0) {
      onkeydown?.(e);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredSuggestions.length - 1);
      scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      scrollToSelected();
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(filteredSuggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      showDropdown = false;
      selectedIndex = -1;
    } else {
      onkeydown?.(e);
    }
  }

  function selectSuggestion(suggestion: string) {
    oninput?.(suggestion);
    showDropdown = false;
    selectedIndex = -1;
    inputElement?.focus();
  }

  function handleFocus() {
    if (filteredSuggestions.length > 0) {
      showDropdown = true;
    }
  }

  function handleBlur() {
    // Delay to allow click on dropdown
    setTimeout(() => {
      showDropdown = false;
      selectedIndex = -1;
      hoveredSuggestion = null;
    }, 150);
  }

  function getDescription(suggestion: string): HeaderInfo | undefined {
    if (!suggestionDescriptions) return undefined;

    // Try exact match first
    if (suggestionDescriptions[suggestion]) {
      return suggestionDescriptions[suggestion];
    }

    // Try case-insensitive match
    const normalizedKey = Object.keys(suggestionDescriptions).find(
      key => key.toLowerCase() === suggestion.toLowerCase()
    );

    return normalizedKey ? suggestionDescriptions[normalizedKey] : undefined;
  }

  function handleLinkClick(e: MouseEvent, url: string) {
    e.preventDefault();
    e.stopPropagation();
    // Use VS Code command to open external URL
    const vscode = (window as any).vscode;
    if (vscode) {
      vscode.postMessage({ type: 'openExternal', url });
    }
  }

  function scrollToSelected() {
    tick().then(() => {
      const dropdown = document.querySelector('.autocomplete-dropdown');
      const selected = dropdown?.querySelector('.suggestion-item.selected');
      if (selected && dropdown) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    });
  }
</script>

<div class="autocomplete-wrapper">
  <input
    bind:this={inputElement}
    type="text"
    class="key-input"
    {placeholder}
    {value}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    onfocus={handleFocus}
    onblur={handleBlur}
  />

  {#if showDropdown && filteredSuggestions.length > 0}
    <div class="autocomplete-dropdown" role="listbox">
      {#each filteredSuggestions as suggestion, index}
        {@const description = getDescription(suggestion)}
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
        <div
          class="suggestion-item"
          class:selected={index === selectedIndex}
          class:has-description={!!description}
          role="option"
          tabindex="-1"
          aria-selected={index === selectedIndex}
          onmousedown={(e) => {
            e.preventDefault(); // Prevent blur
            selectSuggestion(suggestion);
          }}
          onmouseenter={() => {
            if (hideTooltipTimeout) {
              clearTimeout(hideTooltipTimeout);
              hideTooltipTimeout = null;
            }
            hoveredSuggestion = suggestion;
          }}
          onmouseleave={() => {
            hideTooltipTimeout = window.setTimeout(() => {
              hoveredSuggestion = null;
            }, 200); // 200ms delay to allow moving to tooltip
          }}
        >
          {suggestion}
          {#if description}
            <span class="info-icon codicon codicon-info"></span>
          {/if}
        </div>
      {/each}
    </div>

    {#if hoveredSuggestion && getDescription(hoveredSuggestion)}
      {@const headerInfo = getDescription(hoveredSuggestion)}
      {#if headerInfo}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="suggestion-tooltip"
          role="tooltip"
          onmouseenter={() => {
            if (hideTooltipTimeout) {
              clearTimeout(hideTooltipTimeout);
              hideTooltipTimeout = null;
            }
          }}
          onmouseleave={() => {
            hoveredSuggestion = null;
          }}
        >
          <div class="tooltip-description">{headerInfo.description}</div>
          {#if headerInfo.mdnUrl}
            <button
              class="tooltip-link"
              onclick={(e) => handleLinkClick(e, headerInfo.mdnUrl!)}
            >
              <span class="codicon codicon-link-external"></span>
              View on MDN
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .autocomplete-wrapper {
    position: relative;
    width: 100%;
  }

  .key-input {
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .key-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .key-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .autocomplete-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    max-height: 200px;
    overflow-y: auto;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-focusBorder));
    border-radius: 4px;
    margin-top: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .suggestion-item {
    padding: 6px 8px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family), monospace;
    color: var(--vscode-dropdown-foreground);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .suggestion-item:hover,
  .suggestion-item.selected {
    background: var(--vscode-list-hoverBackground);
  }

  .suggestion-item.selected {
    color: var(--vscode-list-activeSelectionForeground);
  }

  /* Scrollbar styling */
  .autocomplete-dropdown::-webkit-scrollbar {
    width: 10px;
  }

  .autocomplete-dropdown::-webkit-scrollbar-track {
    background: var(--vscode-scrollbarSlider-background);
  }

  .autocomplete-dropdown::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-hoverBackground);
    border-radius: 5px;
  }

  .autocomplete-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-activeBackground);
  }

  .suggestion-item.has-description {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .info-icon {
    flex-shrink: 0;
    font-size: 14px;
    opacity: 0.6;
    color: var(--vscode-descriptionForeground);
  }

  .suggestion-tooltip {
    position: absolute;
    left: 100%;
    top: 0;
    margin-left: 8px;
    min-width: 250px;
    max-width: 400px;
    padding: 10px 12px;
    background: var(--vscode-editorHoverWidget-background);
    border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-focusBorder));
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-size: 12px;
    line-height: 1.5;
    color: var(--vscode-editorHoverWidget-foreground);
    z-index: 1001;
    pointer-events: auto; /* Allow interaction with links */
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tooltip-description {
    line-height: 1.5;
  }

  .tooltip-link {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    margin-top: 4px;
    background: transparent;
    color: var(--vscode-textLink-foreground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    align-self: flex-start;
    transition: background 0.15s;
  }

  .tooltip-link:hover {
    background: var(--vscode-list-hoverBackground);
    text-decoration: underline;
  }

  .tooltip-link .codicon {
    font-size: 12px;
  }
</style>
