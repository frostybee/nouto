<script lang="ts">
  import { request, setMethod, setUrl, setHeaders, setParams, setAuth, setBody, isLoading, type HttpMethod } from '../../stores';
  import { setUrlAndParams } from '../../stores/request';
  import { resolveRequestVariables } from '../../lib/http-helpers';
  import { ui } from '../../stores/ui';
  import { postMessage as vsCodePostMessage } from '../../lib/vscode';
  import { getUnresolvedVariables, activeVariables } from '../../stores/environment';
  import { validateUrl, isIncompleteUrl, suggestUrlFix } from '@hivefetch/core';
  import { settings, resolvedShortcuts } from '../../stores/settings';
  import { matchesBinding, bindingToDisplayString } from '../../lib/shortcuts';
  import { parseCurl, isCurlCommand } from '@hivefetch/core';
  import { wsStatus } from '../../stores/websocket';
  import { sseStatus } from '../../stores/sse';
  import { parseUrlParams, buildDisplayUrl, mergeParams } from '@hivefetch/core';
  import Tooltip from '../shared/Tooltip.svelte';
  import VariableIndicator from '../shared/VariableIndicator.svelte';
  import type { OutgoingMessage } from '@hivefetch/transport/messages';

  interface Props {
    postMessage?: (message: OutgoingMessage) => void;
  }
  let { postMessage }: Props = $props();

  // Use provided postMessage or fallback to VSCode postMessage (for VSCode extension)
  const messageBus = postMessage || vsCodePostMessage;

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  let urlInput: HTMLInputElement;
  let validationError = $state<string | null>(null);
  let urlSuggestion = $state<string | null>(null);
  let hasBlurred = $state(false);

  // Local input state and focus tracking for bidirectional URL ↔ params sync
  let inputValue = $state('');
  let isFocused = $state(false);

  const methodColors: Record<HttpMethod, string> = {
    GET: '#61affe',
    POST: '#49cc90',
    PUT: '#fca130',
    PATCH: '#50e3c2',
    DELETE: '#f93e3e',
    HEAD: '#9012fe',
    OPTIONS: '#0d5aa7',
  };

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

  // Check for unresolved variables in the full display URL
  const unresolvedVars = $derived(getUnresolvedVariables(displayUrl, $activeVariables));

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

  function handleMethodChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    setMethod(target.value as HttpMethod);
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

    // Clear validation error while typing
    if (validationError && isIncompleteUrl(baseUrl)) {
      validationError = null;
    }
  }

  function handleUrlBlur() {
    isFocused = false;
    hasBlurred = true;
    // Normalize input to canonical display URL
    inputValue = buildDisplayUrl($request.url, $request.params);
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

    const { url: resolvedUrl, body, auth } = resolveRequestVariables(currentUrl, $request.body, $request.auth);

    messageBus({
      type: 'sendRequest',
      data: {
        method: currentMethod,
        url: resolvedUrl,
        // Send original arrays for storage, extension will process them
        headers: $request.headers,
        params: $request.params,
        body,
        auth,
        assertions: $request.assertions || [],
        authInheritance: $request.authInheritance,
        scripts: $request.scripts,
        ssl: $request.ssl,
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
    // Ctrl+L to focus URL bar
    if (event.key === 'l' && (event.ctrlKey || event.metaKey)) {
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
        setMethod(parsed.method as HttpMethod);
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
    <select
      class="method-select"
      value={currentMethod}
      onchange={handleMethodChange}
      style="--method-color: {methodColors[currentMethod]}"
    >
      {#each methods as method}
        <option value={method}>{method}</option>
      {/each}
    </select>
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
</div>

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

  .method-select {
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

  .url-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
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
</style>
