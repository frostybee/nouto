<script lang="ts">
  import { request, setMethod, setUrl, setHeaders, setParams, setAuth, setBody, isLoading, downloadProgress, formatBytes, type HttpMethod } from '../../stores';
  import { setUrlAndParams, setPathParams } from '../../stores/request';
  import { resolveRequestVariables } from '../../lib/http-helpers';
  import { ui } from '../../stores/ui';
  import { postMessage as vsCodePostMessage } from '../../lib/vscode';
  import { tick } from 'svelte';
  import { getUnresolvedVariables, activeVariables, activeVariablesList } from '../../stores/environment';
  import { MOCK_VARIABLES } from '../../lib/value-transforms';
  import type { ActiveVariableEntry } from '../../stores/environment';
  import { validateUrl, isIncompleteUrl, suggestUrlFix, STANDARD_HTTP_METHODS } from '@hivefetch/core';
  import { settings, resolvedShortcuts } from '../../stores/settings';
  import { matchesBinding, bindingToDisplayString } from '../../lib/shortcuts';
  import { parseCurl, isCurlCommand } from '@hivefetch/core';
  import { wsStatus } from '../../stores/websocket';
  import { sseStatus } from '../../stores/sse';
  import { parseUrlParams, buildDisplayUrl, mergeParams, parsePathParams, generateId } from '@hivefetch/core';
  import Tooltip from '../shared/Tooltip.svelte';
  import VariableIndicator from '../shared/VariableIndicator.svelte';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import type { OutgoingMessage } from '@hivefetch/transport/messages';

  interface Props {
    postMessage?: (message: OutgoingMessage) => void;
  }
  let { postMessage }: Props = $props();

  // Use provided postMessage or fallback to VSCode postMessage (for VSCode extension)
  const messageBus = $derived(postMessage || vsCodePostMessage);

  const standardMethods: HttpMethod[] = [...STANDARD_HTTP_METHODS];

  // Custom method UI state
  let showMethodDropdown = $state(false);
  let isAddingCustomMethod = $state(false);
  let customMethodInput = $state('');
  let customMethodInputEl: HTMLInputElement;
  let methodDropdownEl: HTMLDivElement;
  let customMethods = $state<string[]>([]);

  // Build the full method list: standard + user-added custom methods
  // Also include the current method if it's not already in the list (e.g. loaded from a saved request)
  const methods = $derived.by(() => {
    const all = [...standardMethods, ...customMethods];
    const current = $request.method;
    if (current && !all.includes(current)) {
      all.push(current);
    }
    return all;
  });

  let urlInput: HTMLInputElement;
  let validationError = $state<string | null>(null);
  let urlSuggestion = $state<string | null>(null);
  let hasBlurred = $state(false);

  // Local input state and focus tracking for bidirectional URL ↔ params sync
  let inputValue = $state('');
  let isFocused = $state(false);

  // Variable autocomplete state (triggered by typing `{{`)
  let showVarDropdown = $state(false);
  let varSelectedIndex = $state(-1);
  let varTriggerStart = $state(-1);
  let varQuery = $state('');

  interface VarSuggestion {
    label: string;
    detail: string;
    insertText: string;
  }

  const varVariables = $derived($activeVariablesList);

  const varSuggestions = $derived.by(() => {
    if (!showVarDropdown) return [];
    const q = varQuery.toLowerCase();

    const varItems: VarSuggestion[] = varVariables
      .filter(v => !q || v.key.toLowerCase().includes(q))
      .map(v => ({
        label: v.key,
        detail: v.isSecret ? '******' : v.value,
        insertText: `{{${v.key}}}`,
      }));

    const mockItems: VarSuggestion[] = MOCK_VARIABLES
      .filter(v => !q || v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q))
      .map(v => ({
        label: v.name,
        detail: v.description,
        insertText: `{{${v.name}}}`,
      }));

    return [...varItems, ...mockItems].slice(0, 30);
  });

  function detectVarTrigger(el: HTMLInputElement) {
    const pos = el.selectionStart ?? el.value.length;
    const textBefore = el.value.slice(0, pos);
    const lastOpen = textBefore.lastIndexOf('{{');
    if (lastOpen === -1) return null;
    const afterOpen = textBefore.slice(lastOpen + 2);
    if (afterOpen.includes('}}')) return null;
    return { start: lastOpen, query: afterOpen };
  }

  function selectVarSuggestion(s: VarSuggestion) {
    if (!urlInput) return;
    const pos = urlInput.selectionStart ?? urlInput.value.length;
    const before = inputValue.slice(0, varTriggerStart);
    const after = inputValue.slice(pos);
    const newValue = before + s.insertText + after;

    // Update inputValue and propagate through URL parsing
    inputValue = newValue;
    const { baseUrl, params: parsedParams } = parseUrlParams(newValue);
    const merged = mergeParams($request.params, parsedParams);
    setUrlAndParams(baseUrl, merged);

    showVarDropdown = false;
    varSelectedIndex = -1;

    const newPos = before.length + s.insertText.length;
    tick().then(() => {
      if (urlInput) {
        urlInput.value = newValue;
        urlInput.setSelectionRange(newPos, newPos);
        urlInput.focus();
      }
    });
  }

  function scrollToVarSelected() {
    tick().then(() => {
      const el = urlInput?.parentElement?.querySelector('.url-var-dropdown .url-var-item.selected');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  const methodColors: Record<string, string> = {
    GET: '#61affe',
    POST: '#49cc90',
    PUT: '#fca130',
    PATCH: '#50e3c2',
    DELETE: '#f93e3e',
    HEAD: '#9012fe',
    OPTIONS: '#0d5aa7',
  };

  function getMethodColor(method: string): string {
    return methodColors[method] || '#999';
  }

  const currentMethod = $derived($request.method);
  const currentUrl = $derived($request.url);
  const currentParams = $derived($request.params);
  const loading = $derived($isLoading);
  const connectionMode = $derived($ui.connectionMode);
  const currentWsStatus = $derived($wsStatus);
  const currentSseStatus = $derived($sseStatus);
  const isWsConnected = $derived(currentWsStatus === 'connected' || currentWsStatus === 'connecting');
  const isSseConnected = $derived(currentSseStatus === 'connected' || currentSseStatus === 'connecting');

  // Full display URL = base URL + enabled query params
  const displayUrl = $derived(buildDisplayUrl(currentUrl, currentParams));

  // Sync displayUrl → inputValue when input is NOT focused
  // Covers: params changed in Query tab, request loaded, etc.
  $effect(() => {
    const url = displayUrl;
    if (!isFocused || !inputValue) {
      inputValue = url;
    }
  });

  // Check for unresolved variables in the URL, params, and auth fields
  const unresolvedVars = $derived.by(() => {
    const vars = $activeVariables;
    const found = new Set(getUnresolvedVariables(displayUrl, vars));
    const auth = $request.auth;
    if (auth) {
      for (const val of [auth.token, auth.username, auth.password, auth.apiKeyName, auth.apiKeyValue]) {
        if (val) for (const v of getUnresolvedVariables(val, vars)) found.add(v);
      }
    }
    return [...found];
  });

  // Validate base URL when it changes (but only show error after blur or send attempt)
  $effect(() => {
    if (currentUrl) {
      const result = validateUrl(currentUrl);
      if (!result.valid && hasBlurred && !isIncompleteUrl(currentUrl)) {
        validationError = result.error || 'Invalid URL';
      } else {
        validationError = null;
      }

      const suggestion = suggestUrlFix(currentUrl);
      if (suggestion && $settings.autoCorrectUrls) {
        // Auto-correct: apply fix silently
        setUrl(suggestion);
        urlSuggestion = null;
      } else {
        // Interactive: show suggestion
        urlSuggestion = suggestion;
      }
    } else {
      validationError = null;
      urlSuggestion = null;
    }
  });

  function selectMethod(method: HttpMethod) {
    setMethod(method);
    showMethodDropdown = false;
    isAddingCustomMethod = false;
  }

  function startAddingCustomMethod() {
    isAddingCustomMethod = true;
    customMethodInput = '';
    tick().then(() => customMethodInputEl?.focus());
  }

  function confirmCustomMethod() {
    const trimmed = customMethodInput.trim().toUpperCase();
    if (trimmed && /^[A-Z][A-Z0-9\-_]*$/.test(trimmed)) {
      if (!standardMethods.includes(trimmed) && !customMethods.includes(trimmed)) {
        customMethods = [...customMethods, trimmed];
      }
      setMethod(trimmed);
    }
    isAddingCustomMethod = false;
    showMethodDropdown = false;
    customMethodInput = '';
  }

  function removeCustomMethod(method: string) {
    customMethods = customMethods.filter(m => m !== method);
    // If the removed method was active, fall back to GET
    if ($request.method === method) {
      setMethod('GET');
    }
  }

  function cancelCustomMethod() {
    isAddingCustomMethod = false;
    showMethodDropdown = false;
    customMethodInput = '';
  }

  function handleMethodDropdownClick() {
    showMethodDropdown = !showMethodDropdown;
    isAddingCustomMethod = false;
  }

  function handleMethodDropdownBlur(event: FocusEvent) {
    const related = event.relatedTarget as HTMLElement | null;
    if (related && methodDropdownEl?.contains(related)) return;
    // Delay to allow click events on dropdown items to fire first
    setTimeout(() => {
      if (methodDropdownEl?.contains(document.activeElement)) return;
      showMethodDropdown = false;
      isAddingCustomMethod = false;
    }, 150);
  }

  function handleUrlChange(event: Event) {
    const target = event.target as HTMLInputElement;
    inputValue = target.value;

    // Parse typed URL into base + query params
    const { baseUrl, params: parsedParams } = parseUrlParams(inputValue);

    // Merge with existing params (preserves disabled ones, reuses IDs)
    const merged = mergeParams($request.params, parsedParams);

    // Atomic update to prevent intermediate states
    setUrlAndParams(baseUrl, merged);

    // Auto-sync path params from URL template placeholders
    // Use strict sync (not mergePathParams) to avoid keeping stale partial params
    // as the user types (e.g., :n → :na → :nam → :name)
    const pathNames = parsePathParams(baseUrl);
    const syncedPathParams = pathNames.map(name => {
      const existing = $request.pathParams.find(p => p.key === name);
      return existing || { id: generateId(), key: name, value: '', description: '', enabled: true };
    });
    // Keep manually-added params that have actual content (value or description)
    for (const param of $request.pathParams) {
      if (!pathNames.includes(param.key) && !syncedPathParams.some(p => p.id === param.id) && (param.value || param.description)) {
        syncedPathParams.push(param);
      }
    }
    if (syncedPathParams.length !== $request.pathParams.length ||
        syncedPathParams.some((p, i) => p.key !== $request.pathParams[i]?.key)) {
      setPathParams(syncedPathParams);
    }

    // Clear validation error while typing
    if (validationError && isIncompleteUrl(baseUrl)) {
      validationError = null;
    }

    // Detect `{{` trigger for variable autocomplete
    const trigger = detectVarTrigger(target);
    if (trigger) {
      varTriggerStart = trigger.start;
      varQuery = trigger.query;
      showVarDropdown = true;
      varSelectedIndex = 0;
    } else {
      showVarDropdown = false;
      varSelectedIndex = -1;
    }
  }

  function handleUrlBlur() {
    isFocused = false;
    hasBlurred = true;
    // Normalize input to canonical display URL
    inputValue = buildDisplayUrl($request.url, $request.params);
    // Close variable dropdown with delay (allow click on dropdown items)
    setTimeout(() => {
      showVarDropdown = false;
      varSelectedIndex = -1;
    }, 150);
  }

  function handleUrlFocus() {
    isFocused = true;
    // Clear validation error on focus to give user a fresh start
    validationError = null;
  }

  function applySuggestion() {
    if (urlSuggestion) {
      setUrl(urlSuggestion);
      urlSuggestion = null;
      validationError = null;
    }
  }

  function handleSend() {
    if (!currentUrl.trim() || loading) {
      return;
    }

    // Validate URL before sending
    const result = validateUrl(currentUrl);
    if (!result.valid) {
      hasBlurred = true;
      validationError = result.error || 'Invalid URL';
      return;
    }

    isLoading.set(true);

    const { url: resolvedUrl, body, auth } = resolveRequestVariables(currentUrl, $request.body, $request.auth, $request.pathParams);

    messageBus({
      type: 'sendRequest',
      data: {
        method: currentMethod,
        url: resolvedUrl,
        templateUrl: currentUrl,
        // Send original arrays for storage, extension will process them
        headers: $request.headers,
        params: $request.params,
        pathParams: $request.pathParams,
        body,
        auth,
        assertions: $request.assertions || [],
        authInheritance: $request.authInheritance,
        scripts: $request.scripts,
        ssl: $request.ssl,
        proxy: $request.proxy,
        timeout: $request.timeout,
        followRedirects: $request.followRedirects,
        maxRedirects: $request.maxRedirects,
      },
    });
  }

  const shortcuts = $derived($resolvedShortcuts);

  const sendTooltip = $derived.by(() => {
    const binding = shortcuts.get('sendRequest');
    return binding ? `Send request (${bindingToDisplayString(binding)})` : 'Send request';
  });

  const cancelTooltip = $derived.by(() => {
    const binding = shortcuts.get('cancelRequest');
    return binding ? `Cancel request (${bindingToDisplayString(binding)})` : 'Cancel request';
  });

  function handleKeydown(event: KeyboardEvent) {
    // Variable autocomplete keyboard handling takes priority
    if (showVarDropdown && varSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        varSelectedIndex = Math.min(varSelectedIndex + 1, varSuggestions.length - 1);
        scrollToVarSelected();
        return;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        varSelectedIndex = Math.max(varSelectedIndex - 1, 0);
        scrollToVarSelected();
        return;
      } else if (event.key === 'Enter' && varSelectedIndex >= 0) {
        event.preventDefault();
        selectVarSuggestion(varSuggestions[varSelectedIndex]);
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        showVarDropdown = false;
        varSelectedIndex = -1;
        return;
      } else if (event.key === 'Tab' && varSelectedIndex >= 0) {
        event.preventDefault();
        selectVarSuggestion(varSuggestions[varSelectedIndex]);
        return;
      }
    }

    const sendBinding = shortcuts.get('sendRequest');
    if (sendBinding && matchesBinding(event, sendBinding)) {
      handleSend();
    }
    const cancelBinding = shortcuts.get('cancelRequest');
    if (cancelBinding && matchesBinding(event, cancelBinding) && loading) {
      handleCancel();
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    const sendBinding = shortcuts.get('sendRequest');
    if (sendBinding && matchesBinding(event, sendBinding)) {
      event.preventDefault();
      handleSend();
    }
    const cancelBinding = shortcuts.get('cancelRequest');
    if (cancelBinding && matchesBinding(event, cancelBinding) && loading) {
      handleCancel();
    }
    // Focus URL bar (configurable shortcut)
    const focusBinding = shortcuts.get('focusUrl');
    if (focusBinding && matchesBinding(event, focusBinding)) {
      event.preventDefault();
      urlInput?.focus();
      urlInput?.select();
    }
    // Ctrl+I to accept URL suggestion
    if (event.key === 'i' && (event.ctrlKey || event.metaKey) && urlSuggestion) {
      event.preventDefault();
      applySuggestion();
    }
  }

  function handleCancel() {
    messageBus({ type: 'cancelRequest' });
    isLoading.set(false);
  }

  function handlePaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text');
    if (text && isCurlCommand(text)) {
      event.preventDefault();
      try {
        const parsed = parseCurl(text);
        setMethod(parsed.method);
        setUrlAndParams(parsed.url, parsed.params.length > 0 ? parsed.params : $request.params);
        if (parsed.headers.length > 0) {
          setHeaders(parsed.headers);
        }
        if (parsed.auth.type !== 'none') {
          setAuth(parsed.auth);
        }
        if (parsed.body.type !== 'none') {
          setBody(parsed.body);
        }
      } catch (err) {
        // If parsing fails, let the default paste behavior handle it
        console.warn('[HiveFetch] cURL parse failed, using raw paste:', err);
        const { baseUrl, params } = parseUrlParams(text);
        setUrlAndParams(baseUrl, params);
      }
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="url-bar">
  {#if connectionMode === 'http'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="method-dropdown-wrapper" bind:this={methodDropdownEl} onfocusout={handleMethodDropdownBlur}>
      <button
        class="method-select"
        style="--method-color: {getMethodColor(currentMethod)}"
        onclick={handleMethodDropdownClick}
        type="button"
      >
        {currentMethod}
        <span class="method-chevron" class:open={showMethodDropdown}>&#9662;</span>
      </button>
      {#if showMethodDropdown}
        <div class="method-dropdown" role="listbox">
          {#each standardMethods as method}
            <button
              class="method-option"
              class:selected={method === currentMethod}
              style="color: {getMethodColor(method)}"
              role="option"
              aria-selected={method === currentMethod}
              onclick={() => selectMethod(method)}
              type="button"
            >
              {method}
            </button>
          {/each}
          {#if customMethods.length > 0}
            <div class="method-separator"></div>
            {#each customMethods as method}
              <div class="method-option-row">
                <button
                  class="method-option"
                  class:selected={method === currentMethod}
                  style="color: {getMethodColor(method)}"
                  role="option"
                  aria-selected={method === currentMethod}
                  onclick={() => selectMethod(method)}
                  type="button"
                >
                  {method}
                </button>
                <Tooltip text="Remove custom method" position="top">
                  <button
                    class="method-remove"
                    onclick={(e) => { e.stopPropagation(); removeCustomMethod(method); }}
                    type="button"
                  >&times;</button>
                </Tooltip>
              </div>
            {/each}
          {/if}
          <div class="method-separator"></div>
          {#if isAddingCustomMethod}
            <div class="method-custom-input-row">
              <input
                bind:this={customMethodInputEl}
                class="method-custom-input"
                type="text"
                placeholder="METHOD"
                maxlength="20"
                bind:value={customMethodInput}
                onkeydown={(e) => {
                  if (e.key === 'Enter') confirmCustomMethod();
                  else if (e.key === 'Escape') cancelCustomMethod();
                }}
              />
              <button class="method-custom-confirm" onclick={confirmCustomMethod} type="button">OK</button>
            </div>
          {:else}
            <button class="method-option method-add-custom" onclick={startAddingCustomMethod} type="button">
              Custom...
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <div class="url-input-wrapper">
    <input
      bind:this={urlInput}
      type="text"
      class="url-input"
      class:invalid={validationError}
      placeholder={connectionMode === 'websocket' ? 'ws://localhost:8080' : connectionMode === 'sse' ? 'https://api.example.com/events' : 'Enter request URL...'}
      value={inputValue}
      oninput={handleUrlChange}
      onkeydown={handleKeydown}
      onblur={handleUrlBlur}
      onfocus={handleUrlFocus}
      onpaste={handlePaste}
    />
    <VariableIndicator text={inputValue} />

    {#if showVarDropdown && varSuggestions.length > 0}
      <div class="url-var-dropdown" role="listbox">
        {#each varSuggestions as s, i}
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
          <div
            class="url-var-item"
            class:selected={i === varSelectedIndex}
            role="option"
            tabindex="-1"
            aria-selected={i === varSelectedIndex}
            onmousedown={(e) => {
              e.preventDefault();
              selectVarSuggestion(s);
            }}
            onmouseenter={() => varSelectedIndex = i}
          >
            <span class="url-var-label">{s.label}</span>
            <span class="url-var-detail">{s.detail}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if connectionMode === 'websocket'}
    {#if isWsConnected}
      <button class="cancel-button" onclick={() => messageBus({ type: 'wsDisconnect' })}>
        Disconnect
      </button>
    {:else}
      <button class="send-button" onclick={() => messageBus({ type: 'wsConnect', data: { url: currentUrl, headers: $request.headers, autoReconnect: false, reconnectIntervalMs: 3000 } })} disabled={!currentUrl.trim()}>
        Connect
      </button>
    {/if}
  {:else if connectionMode === 'sse'}
    {#if isSseConnected}
      <button class="cancel-button" onclick={() => messageBus({ type: 'sseDisconnect' })}>
        Disconnect
      </button>
    {:else}
      <button class="send-button" onclick={() => messageBus({ type: 'sseConnect', data: { url: currentUrl, headers: $request.headers, autoReconnect: true, withCredentials: false } })} disabled={!currentUrl.trim()}>
        Connect
      </button>
    {/if}
  {:else if loading}
    <Tooltip text={cancelTooltip}>
      <button
        class="cancel-button"
        onclick={handleCancel}
      >
        Cancel
      </button>
    </Tooltip>
  {:else}
    <Tooltip text={sendTooltip}>
      <button
        class="send-button"
        onclick={handleSend}
        disabled={!currentUrl.trim()}
      >
        Send
      </button>
    </Tooltip>
  {/if}
  <EnvironmentSelector />
</div>

{#if $isLoading && $downloadProgress}
  <div class="url-progress-bar">
    {#if $downloadProgress.total}
      <div class="url-progress-fill" style="width: {Math.min(100, ($downloadProgress.loaded / $downloadProgress.total) * 100)}%"></div>
    {:else}
      <div class="url-progress-fill url-indeterminate"></div>
    {/if}
  </div>
{/if}

{#if validationError || urlSuggestion}
  <div class="url-feedback">
    {#if validationError}
      <span class="error-message">{validationError}</span>
    {/if}
    {#if urlSuggestion && !validationError}
      <button class="suggestion-btn" onclick={applySuggestion}>
        Did you mean <strong>{urlSuggestion}</strong>?
      </button>
    {/if}
  </div>
{/if}
{#if unresolvedVars.length > 0 && !validationError}
  <div class="url-feedback">
    <span class="warning-message">
      <span class="codicon codicon-warning"></span>
      Unresolved variable{unresolvedVars.length > 1 ? 's' : ''}: {unresolvedVars.map(v => `{{${v}}}`).join(', ')}
    </span>
  </div>
{/if}

<style>
  .url-bar {
    display: flex;
    gap: 8px;
    padding: 12px;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .url-progress-bar {
    height: 2px;
    background: var(--hf-panel-border);
    overflow: hidden;
  }

  .url-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--hf-focusBorder), #a06ef5, #e06cad, var(--hf-focusBorder));
    background-size: 200% 100%;
    transition: width 0.15s ease;
  }

  .url-progress-fill.url-indeterminate {
    width: 30%;
    animation: url-slide 1.2s ease-in-out infinite;
  }

  @keyframes url-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(433%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .url-progress-fill {
      background: var(--hf-focusBorder);
      transition: none;
    }

    .url-progress-fill.url-indeterminate {
      width: 100%;
      animation: none;
    }
  }

  .method-dropdown-wrapper {
    position: relative;
  }

  .method-select {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--hf-dropdown-background);
    color: var(--method-color, var(--hf-dropdown-foreground));
    border: 1px solid var(--hf-dropdown-border);
    min-width: 110px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }

  .method-select:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .method-chevron {
    font-size: 10px;
    margin-left: auto;
    transition: transform 0.15s;
    opacity: 0.7;
  }

  .method-chevron.open {
    transform: rotate(180deg);
  }

  .method-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    min-width: 100%;
    margin-top: 2px;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border, var(--hf-focusBorder));
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .method-option {
    display: block;
    width: 100%;
    padding: 6px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    text-align: left;
  }

  .method-option:hover,
  .method-option.selected {
    background: var(--hf-list-hoverBackground);
  }

  .method-separator {
    height: 1px;
    background: var(--hf-panel-border);
    margin: 2px 0;
  }

  .method-option-row {
    display: flex;
    align-items: center;
  }

  .method-option-row .method-option {
    flex: 1;
  }

  .method-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    font-size: 14px;
    padding: 4px 8px;
    line-height: 1;
    flex-shrink: 0;
  }

  .method-remove:hover {
    color: var(--hf-errorForeground);
  }

  .method-add-custom {
    color: var(--hf-textLink-foreground) !important;
    font-weight: 500;
    font-style: italic;
  }

  .method-custom-input-row {
    display: flex;
    padding: 4px 8px;
    gap: 4px;
  }

  .method-custom-input {
    flex: 1;
    padding: 4px 8px;
    border-radius: 3px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    min-width: 0;
  }

  .method-custom-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .method-custom-confirm {
    padding: 4px 8px;
    border-radius: 3px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }

  .method-custom-confirm:hover {
    background: var(--hf-button-hoverBackground);
  }

  .url-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    position: relative;
  }

  .url-input {
    flex: 1;
    padding: 8px 12px;
    min-width: 0;
    border-radius: 4px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    font-size: 13px;
  }

  .url-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .url-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .url-input.invalid {
    border-color: var(--hf-inputValidation-errorBorder, #f44336);
  }

  .send-button {
    padding: 8px 24px;
    border-radius: 4px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 13px;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .send-button:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-button {
    padding: 8px 24px;
    border-radius: 4px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-errorForeground);
    cursor: pointer;
    font-weight: 500;
    font-size: 13px;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .cancel-button:hover {
    background: var(--hf-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
  }

  .url-feedback {
    padding: 4px 12px 8px;
    background: var(--hf-editor-background);
  }

  .error-message {
    color: var(--hf-errorForeground, #f44336);
    font-size: 12px;
  }

  .suggestion-btn {
    background: transparent;
    border: none;
    color: var(--hf-textLink-foreground);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .suggestion-btn:hover {
    color: var(--hf-textLink-activeForeground);
  }

  .suggestion-btn strong {
    font-weight: 600;
  }

  .warning-message {
    color: var(--hf-editorWarning-foreground, #cca700);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .url-var-dropdown {
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

  .url-var-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-dropdown-foreground);
    cursor: pointer;
  }

  .url-var-item:hover,
  .url-var-item.selected {
    background: var(--hf-list-hoverBackground);
  }

  .url-var-item.selected {
    color: var(--hf-list-activeSelectionForeground);
  }

  .url-var-label {
    flex-shrink: 0;
    font-weight: 600;
  }

  .url-var-detail {
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  .url-var-dropdown::-webkit-scrollbar {
    width: 8px;
  }

  .url-var-dropdown::-webkit-scrollbar-thumb {
    background: var(--hf-scrollbarSlider-background);
    border-radius: 4px;
  }

  .url-var-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--hf-scrollbarSlider-hoverBackground);
  }
</style>
