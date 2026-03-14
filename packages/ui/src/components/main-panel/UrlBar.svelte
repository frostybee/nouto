<script lang="ts">
  import { request, setMethod, setUrl, setHeaders, setParams, setAuth, setBody, isLoading, setLoading, downloadProgress, formatBytes, type HttpMethod } from '../../stores';
  import { setUrlAndParams, setPathParams, resetRequest } from '../../stores/request.svelte';
  import { resolveRequestVariables } from '../../lib/http-helpers';
  import { ui } from '../../stores/ui.svelte';
  import { postMessage as vsCodePostMessage } from '../../lib/vscode';
  import { tick } from 'svelte';
  import { getUnresolvedVariables, activeVariables, activeVariablesList } from '../../stores/environment.svelte';
  import { MOCK_VARIABLES } from '../../lib/value-transforms';
  import type { ActiveVariableEntry } from '../../stores/environment.svelte';
  import { validateUrl, isIncompleteUrl, suggestUrlFix, STANDARD_HTTP_METHODS } from '@hivefetch/core';
  import { clearScriptOutput } from '../../stores/scripts.svelte';
  import { settings, resolvedShortcuts } from '../../stores/settings.svelte';
  import { matchesBinding, bindingToDisplayString } from '../../lib/shortcuts';
  import { parseCurl, isCurlCommand } from '@hivefetch/core';
  import { wsStatus } from '../../stores/websocket.svelte';
  import { sseStatus } from '../../stores/sse.svelte';
  import { gqlSubStatus } from '../../stores/graphqlSubscription.svelte';
  import { parseUrlParams, buildDisplayUrl, mergeParams, parsePathParams, substitutePathParams, generateId } from '@hivefetch/core';
  import Tooltip from '../shared/Tooltip.svelte';
  import VariableIndicator from '../shared/VariableIndicator.svelte';
  import { copyToClipboard } from '../../lib/clipboard';
  import { substituteVariables } from '../../stores/environment.svelte';
  import CollectionSaveButton from '../shared/CollectionSaveButton.svelte';
  import CodegenPanel from '../shared/CodegenPanel.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import type { CodegenRequest } from '@hivefetch/core';
  import type { Collection } from '../../types';
  import type { OutgoingMessage } from '@hivefetch/transport/messages';
  import { historyEntries } from '../../stores/history.svelte';
  import { getScore } from '../../stores/frecency.svelte';
  import { getAllRequests } from '../../stores/collections.svelte';

  interface Props {
    postMessage?: (message: OutgoingMessage) => void;
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    onSaveToCollection: () => void;
    onSaveRequest: () => void;
    onRevertRequest: () => void;
  }
  let { postMessage, collectionId, collectionName, collections, onSaveToCollection, onSaveRequest, onRevertRequest }: Props = $props();

  // Use provided postMessage or fallback to VSCode postMessage (for VSCode extension)
  const messageBus = $derived(postMessage || vsCodePostMessage);

  const standardMethods: HttpMethod[] = [...STANDARD_HTTP_METHODS];

  // Custom method UI state
  let showMethodDropdown = $state(false);
  let isAddingCustomMethod = $state(false);
  let customMethodInput = $state('');
  let customMethodInputEl = $state<HTMLInputElement>(undefined!);
  let methodDropdownEl = $state<HTMLDivElement>(undefined!);
  let customMethods = $state<string[]>([]);

  // Build the full method list: standard + user-added custom methods
  // Also include the current method if it's not already in the list (e.g. loaded from a saved request)
  const methods = $derived.by(() => {
    const all = [...standardMethods, ...customMethods];
    const current = request.method;
    if (current && !all.includes(current)) {
      all.push(current);
    }
    return all;
  });

  let urlInput = $state<HTMLInputElement>(undefined!);
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

  // URL autocomplete state
  let showUrlDropdown = $state(false);
  let urlSelectedIndex = $state(-1);

  interface VarSuggestion {
    label: string;
    detail: string;
    insertText: string;
  }

  const varVariables = $derived(activeVariablesList());

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

  interface UrlSuggestion {
    url: string;
    method: string;
    name: string;
    source: 'collection' | 'history';
    score: number;
  }

  const urlSuggestions = $derived.by(() => {
    if (!showUrlDropdown || showVarDropdown) return [];
    const query = inputValue.toLowerCase().trim();
    if (query.length < 2) return [];
    // Don't show when typing variables
    if (query.includes('{{') && !query.endsWith('}}')) return [];

    const seen = new Map<string, UrlSuggestion>();

    // Collection requests
    for (const col of collections) {
      for (const req of getAllRequests(col.items)) {
        if (!req.url) continue;
        if (!req.url.toLowerCase().includes(query)) continue;
        if (req.url === request.url && req.method === request.method) continue;
        const key = `${req.method}:${req.url}`;
        if (!seen.has(key)) {
          seen.set(key, { url: req.url, method: req.method, name: req.name, source: 'collection', score: getScore(req.id) });
        }
      }
    }

    // History entries
    for (const entry of historyEntries()) {
      if (!entry.url) continue;
      if (!entry.url.toLowerCase().includes(query)) continue;
      const key = `${entry.method}:${entry.url}`;
      if (!seen.has(key)) {
        seen.set(key, { url: entry.url, method: entry.method, name: '', source: 'history', score: 0 });
      }
    }

    return [...seen.values()]
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
      .slice(0, 15);
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
    const merged = mergeParams(request.params, parsedParams);
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

  function selectUrlSuggestion(s: UrlSuggestion) {
    setMethod(s.method as HttpMethod);
    const { baseUrl, params: parsedParams } = parseUrlParams(s.url);
    const merged = mergeParams(request.params, parsedParams);
    setUrlAndParams(baseUrl, merged);
    inputValue = s.url;
    showUrlDropdown = false;
    urlSelectedIndex = -1;
    tick().then(() => urlInput?.focus());
  }

  function scrollToUrlSelected() {
    tick().then(() => {
      const el = urlInput?.parentElement?.querySelector('.url-autocomplete-dropdown .url-autocomplete-item.selected');
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

  const currentMethod = $derived(request.method);
  const currentUrl = $derived(request.url);
  const currentParams = $derived(request.params);
  const loading = $derived(isLoading());
  const connectionMode = $derived(ui.connectionMode);
  const currentWsStatus = $derived(wsStatus());
  const currentSseStatus = $derived(sseStatus());
  const currentGqlSubStatus = $derived(gqlSubStatus());
  const isWsConnected = $derived(currentWsStatus === 'connected' || currentWsStatus === 'connecting');
  const isSseConnected = $derived(currentSseStatus === 'connected' || currentSseStatus === 'connecting');
  const isGqlSubActive = $derived(currentGqlSubStatus === 'connected' || currentGqlSubStatus === 'connecting' || currentGqlSubStatus === 'subscribed');

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
    const vars = activeVariables();
    const found = new Set(getUnresolvedVariables(displayUrl, vars));
    const auth = request.auth;
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
      if (suggestion && settings.autoCorrectUrls) {
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
    if (request.method === method) {
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
    const merged = mergeParams(request.params, parsedParams);

    // Atomic update to prevent intermediate states
    setUrlAndParams(baseUrl, merged);

    // Auto-sync path params from URL template placeholders
    // Use strict sync (not mergePathParams) to avoid keeping stale partial params
    // as the user types (e.g., :n → :na → :nam → :name)
    const pathNames = parsePathParams(baseUrl);
    const syncedPathParams = pathNames.map(name => {
      const existing = request.pathParams.find(p => p.key === name);
      return existing || { id: generateId(), key: name, value: '', description: '', enabled: true };
    });
    // Keep manually-added params that have actual content (value or description)
    for (const param of request.pathParams) {
      if (!pathNames.includes(param.key) && !syncedPathParams.some(p => p.id === param.id) && (param.value || param.description)) {
        syncedPathParams.push(param);
      }
    }
    if (syncedPathParams.length !== request.pathParams.length ||
        syncedPathParams.some((p, i) => p.key !== request.pathParams[i]?.key)) {
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
      // URL autocomplete trigger (only when not in variable mode)
      if (inputValue.trim().length >= 2) {
        showUrlDropdown = true;
        urlSelectedIndex = -1;
      } else {
        showUrlDropdown = false;
      }
    }
  }

  function handleUrlBlur() {
    isFocused = false;
    hasBlurred = true;
    // Normalize input to canonical display URL
    inputValue = buildDisplayUrl(request.url, request.params);
    // Close dropdowns with delay (allow click on dropdown items)
    setTimeout(() => {
      showVarDropdown = false;
      varSelectedIndex = -1;
      showUrlDropdown = false;
      urlSelectedIndex = -1;
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

    setLoading(true);
    clearScriptOutput();

    const { url: resolvedUrl, body, auth, params: resolvedParams, headers: resolvedHeaders, pathParams: resolvedPathParams } = resolveRequestVariables(currentUrl, request.body, request.auth, request.pathParams, request.params, request.headers);

    // Snapshot reactive proxies before postMessage (Svelte 5 $state proxies can't be cloned)
    const data = JSON.parse(JSON.stringify({
      method: currentMethod,
      url: resolvedUrl,
      templateUrl: resolvedPathParams?.length ? substitutePathParams(currentUrl, resolvedPathParams) : currentUrl,
      headers: resolvedHeaders,
      params: resolvedParams,
      pathParams: resolvedPathParams,
      body,
      auth,
      assertions: request.assertions || [],
      authInheritance: request.authInheritance,
      scriptInheritance: request.scriptInheritance,
      scripts: request.scripts,
      ssl: request.ssl,
      proxy: request.proxy,
      timeout: request.timeout ?? settings.defaultTimeout ?? undefined,
      followRedirects: request.followRedirects ?? settings.defaultFollowRedirects ?? undefined,
      maxRedirects: request.maxRedirects ?? settings.defaultMaxRedirects ?? undefined,
    }));

    messageBus({ type: 'sendRequest', data });
  }

  const shortcuts = $derived(resolvedShortcuts());

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

    // URL autocomplete keyboard handling
    if (showUrlDropdown && urlSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        urlSelectedIndex = Math.min(urlSelectedIndex + 1, urlSuggestions.length - 1);
        scrollToUrlSelected();
        return;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        urlSelectedIndex = Math.max(urlSelectedIndex - 1, -1);
        if (urlSelectedIndex === -1) showUrlDropdown = false;
        scrollToUrlSelected();
        return;
      } else if (event.key === 'Enter' && urlSelectedIndex >= 0) {
        event.preventDefault();
        selectUrlSuggestion(urlSuggestions[urlSelectedIndex]);
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        showUrlDropdown = false;
        urlSelectedIndex = -1;
        return;
      } else if (event.key === 'Tab' && urlSelectedIndex >= 0) {
        event.preventDefault();
        selectUrlSuggestion(urlSuggestions[urlSelectedIndex]);
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
    // Re-send request (Alt+R by default)
    const resendBinding = shortcuts.get('resendRequest');
    if (resendBinding && matchesBinding(event, resendBinding)) {
      event.preventDefault();
      handleSend();
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
    setLoading(false);
  }

  let copyUrlState = $state<'idle' | 'copied'>('idle');
  let copyUrlTimer: ReturnType<typeof setTimeout> | undefined;

  function handleCopyResolvedUrl() {
    const fullUrl = buildDisplayUrl(currentUrl, currentParams);
    const resolved = substituteVariables(fullUrl);
    copyToClipboard(resolved);
    copyUrlState = 'copied';
    if (copyUrlTimer) clearTimeout(copyUrlTimer);
    copyUrlTimer = setTimeout(() => { copyUrlState = 'idle'; }, 1500);
  }

  // Send dropdown menu state
  let showSendMenu = $state(false);
  let sendMenuEl = $state<HTMLDivElement>(undefined!);

  function toggleSendMenu(e: MouseEvent) {
    e.stopPropagation();
    showSendMenu = !showSendMenu;
  }

  function closeSendMenu() {
    showSendMenu = false;
  }

  let showCurlImport = $state(false);
  let curlInput = $state('');
  let curlError = $state('');

  function handleImportCurl() {
    showSendMenu = false;
    curlInput = '';
    curlError = '';
    showCurlImport = true;
  }

  function confirmImportCurl() {
    const text = curlInput.trim();
    if (!text) return;
    if (!isCurlCommand(text)) {
      curlError = 'Not a valid cURL command. It should start with "curl".';
      return;
    }
    try {
      const parsed = parseCurl(text);
      setMethod(parsed.method);
      setUrlAndParams(parsed.url, parsed.params.length > 0 ? parsed.params : request.params);
      if (parsed.headers.length > 0) {
        setHeaders(parsed.headers);
      }
      if (parsed.auth.type !== 'none') {
        setAuth(parsed.auth);
      }
      if (parsed.body.type !== 'none') {
        setBody(parsed.body);
      }
      showCurlImport = false;
    } catch (err) {
      curlError = `Failed to parse cURL: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function handleCurlKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showCurlImport = false;
    }
  }

  // Codegen panel state
  let showCodegenPanel = $state(false);

  const sub = substituteVariables;
  const codegenRequest: CodegenRequest = $derived({
    method: request.method,
    url: sub(request.url),
    headers: request.headers.map(h => ({ ...h, key: sub(h.key), value: sub(h.value) })),
    params: request.params.map(p => ({ ...p, key: sub(p.key), value: sub(p.value) })),
    auth: {
      ...request.auth,
      username: request.auth.username ? sub(request.auth.username) : undefined,
      password: request.auth.password ? sub(request.auth.password) : undefined,
      token: request.auth.token ? sub(request.auth.token) : undefined,
      apiKeyName: request.auth.apiKeyName ? sub(request.auth.apiKeyName) : undefined,
      apiKeyValue: request.auth.apiKeyValue ? sub(request.auth.apiKeyValue) : undefined,
    },
    body: {
      ...request.body,
      content: request.body.content ? sub(request.body.content) : request.body.content,
    },
  });

  function handleShowCode() {
    showCodegenPanel = true;
    showSendMenu = false;
  }

  let showClearConfirm = $state(false);

  function handleClearAll() {
    showSendMenu = false;
    showClearConfirm = true;
  }

  function confirmClearAll() {
    resetRequest();
    showClearConfirm = false;
  }

  function handlePaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text');
    if (text && isCurlCommand(text)) {
      event.preventDefault();
      try {
        const parsed = parseCurl(text);
        setMethod(parsed.method);
        setUrlAndParams(parsed.url, parsed.params.length > 0 ? parsed.params : request.params);
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:window onkeydown={handleGlobalKeydown} onclick={closeSendMenu} />

<div class="url-bar">
  <div class="url-bar-unified" class:invalid={!!validationError}>
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
          <svg class="method-chevron" class:open={showMethodDropdown} width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10.5L2.5 5h11L8 10.5z"/></svg>
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
                      aria-label="Remove custom method"
                      onclick={(e) => { e.stopPropagation(); removeCustomMethod(method); }}
                      type="button"
                    ><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l-4.146 4.147-.708-.708L7.293 8 3.146 3.854l.708-.708L8 7.293l4.146-4.147.708.708L8.707 8l4.147 4.146-.708.708L8 8.707z"/></svg></button>
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
        placeholder={connectionMode === 'grpc' ? 'localhost:50051' : connectionMode === 'graphql-ws' ? 'ws://localhost:4000/graphql' : connectionMode === 'websocket' ? 'ws://localhost:8080' : connectionMode === 'sse' ? 'https://api.example.com/events' : 'Enter URL or paste cURL command...'}
        value={inputValue}
        oninput={handleUrlChange}
        onkeydown={handleKeydown}
        onblur={handleUrlBlur}
        onfocus={handleUrlFocus}
        onpaste={handlePaste}
      />
      <VariableIndicator text={inputValue} />
      {#if currentUrl.trim()}
        <Tooltip text={copyUrlState === 'copied' ? 'Copied!' : 'Copy resolved URL'}>
          <button
            class="copy-url-btn"
            class:copied={copyUrlState === 'copied'}
            onclick={handleCopyResolvedUrl}
            type="button"
            aria-label="Copy resolved URL"
          >
            <span class="codicon {copyUrlState === 'copied' ? 'codicon-check' : 'codicon-copy'}"></span>
          </button>
        </Tooltip>
      {/if}

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

      {#if showUrlDropdown && !showVarDropdown && urlSuggestions.length > 0}
        <div class="url-autocomplete-dropdown" role="listbox">
          {#each urlSuggestions as s, i}
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
            <div
              class="url-autocomplete-item"
              class:selected={i === urlSelectedIndex}
              role="option"
              tabindex="-1"
              aria-selected={i === urlSelectedIndex}
              onmousedown={(e) => { e.preventDefault(); selectUrlSuggestion(s); }}
              onmouseenter={() => urlSelectedIndex = i}
            >
              <span class="url-method-badge" style="color: {getMethodColor(s.method)}">{s.method}</span>
              <span class="url-autocomplete-url">{s.url}</span>
              {#if s.name}
                <span class="url-autocomplete-name">{s.name}</span>
              {/if}
              <span class="url-autocomplete-source">{s.source === 'collection' ? 'Collection' : 'History'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if connectionMode === 'graphql-ws'}
    {#if isGqlSubActive}
      <button class="cancel-button" onclick={() => messageBus({ type: 'gqlSubUnsubscribe' } as any)}>
        Unsubscribe
      </button>
    {:else}
      <button class="send-button" onclick={() => messageBus({ type: 'gqlSubSubscribe', data: { url: substituteVariables(request.url), headers: (Array.isArray(request.headers) ? request.headers : []).map(h => ({ ...h, key: substituteVariables(h.key), value: substituteVariables(h.value) })), query: request.body.content || '', variables: request.body.graphqlVariables, operationName: request.body.graphqlOperationName } } as any)} disabled={!currentUrl.trim()}>
        Subscribe
      </button>
    {/if}
  {:else if connectionMode === 'websocket'}
    {#if isWsConnected}
      <button class="cancel-button" onclick={() => messageBus({ type: 'wsDisconnect' })}>
        Disconnect
      </button>
    {:else}
      <button class="send-button" onclick={() => messageBus({ type: 'wsConnect', data: { url: substituteVariables(currentUrl), headers: (Array.isArray(request.headers) ? request.headers : []).map(h => ({ ...h, key: substituteVariables(h.key), value: substituteVariables(h.value) })), autoReconnect: false, reconnectIntervalMs: 3000 } })} disabled={!currentUrl.trim()}>
        Connect
      </button>
    {/if}
  {:else if connectionMode === 'grpc'}
    {#if loading}
      <button class="cancel-button" onclick={handleCancel}>Cancel</button>
    {:else}
      <button class="send-button" onclick={() => messageBus({ type: 'grpcInvoke', data: { address: substituteVariables(currentUrl), serviceName: request.grpc?.serviceName || '', methodName: request.grpc?.methodName || '', metadata: (Array.isArray(request.headers) ? request.headers : []).map(h => ({ ...h, key: substituteVariables(h.key), value: substituteVariables(h.value) })), body: request.body.content || '{}', useReflection: request.grpc?.useReflection ?? true, protoPaths: request.grpc?.protoPaths || [], importDirs: request.grpc?.protoImportDirs || [], tls: request.grpc?.tls, tlsCertPath: request.grpc?.tlsCertPath, tlsKeyPath: request.grpc?.tlsKeyPath, tlsCaCertPath: request.grpc?.tlsCaCertPath } } as any)} disabled={!currentUrl.trim() || !request.grpc?.serviceName || !request.grpc?.methodName}>
        Invoke
      </button>
    {/if}
  {:else if connectionMode === 'sse'}
    {#if isSseConnected}
      <button class="cancel-button" onclick={() => messageBus({ type: 'sseDisconnect' })}>
        Disconnect
      </button>
    {:else}
      <button class="send-button" onclick={() => messageBus({ type: 'sseConnect', data: { url: substituteVariables(currentUrl), headers: (Array.isArray(request.headers) ? request.headers : []).map(h => ({ ...h, key: substituteVariables(h.key), value: substituteVariables(h.value) })), autoReconnect: true, withCredentials: false } })} disabled={!currentUrl.trim()}>
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
    <div class="send-button-wrapper">
      <Tooltip text={sendTooltip}>
        <div class="send-button-group">
          <button
            class="send-button"
            onclick={handleSend}
            disabled={!currentUrl.trim()}
          >
            Send
          </button>
          <span class="send-divider"></span>
          <button
            class="send-dropdown-btn"
            onclick={toggleSendMenu}
            type="button"
            aria-label="Send options"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10.5L2.5 5h11L8 10.5z"/></svg>
          </button>
        </div>
      </Tooltip>
      {#if showSendMenu}
        <div class="send-menu" bind:this={sendMenuEl} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu">
          <button class="send-menu-item" onclick={handleImportCurl} type="button">
            <i class="codicon codicon-terminal"></i>
            <span>Import cURL</span>
          </button>
          <button class="send-menu-item" onclick={handleShowCode} type="button" disabled={!currentUrl.trim()}>
            <i class="codicon codicon-code"></i>
            <span>Show code</span>
          </button>
          <div class="send-menu-separator"></div>
          <button class="send-menu-item danger" onclick={handleClearAll} type="button">
            <i class="codicon codicon-trash"></i>
            <span>Clear all</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}
  <CollectionSaveButton {collectionId} {collectionName} {collections} {onSaveToCollection} {onSaveRequest} {onRevertRequest} />
</div>

{#if isLoading() && downloadProgress()}
  {@const dp = downloadProgress()!}
  <div class="url-progress-bar">
    {#if dp.total}
      <div class="url-progress-fill" style="width: {Math.min(100, (dp.loaded / dp.total) * 100)}%"></div>
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

<CodegenPanel request={codegenRequest} visible={showCodegenPanel} onclose={() => showCodegenPanel = false} />

<ConfirmDialog
  open={showClearConfirm}
  title="Clear request"
  message="This will reset the method, URL, headers, body, and all other fields to their defaults. This cannot be undone."
  confirmLabel="Clear"
  variant="danger"
  onconfirm={confirmClearAll}
  oncancel={() => showClearConfirm = false}
/>

{#if showCurlImport}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showCurlImport = false; }} onkeydown={handleCurlKeydown}>
    <div class="dialog curl-import-dialog" role="dialog" aria-modal="true" aria-labelledby="curl-dialog-title">
      <div class="dialog-header">
        <span class="dialog-icon info codicon codicon-terminal"></span>
        <h3 id="curl-dialog-title">Import cURL</h3>
      </div>
      <p class="dialog-message">Paste a cURL command below to populate the current request.</p>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        class="curl-textarea"
        placeholder="curl https://example.com -H 'Content-Type: application/json'"
        bind:value={curlInput}
        autofocus
        onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmImportCurl(); } }}
      ></textarea>
      {#if curlError}
        <p class="curl-error">{curlError}</p>
      {/if}
      <div class="dialog-actions">
        <button class="btn btn-secondary" onclick={() => showCurlImport = false}>Cancel</button>
        <button class="btn btn-primary info" onclick={confirmImportCurl} disabled={!curlInput.trim()}>Import</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .url-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 32px 12px 12px;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .url-bar-unified {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    border: 1px solid var(--hf-input-border);
    border-radius: 6px;
    background: var(--hf-input-background);
    transition: border-color 0.15s;
  }

  .url-bar-unified:focus-within {
    border-color: var(--hf-focusBorder);
  }

  .url-bar-unified.invalid {
    border-color: var(--hf-inputValidation-errorBorder, #f44336);
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
    border-radius: 5px 0 0 5px;
    background: transparent;
    color: var(--method-color, var(--hf-dropdown-foreground));
    border: none;
    border-right: 1px solid var(--hf-input-border);
    min-width: 100px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }

  .method-select:hover {
    background: var(--hf-list-hoverBackground);
  }

  .method-select:focus {
    outline: none;
  }

  .method-chevron {
    margin-left: auto;
    transition: transform 0.15s;
    opacity: 0.7;
    flex-shrink: 0;
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
    font-weight: 600;
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
    font-weight: 600;
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
    padding: 8px 28px 8px 12px;
    min-width: 0;
    border-radius: 0 5px 5px 0;
    background: transparent;
    color: var(--hf-input-foreground);
    border: none;
    font-size: 13px;
  }

  .url-input:focus {
    outline: none;
  }

  .url-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .send-button-group {
    display: flex;
    align-items: stretch;
    border-radius: 6px;
    overflow: hidden;
    height: 32px;
  }

  .send-button {
    padding: 8px 28px;
    border-radius: 6px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .send-button-group .send-button {
    border-radius: 0;
  }

  .send-button:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-divider {
    width: 1px;
    background: rgba(255, 255, 255, 0.3);
  }

  .send-dropdown-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 8px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .send-dropdown-btn:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .send-dropdown-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-button-wrapper {
    position: relative;
  }

  .send-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: var(--hf-menu-background, var(--hf-dropdown-background));
    border: 1px solid var(--hf-menu-border, var(--hf-dropdown-border, var(--hf-panel-border)));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    overflow: hidden;
    padding: 4px 0;
  }

  .send-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: var(--hf-menu-foreground, var(--hf-foreground));
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .send-menu-item:hover:not(:disabled) {
    background: var(--hf-menu-selectionBackground, var(--hf-list-hoverBackground));
    color: var(--hf-menu-selectionForeground, var(--hf-foreground));
  }

  .send-menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-menu-item .codicon {
    font-size: 14px;
    opacity: 0.8;
    flex-shrink: 0;
  }

  .send-menu-item.danger:hover:not(:disabled) {
    color: var(--hf-errorForeground, #f44336);
  }

  .send-menu-separator {
    height: 1px;
    background: var(--hf-panel-border);
    margin: 4px 0;
  }

  .cancel-button {
    padding: 8px 24px;
    border-radius: 6px;
    height: 32px;
    box-sizing: border-box;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-errorForeground);
    cursor: pointer;
    font-weight: 600;
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

  .copy-url-btn {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    opacity: 0.6;
    transition: opacity 0.15s, color 0.15s;
    z-index: 1;
  }

  .copy-url-btn:hover,
  .copy-url-btn:focus-visible,
  .copy-url-btn.copied {
    opacity: 1;
  }

  .copy-url-btn:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  .copy-url-btn .codicon {
    font-size: 14px;
  }

  .copy-url-btn.copied .codicon {
    color: var(--hf-testing-iconPassed, #73c991);
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

  /* URL autocomplete dropdown */
  .url-autocomplete-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    max-height: 240px;
    overflow-y: auto;
    background: var(--hf-dropdown-background);
    border: 1px solid var(--hf-dropdown-border, var(--hf-focusBorder));
    border-radius: 4px;
    margin-top: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .url-autocomplete-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-dropdown-foreground);
    cursor: pointer;
    overflow: hidden;
  }

  .url-autocomplete-item:hover,
  .url-autocomplete-item.selected {
    background: var(--hf-list-hoverBackground);
  }

  .url-autocomplete-item.selected {
    color: var(--hf-list-activeSelectionForeground);
  }

  .url-method-badge {
    flex-shrink: 0;
    font-weight: 700;
    font-size: 10px;
    min-width: 42px;
    text-align: center;
  }

  .url-autocomplete-url {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-autocomplete-name {
    flex-shrink: 0;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-autocomplete-source {
    flex-shrink: 0;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--hf-badge-background, rgba(255, 255, 255, 0.1));
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .url-autocomplete-dropdown::-webkit-scrollbar {
    width: 8px;
  }

  .url-autocomplete-dropdown::-webkit-scrollbar-thumb {
    background: var(--hf-scrollbarSlider-background);
    border-radius: 4px;
  }

  .url-autocomplete-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--hf-scrollbarSlider-hoverBackground);
  }

  /* cURL import dialog */
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .dialog {
    min-width: 300px;
    max-width: 520px;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    padding: 16px 20px;
    animation: curlDialogIn 0.15s ease-out;
  }

  @keyframes curlDialogIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .dialog-icon {
    font-size: 18px;
  }

  .dialog-icon.info {
    color: var(--hf-editorInfo-foreground, #3794ff);
  }

  .dialog-message {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--hf-descriptionForeground);
    line-height: 1.5;
  }

  .curl-textarea {
    width: 100%;
    min-height: 100px;
    max-height: 200px;
    padding: 8px 10px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 4px;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.5;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }

  .curl-textarea:focus {
    border-color: var(--hf-focusBorder);
  }

  .curl-error {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--hf-errorForeground);
    line-height: 1.4;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .btn {
    padding: 6px 14px;
    font-size: 13px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 600;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-button-secondaryBackground, var(--hf-panel-border));
  }

  .btn-secondary:hover {
    background: var(--hf-button-secondaryHoverBackground, rgba(90, 93, 94, 0.31));
  }

  .btn-primary.info {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .btn-primary.info:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }
</style>
