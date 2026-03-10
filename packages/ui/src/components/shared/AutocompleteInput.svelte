<script lang="ts">
  import { tick } from 'svelte';
  import type { HeaderInfo } from '../../lib/http-header-descriptions';
  import { activeVariablesList } from '../../stores/environment';
  import { MOCK_VARIABLES } from '../../lib/value-transforms';

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

  // Variable autocomplete state (triggered by typing `{{`)
  let varMode = $state(false);
  let varTriggerStart = $state(-1);
  let varQuery = $state('');

  const variables = $derived($activeVariablesList);

  interface VarSuggestion {
    label: string;
    detail: string;
    insertText: string;
    hasArgs?: boolean;
    namespace?: string;
  }

  const varSuggestions = $derived.by(() => {
    if (!varMode) return [];
    const q = varQuery.toLowerCase();

    const varItems: VarSuggestion[] = variables
      .filter(v => !q || v.key.toLowerCase().includes(q))
      .map(v => ({
        label: v.key,
        detail: v.isSecret ? '******' : v.value,
        insertText: `{{${v.key}}}`,
      }));

    const namespacePrefixMatch = q.match(/^\$(\w+)\.$/);

    const mockItems: VarSuggestion[] = MOCK_VARIABLES
      .filter(v => {
        if (namespacePrefixMatch) return v.name.toLowerCase().startsWith(q);
        return !q || v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q);
      })
      .map(v => {
        const hasArgs = !!v.args;
        return {
          label: v.name,
          detail: hasArgs ? `(${v.args}) ${v.description}` : v.description,
          insertText: hasArgs ? `{{${v.name}, }}` : `{{${v.name}}}`,
          hasArgs,
          namespace: v.namespace,
        };
      });

    if (namespacePrefixMatch) return [...mockItems, ...varItems].slice(0, 30);
    return [...varItems, ...mockItems].slice(0, 30);
  });

  let filteredSuggestions = $derived.by(() => {
    if (!value || !suggestions.length) return [];
    const lowerValue = value.toLowerCase();
    return suggestions
      .filter(s => s.toLowerCase().includes(lowerValue))
      .slice(0, 50);
  });

  function detectVarTrigger(el: HTMLInputElement): { start: number; query: string } | null {
    const pos = el.selectionStart ?? el.value.length;
    const textBefore = el.value.slice(0, pos);
    const lastOpen = textBefore.lastIndexOf('{{');
    if (lastOpen === -1) return null;
    const afterOpen = textBefore.slice(lastOpen + 2);
    if (afterOpen.includes('}}')) return null;
    return { start: lastOpen, query: afterOpen };
  }

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    oninput?.(target.value);

    // Check for variable trigger first
    const trigger = detectVarTrigger(target);
    if (trigger) {
      varMode = true;
      varTriggerStart = trigger.start;
      varQuery = trigger.query;
      showDropdown = true;
      selectedIndex = 0;
      return;
    }

    varMode = false;
    showDropdown = filteredSuggestions.length > 0;
    selectedIndex = -1;
  }

  function handleKeyDown(e: KeyboardEvent) {
    const items = varMode ? varSuggestions : filteredSuggestions;
    if (!showDropdown || items.length === 0) {
      onkeydown?.(e);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, varMode ? 0 : -1);
      scrollToSelected();
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      if (varMode) {
        selectVarSuggestion(varSuggestions[selectedIndex]);
      } else {
        selectSuggestion(filteredSuggestions[selectedIndex]);
      }
    } else if (e.key === 'Tab' && varMode && selectedIndex >= 0) {
      e.preventDefault();
      selectVarSuggestion(varSuggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      showDropdown = false;
      varMode = false;
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

  function selectVarSuggestion(s: VarSuggestion) {
    if (!inputElement) return;
    const pos = inputElement.selectionStart ?? inputElement.value.length;
    const before = inputElement.value.slice(0, varTriggerStart);
    const after = inputElement.value.slice(pos);
    const newValue = before + s.insertText + after;
    oninput?.(newValue);
    showDropdown = false;
    varMode = false;
    selectedIndex = -1;

    const newPos = s.hasArgs
      ? before.length + s.insertText.length - 2
      : before.length + s.insertText.length;
    tick().then(() => {
      if (inputElement) {
        inputElement.value = newValue;
        inputElement.setSelectionRange(newPos, newPos);
        inputElement.focus();
      }
    });
  }

  function handleFocus() {
    if (!varMode && filteredSuggestions.length > 0) {
      showDropdown = true;
    }
  }

  function handleBlur() {
    // Delay to allow click on dropdown
    setTimeout(() => {
      showDropdown = false;
      varMode = false;
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
      const dropdown = inputElement?.parentElement?.querySelector('.autocomplete-dropdown, .var-dropdown');
      const selected = dropdown?.querySelector('.suggestion-item.selected, .var-item.selected');
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

  {#if showDropdown && varMode && varSuggestions.length > 0}
    <div class="var-dropdown" role="listbox">
      {#each varSuggestions as s, i}
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
        <div
          class="var-item"
          class:selected={i === selectedIndex}
          role="option"
          tabindex="-1"
          aria-selected={i === selectedIndex}
          onmousedown={(e) => {
            e.preventDefault();
            selectVarSuggestion(s);
          }}
          onmouseenter={() => selectedIndex = i}
        >
          {#if s.namespace}
            <span class="var-item-ns">{s.namespace}</span>
          {/if}
          <span class="var-item-label">{s.label}</span>
          <span class="var-item-detail">{s.detail}</span>
        </div>
      {/each}
    </div>
  {:else if showDropdown && !varMode && filteredSuggestions.length > 0}
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
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .key-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .key-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .autocomplete-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    max-height: 200px;
    overflow-y: auto;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border, var(--hf-focusBorder));
    border-radius: 4px;
    margin-top: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .suggestion-item {
    padding: 6px 8px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-dropdown-foreground);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .suggestion-item:hover,
  .suggestion-item.selected {
    background: var(--hf-list-hoverBackground);
  }

  .suggestion-item.selected {
    color: var(--hf-list-activeSelectionForeground);
  }

  /* Scrollbar styling */
  .autocomplete-dropdown::-webkit-scrollbar {
    width: 10px;
  }

  .autocomplete-dropdown::-webkit-scrollbar-track {
    background: var(--hf-scrollbarSlider-background);
  }

  .autocomplete-dropdown::-webkit-scrollbar-thumb {
    background: var(--hf-scrollbarSlider-hoverBackground);
    border-radius: 5px;
  }

  .autocomplete-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--hf-scrollbarSlider-activeBackground);
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
    color: var(--hf-descriptionForeground);
  }

  .suggestion-tooltip {
    position: absolute;
    left: 100%;
    top: 0;
    margin-left: 8px;
    min-width: 250px;
    max-width: 400px;
    padding: 10px 12px;
    background: var(--hf-editorHoverWidget-background);
    border: 1px solid var(--hf-editorHoverWidget-border, var(--hf-focusBorder));
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-size: 12px;
    line-height: 1.5;
    color: var(--hf-editorHoverWidget-foreground);
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
    color: var(--hf-textLink-foreground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    align-self: flex-start;
    transition: background 0.15s;
  }

  .tooltip-link:hover {
    background: var(--hf-list-hoverBackground);
    text-decoration: underline;
  }

  .tooltip-link .codicon {
    font-size: 12px;
  }

  /* Variable autocomplete dropdown (matches VariableAutocompleteInput styles) */
  .var-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    max-height: 180px;
    overflow-y: auto;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border, var(--hf-focusBorder));
    border-radius: 4px;
    margin-top: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .var-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-dropdown-foreground);
    cursor: pointer;
  }

  .var-item:hover,
  .var-item.selected {
    background: var(--hf-list-hoverBackground);
  }

  .var-item.selected {
    color: var(--hf-list-activeSelectionForeground);
  }

  .var-item-ns {
    flex-shrink: 0;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--hf-badge-background, rgba(255, 255, 255, 0.1));
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .var-item-label {
    flex-shrink: 0;
    font-weight: 600;
  }

  .var-item-detail {
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  .var-dropdown::-webkit-scrollbar {
    width: 8px;
  }

  .var-dropdown::-webkit-scrollbar-thumb {
    background: var(--hf-scrollbarSlider-background);
    border-radius: 4px;
  }

  .var-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--hf-scrollbarSlider-hoverBackground);
  }
</style>
