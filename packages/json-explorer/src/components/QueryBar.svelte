<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { filterByQuery } from '../lib/query-parser';
  import { explorerState, navigateToBreadcrumb, setQueryMatchPaths, setQueryCurrentPath } from '../stores/jsonExplorer.svelte';
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    onClose?: () => void;
    onToggleHelp?: () => void;
    helpActive?: boolean;
  }
  let { onClose, onToggleHelp, helpActive = false }: Props = $props();

  let inputEl = $state<HTMLInputElement>(undefined!);
  let query = $state('');
  let error = $state<string | null>(null);
  // Each entry: the array index of the matched item + specific field paths that matched.
  let matchEntries = $state<Array<{ arrayIndex: number; fieldPaths: string[] }>>([]);
  let matchedResults = $state<any[]>([]);
  let currentMatchIdx = $state(0);
  let showCopied = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Autocomplete state
  let suggestions = $state<string[]>([]);
  let suggestionIndex = $state(-1);
  let acTokenStart = $state(0);
  let acTokenEnd = $state(0);

  const COMPARISON_OPS = ['=', '!=', '>', '<', '>=', '<=', '~', 'contains', 'startsWith', 'endsWith'];
  const LOGICAL_OPS = ['AND', 'OR', 'NOT'];
  const COMPARISON_OPS_LOWER = new Set(COMPARISON_OPS.map(op => op.toLowerCase()));
  const ALL_KEYWORDS_LOWER = new Set([...COMPARISON_OPS_LOWER, ...LOGICAL_OPS.map(k => k.toLowerCase()), '(', ')']);

  function getFieldNames(): string[] {
    const json = explorerState().rawJson;
    if (json === undefined) return [];
    const data = Array.isArray(json) ? json : [json];
    const keys = new Set<string>();
    for (const item of data.slice(0, 10)) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        for (const key of Object.keys(item)) keys.add(key);
      }
    }
    return [...keys].sort();
  }

  /** Minimal tokenizer used only for autocomplete context detection. */
  function tokenizeSimple(text: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < text.length) {
      if (/\s/.test(text[i])) { i++; continue; }
      if (text[i] === '"') {
        let str = '"';
        i++;
        while (i < text.length && text[i] !== '"') { str += text[i++]; }
        str += i < text.length ? '"' : '';
        i++;
        tokens.push(str);
      } else if (text[i] === '!' && text[i + 1] === '=') {
        tokens.push('!='); i += 2;
      } else if ((text[i] === '>' || text[i] === '<') && text[i + 1] === '=') {
        tokens.push(text[i] + '='); i += 2;
      } else if (/[=~<>()]/.test(text[i])) {
        tokens.push(text[i]); i++;
      } else {
        let word = '';
        while (i < text.length && !/[\s()"=!<>~]/.test(text[i])) { word += text[i++]; }
        if (word) tokens.push(word);
      }
    }
    return tokens;
  }

  function updateSuggestions() {
    const cursorPos = inputEl?.selectionStart ?? query.length;
    const before = query.slice(0, cursorPos);

    // Don't suggest inside a string literal.
    const quoteCount = (before.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) { suggestions = []; return; }

    // Find current token at cursor.
    const beforeTokenMatch = before.match(/(\S*)$/);
    const currentToken = beforeTokenMatch ? beforeTokenMatch[1] : '';
    const tokenStart = cursorPos - currentToken.length;
    const afterMatch = query.slice(cursorPos).match(/^(\S*)/);
    const tokenEnd = cursorPos + (afterMatch ? afterMatch[1].length : 0);

    acTokenStart = tokenStart;
    acTokenEnd = tokenEnd;

    // Tokens before the current word.
    const beforeCurrent = query.slice(0, tokenStart).trim();
    const prevTokens = tokenizeSimple(beforeCurrent);
    const lastToken = (prevTokens[prevTokens.length - 1] ?? '').toLowerCase();

    // After a comparison operator → user is typing a value, no suggestions.
    if (COMPARISON_OPS_LOWER.has(lastToken)) {
      suggestions = [];
      suggestionIndex = -1;
      return;
    }

    // After a string/number/boolean/null value or closing paren → suggest AND / OR.
    const isCompletedValue =
      lastToken.startsWith('"') ||
      /^-?\d/.test(lastToken) ||
      lastToken === 'true' || lastToken === 'false' || lastToken === 'null';
    const isCloseParen = lastToken === ')';
    if (isCompletedValue || isCloseParen) {
      const filtered = LOGICAL_OPS.filter(op => op.toLowerCase().startsWith(currentToken.toLowerCase()));
      suggestions = filtered;
      suggestionIndex = -1;
      return;
    }

    // After a field name (non-keyword, non-empty) → suggest operators.
    if (lastToken && !ALL_KEYWORDS_LOWER.has(lastToken)) {
      const filtered = COMPARISON_OPS.filter(op => op.toLowerCase().startsWith(currentToken.toLowerCase()));
      suggestions = filtered;
      suggestionIndex = -1;
      return;
    }

    // At the start, after AND / OR / NOT / open-paren → suggest field names (+ logical ops if not at start).
    const fieldNames = getFieldNames();
    const extras = prevTokens.length > 0 ? LOGICAL_OPS : [];
    const all = [...fieldNames, ...extras];
    const filtered = all.filter(s => s.toLowerCase().startsWith(currentToken.toLowerCase()));
    suggestions = filtered;
    suggestionIndex = -1;
  }

  function applySuggestion(suggestion: string) {
    const before = query.slice(0, acTokenStart);
    const after = query.slice(acTokenEnd);
    const needsTrailingSpace = after.length === 0 || after[0] !== ' ';
    query = before + suggestion + (needsTrailingSpace ? ' ' : '');
    suggestions = [];
    suggestionIndex = -1;
    const newPos = before.length + suggestion.length + (needsTrailingSpace ? 1 : 0);
    // Update suggestions for the new cursor position after applying.
    setTimeout(() => {
      inputEl?.setSelectionRange(newPos, newPos);
      inputEl?.focus();
      updateSuggestions();
    }, 0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runQuery, 400);
  }

  onMount(() => {
    inputEl?.focus();
  });

  onDestroy(() => {
    setQueryMatchPaths(new Set());
    setQueryCurrentPath(null);
  });

  function runQuery() {
    if (!query.trim()) {
      error = null;
      matchEntries = [];
      currentMatchIdx = 0;
      setQueryMatchPaths(new Set());
      setQueryCurrentPath(null);
      return;
    }

    const json = explorerState().rawJson;
    if (json === undefined) return;

    const isRootArray = Array.isArray(json);
    const data = isRootArray ? json : [json];
    const result = filterByQuery(data, query);
    error = result.error;

    if (!result.error && result.results.length > 0) {
      const entries: Array<{ arrayIndex: number; fieldPaths: string[] }> = [];
      const allFieldPaths = new Set<string>();

      for (let i = 0; i < data.length; i++) {
        if (!result.results.includes(data[i])) continue;
        const basePath = isRootArray ? `$[${i}]` : '$';
        const fields = result.matchFields.get(data[i]) ?? [];
        const fieldPaths = fields.map(f => `${basePath}.${f}`);
        // Fall back to the parent path if no specific fields were resolved.
        const paths = fieldPaths.length > 0 ? fieldPaths : [basePath];
        entries.push({ arrayIndex: i, fieldPaths: paths });
        // Highlight the parent item row in both tree and table views.
        allFieldPaths.add(basePath);
      }

      matchEntries = entries;
      matchedResults = result.results;
      currentMatchIdx = 0;
      setQueryMatchPaths(allFieldPaths);
      if (entries.length > 0) navigateToMatch(0);
    } else {
      matchEntries = [];
      matchedResults = [];
      currentMatchIdx = 0;
      setQueryMatchPaths(new Set());
      setQueryCurrentPath(null);
    }
  }

  function navigateToMatch(idx: number) {
    if (matchEntries.length === 0) return;
    currentMatchIdx = idx;
    const entry = matchEntries[idx];
    const basePath = `$[${entry.arrayIndex}]`;
    const fieldPath = entry.fieldPaths[0] ?? basePath;
    // Amber highlight stays on the parent item row.
    setQueryCurrentPath(basePath);
    // Blue selection + auto-expand scrolls to the specific matching field.
    navigateToBreadcrumb(fieldPath);
  }

  function nextMatch() {
    if (matchEntries.length === 0) return;
    const next = (currentMatchIdx + 1) % matchEntries.length;
    navigateToMatch(next);
  }

  function prevMatch() {
    if (matchEntries.length === 0) return;
    const prev = (currentMatchIdx - 1 + matchEntries.length) % matchEntries.length;
    navigateToMatch(prev);
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    updateSuggestions();
    debounceTimer = setTimeout(runQuery, 400);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length - 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        suggestionIndex = Math.max(suggestionIndex - 1, -1);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && suggestionIndex >= 0)) {
        e.preventDefault();
        applySuggestion(suggestions[suggestionIndex >= 0 ? suggestionIndex : 0]);
        return;
      }
      if (e.key === 'Escape') {
        suggestions = [];
        suggestionIndex = -1;
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      if (matchEntries.length > 0 && query === inputEl.value) {
        if (e.shiftKey) prevMatch();
        else nextMatch();
      } else {
        runQuery();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  }

  function handleBlur() {
    // Delay so mousedown on a suggestion fires before blur clears the list.
    setTimeout(() => {
      suggestions = [];
      suggestionIndex = -1;
    }, 150);
  }

  async function handleExportResults() {
    if (matchedResults.length === 0) return;
    const json = JSON.stringify(matchedResults, null, 2);
    await copyToClipboard(json);
    showCopied = true;
    setTimeout(() => { showCopied = false; }, 1500);
  }

  function handleClear() {
    query = '';
    error = null;
    matchEntries = [];
    matchedResults = [];
    currentMatchIdx = 0;
    suggestions = [];
    suggestionIndex = -1;
    setQueryMatchPaths(new Set());
    setQueryCurrentPath(null);
    inputEl?.focus();
  }
</script>

<div class="query-bar">
  <div class="query-input-wrapper">
    <div class="query-input-container" class:error={!!error}>
      <i class="codicon codicon-terminal query-icon"></i>
      <input
        bind:this={inputEl}
        bind:value={query}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        type="text"
        class="query-input"
        placeholder={'Query (e.g., age > 30 AND name ~ "john")'}
        spellcheck={false}
        autocomplete="off"
      />
      {#if query}
        <button class="input-btn" onclick={handleClear} aria-label="Clear query">
          <i class="codicon codicon-close"></i>
        </button>
      {/if}
    </div>

    {#if suggestions.length > 0}
      <div class="ac-dropdown" role="listbox" aria-label="Autocomplete suggestions">
        {#each suggestions as suggestion, i}
          <div
            class="ac-item"
            class:ac-item-selected={i === suggestionIndex}
            class:ac-item-operator={COMPARISON_OPS.includes(suggestion)}
            class:ac-item-logical={LOGICAL_OPS.includes(suggestion)}
            role="option"
            aria-selected={i === suggestionIndex}
            onmousedown={(e) => { e.preventDefault(); applySuggestion(suggestion); }}
          >
            <span class="ac-label">{suggestion}</span>
            {#if COMPARISON_OPS.includes(suggestion)}
              <span class="ac-kind">operator</span>
            {:else if LOGICAL_OPS.includes(suggestion)}
              <span class="ac-kind">logical</span>
            {:else}
              <span class="ac-kind">field</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if matchEntries.length > 0 && !error}
    <span class="result-badge">{currentMatchIdx + 1} of {matchEntries.length}</span>
    <Tooltip text="Previous match (Shift+Enter)">
      <button class="nav-btn" onclick={prevMatch} aria-label="Previous match">
        <i class="codicon codicon-arrow-up"></i>
      </button>
    </Tooltip>
    <Tooltip text="Next match (Enter)">
      <button class="nav-btn" onclick={nextMatch} aria-label="Next match">
        <i class="codicon codicon-arrow-down"></i>
      </button>
    </Tooltip>
    <Tooltip text="Copy filtered results as JSON">
      <button class="nav-btn" onclick={handleExportResults} aria-label="Copy results">
        <i class="codicon {showCopied ? 'codicon-check' : 'codicon-copy'}"></i>
      </button>
    </Tooltip>
  {:else if query && !error}
    <span class="result-badge no-results">No matches</span>
  {/if}

  {#if error}
    <Tooltip text={error}>
      <span class="error-badge">
        <i class="codicon codicon-error"></i> Error
      </span>
    </Tooltip>
  {/if}

  <Tooltip text="Query help">
    <button class="nav-btn" onclick={() => onToggleHelp?.()} aria-label="Query help">
      <i class="codicon codicon-question help-icon" class:active={helpActive}></i>
    </button>
  </Tooltip>

  <button class="close-btn" onclick={() => onClose?.()} aria-label="Close query">
    <i class="codicon codicon-close"></i>
  </button>
</div>

<style>
  .query-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
    flex-shrink: 0;
  }

  .query-input-wrapper {
    position: relative;
    flex: 1;
    max-width: 500px;
  }

  .query-input-container {
    display: flex;
    align-items: center;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    padding: 0 4px;
  }

  .query-input-container:focus-within {
    border-color: var(--hf-focusBorder);
  }

  .query-input-container.error {
    border-color: var(--hf-inputValidation-errorBorder);
  }

  .query-icon {
    font-size: 12px;
    color: var(--hf-input-placeholderForeground);
    flex-shrink: 0;
  }

  .query-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--hf-input-foreground);
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
    padding: 3px 4px;
    min-width: 100px;
  }

  .query-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .input-btn {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    font-size: 12px;
  }

  .input-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  /* Autocomplete dropdown */
  .ac-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    background: var(--hf-dropdown-background, var(--hf-editor-background));
    border: 1px solid var(--hf-focusBorder);
    border-radius: 3px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
  }

  .ac-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    cursor: pointer;
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
    color: var(--hf-foreground);
    gap: 8px;
  }

  .ac-item:hover,
  .ac-item-selected {
    background: var(--hf-list-hoverBackground, var(--hf-toolbar-hoverBackground));
  }

  .ac-item-selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground, var(--hf-foreground));
  }

  .ac-label {
    font-weight: 500;
  }

  .ac-kind {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
  }

  .ac-item-operator .ac-kind {
    color: var(--hf-symbolIcon-operatorForeground, #d4a07a);
  }

  .ac-item-logical .ac-kind {
    color: var(--hf-symbolIcon-keywordForeground, #569cd6);
  }

  .result-badge {
    padding: 3px 10px;
    background: var(--hf-focusBorder);
    color: #ffffff;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--hf-editor-font-family);
    white-space: nowrap;
  }

  .result-badge.no-results {
    background: var(--hf-inputValidation-errorBackground);
    color: var(--hf-inputValidation-errorForeground);
  }

  .error-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    background: var(--hf-inputValidation-errorBackground);
    color: var(--hf-inputValidation-errorForeground);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
    cursor: help;
  }

  .nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
  }

  .nav-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .help-icon {
    font-size: 14px;
    color: var(--hf-descriptionForeground);
  }

  .help-icon.active {
    color: var(--hf-focusBorder);
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
  }

  .close-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }
</style>
