<script lang="ts">
  import { tick } from 'svelte';
  import { activeVariablesList } from '../../stores/environment.svelte';
  import { MOCK_VARIABLES } from '../../lib/value-transforms';
  import type { ActiveVariableEntry } from '../../stores/environment.svelte';

  interface Props {
    value: string;
    placeholder?: string;
    oninput?: (value: string) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  }
  let { value = '', placeholder = '', oninput, onkeydown }: Props = $props();

  let inputElement: HTMLInputElement | undefined = $state();
  let showDropdown = $state(false);
  let selectedIndex = $state(-1);
  let triggerStart = $state(-1); // position of the first `{` in `{{`

  // Resize state
  let dropdownSize = $state<{ w: number; h: number } | null>(null);
  let isResizing = $state(false);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const dd = (e.currentTarget as HTMLElement).parentElement!;
    const rect = dd.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;

    function onMove(ev: MouseEvent) {
      const newW = Math.max(150, startW + (ev.clientX - startX));
      const newH = Math.max(80, Math.min(500, startH + (ev.clientY - startY)));
      dropdownSize = { w: newW, h: newH };
    }

    function onUp() {
      isResizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  interface Suggestion {
    label: string;
    detail: string;
    insertText: string; // e.g. "{{varName}}"
    hasArgs?: boolean;   // if true, cursor is placed before the closing }}
    namespace?: string;  // namespace group for visual badge
  }

  const variables = $derived(activeVariablesList());

  let query = $state('');

  const suggestions = $derived.by(() => {
    if (!showDropdown) return [];
    const q = query.toLowerCase();

    const varItems: Suggestion[] = variables
      .filter(v => !q || v.key.toLowerCase().includes(q))
      .map(v => ({
        label: v.key,
        detail: v.isSecret ? '******' : v.value,
        insertText: `{{${v.key}}}`,
      }));

    // For mock variables: if the query looks like a namespace prefix (e.g. "$hash."),
    // prioritize showing only that namespace's functions
    const namespacePrefixMatch = q.match(/^\$(\w+)\.$/);

    const mockItems: Suggestion[] = MOCK_VARIABLES
      .filter(v => {
        if (namespacePrefixMatch) {
          return v.name.toLowerCase().startsWith(q);
        }
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

    // When filtering by namespace prefix, show namespace matches first
    if (namespacePrefixMatch) {
      return [...mockItems, ...varItems].slice(0, 30);
    }

    return [...varItems, ...mockItems].slice(0, 30);
  });

  function detectTrigger(el: HTMLInputElement) {
    const pos = el.selectionStart ?? el.value.length;
    const textBefore = el.value.slice(0, pos);

    // Find the last `{{` that doesn't have a closing `}}`
    const lastOpen = textBefore.lastIndexOf('{{');
    if (lastOpen === -1) return null;

    const afterOpen = textBefore.slice(lastOpen + 2);
    // If there's a `}}` after the `{{`, it's already closed
    if (afterOpen.includes('}}')) return null;

    return { start: lastOpen, query: afterOpen };
  }

  function handleInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    oninput?.(el.value);

    const trigger = detectTrigger(el);
    if (trigger) {
      triggerStart = trigger.start;
      query = trigger.query;
      showDropdown = true;
      selectedIndex = 0;
    } else {
      showDropdown = false;
      selectedIndex = -1;
    }
  }

  function selectSuggestion(s: Suggestion) {
    if (!inputElement) return;
    const pos = inputElement.selectionStart ?? inputElement.value.length;
    // Replace from triggerStart to current cursor with the insertText
    const before = inputElement.value.slice(0, triggerStart);
    const after = inputElement.value.slice(pos);
    const newValue = before + s.insertText + after;
    oninput?.(newValue);
    showDropdown = false;
    selectedIndex = -1;

    // For functions with args, place cursor before the closing }}
    // so the user can type the argument immediately
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

  function handleKeyDown(e: KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) {
      onkeydown?.(e);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
      scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollToSelected();
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      showDropdown = false;
      selectedIndex = -1;
    } else if (e.key === 'Tab' && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else {
      onkeydown?.(e);
    }
  }

  function handleBlur() {
    setTimeout(() => {
      if (isResizing) return;
      showDropdown = false;
      selectedIndex = -1;
    }, 150);
  }

  function scrollToSelected() {
    tick().then(() => {
      const el = inputElement?.parentElement?.querySelector('.var-dropdown .var-item.selected');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
</script>

<div class="var-autocomplete-wrapper">
  <input
    bind:this={inputElement}
    type="text"
    class="var-input"
    {placeholder}
    {value}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    onblur={handleBlur}
  />

  {#if showDropdown && suggestions.length > 0}
    {@const sz = dropdownSize}
    <div class="var-dropdown" role="listbox" style={sz ? `max-height:${sz.h}px;width:${sz.w}px` : ''}>
      {#each suggestions as s, i}
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
        <div
          class="var-item"
          class:selected={i === selectedIndex}
          role="option"
          tabindex="-1"
          aria-selected={i === selectedIndex}
          onmousedown={(e) => {
            e.preventDefault();
            selectSuggestion(s);
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
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-grip" onmousedown={startResize}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M14 2v12H2z" opacity="0.5"/><path d="M14 7v7H7z"/></svg>
      </div>
    </div>
  {/if}
</div>

<style>
  .var-autocomplete-wrapper {
    position: relative;
    width: 100%;
    flex: 1;
    min-width: 0;
  }

  .var-input {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .var-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .var-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .var-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 100%;
    z-index: 1000;
    max-height: 180px;
    overflow-y: auto;
    overflow-x: hidden;
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

  .resize-grip {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    height: 0;
    pointer-events: none;
  }

  .resize-grip svg {
    pointer-events: auto;
    cursor: nwse-resize;
    color: var(--hf-descriptionForeground);
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .resize-grip svg:hover {
    opacity: 1;
  }
</style>
