<script lang="ts">
  import { request, setMethod, setUrl, setHeaders, setParams, setAuth, setBody, isLoading, substituteVariables, type HttpMethod } from '../../stores';
  import { ui, setConnectionMode } from '../../stores/ui';
  import { postMessage } from '../../lib/vscode';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import { validateUrl, isIncompleteUrl, suggestUrlFix } from '../../lib/validation';
  import { settings } from '../../stores/settings';
  import CodegenButton from '../shared/CodegenButton.svelte';
  import CollectionSaveButton from '../shared/CollectionSaveButton.svelte';
  import { parseCurl, isCurlCommand } from '../../lib/curl-parser';
  import { wsStatus } from '../../stores/websocket';
  import { sseStatus } from '../../stores/sse';
  import type { Collection, ConnectionMode } from '../../types';

  interface Props {
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    onSaveToCollection: () => void;
  }
  let { collectionId, collectionName, collections, onSaveToCollection }: Props = $props();

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const connectionModes: { id: ConnectionMode; label: string }[] = [
    { id: 'http', label: 'HTTP' },
    { id: 'websocket', label: 'WS' },
    { id: 'sse', label: 'SSE' },
  ];

  let validationError = $state<string | null>(null);
  let urlSuggestion = $state<string | null>(null);
  let hasBlurred = $state(false);

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
  const loading = $derived($isLoading);
  const connectionMode = $derived($ui.connectionMode);
  const currentWsStatus = $derived($wsStatus);
  const currentSseStatus = $derived($sseStatus);
  const isWsConnected = $derived(currentWsStatus === 'connected' || currentWsStatus === 'connecting');
  const isSseConnected = $derived(currentSseStatus === 'connected' || currentSseStatus === 'connecting');

  // Validate URL when it changes (but only show error after blur or send attempt)
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
    setUrl(target.value);
    // Clear validation error while typing
    if (validationError && isIncompleteUrl(target.value)) {
      validationError = null;
    }
  }

  function handleConnectionModeChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    setConnectionMode(target.value as ConnectionMode);
  }

  function handleUrlBlur() {
    hasBlurred = true;
  }

  function handleUrlFocus() {
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
    console.log('[HiveFetch WebView] handleSend called', { currentUrl, loading });

    if (!currentUrl.trim() || loading) {
      console.log('[HiveFetch WebView] Early return - empty URL or loading', { urlEmpty: !currentUrl.trim(), loading });
      return;
    }

    // Validate URL before sending
    const result = validateUrl(currentUrl);
    if (!result.valid) {
      console.log('[HiveFetch WebView] URL validation failed', result);
      hasBlurred = true;
      validationError = result.error || 'Invalid URL';
      return;
    }

    console.log('[HiveFetch WebView] Sending request...');
    isLoading.set(true);

    // Apply variable substitution to URL
    const resolvedUrl = substituteVariables(currentUrl);

    // Build headers object from KeyValue array with variable substitution
    const headers: Record<string, string> = {};
    const requestHeaders = Array.isArray($request.headers) ? $request.headers : [];
    requestHeaders.forEach((h) => {
      if (h.enabled && h.key) {
        headers[substituteVariables(h.key)] = substituteVariables(h.value);
      }
    });

    // Build params object from KeyValue array with variable substitution
    const params: Record<string, string> = {};
    const requestParams = Array.isArray($request.params) ? $request.params : [];
    requestParams.forEach((p) => {
      if (p.enabled && p.key) {
        params[substituteVariables(p.key)] = substituteVariables(p.value);
      }
    });

    // Apply variable substitution to body content
    const body = { ...$request.body };
    if (body.content) {
      body.content = substituteVariables(body.content);
    }
    if (body.graphqlVariables) {
      body.graphqlVariables = substituteVariables(body.graphqlVariables);
    }

    // Apply variable substitution to auth
    const auth = { ...$request.auth };
    if (auth.username) auth.username = substituteVariables(auth.username);
    if (auth.password) auth.password = substituteVariables(auth.password);
    if (auth.token) auth.token = substituteVariables(auth.token);
    if (auth.apiKeyName) auth.apiKeyName = substituteVariables(auth.apiKeyName);
    if (auth.apiKeyValue) auth.apiKeyValue = substituteVariables(auth.apiKeyValue);

    console.log('[HiveFetch WebView] Posting sendRequest message', { method: currentMethod, url: resolvedUrl });
    postMessage({
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
      },
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleSend();
    }
    // Escape to cancel
    if (event.key === 'Escape' && loading) {
      handleCancel();
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    // Global Ctrl+Enter to send request from anywhere in the panel
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSend();
    }
    // Global Escape to cancel
    if (event.key === 'Escape' && loading) {
      handleCancel();
    }
  }

  function handleCancel() {
    console.log('[HiveFetch WebView] Cancel button clicked, sending cancelRequest');
    postMessage({ type: 'cancelRequest' });
    isLoading.set(false);
  }

  function handlePaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text');
    if (text && isCurlCommand(text)) {
      event.preventDefault();
      try {
        const parsed = parseCurl(text);
        setMethod(parsed.method as HttpMethod);
        setUrl(parsed.url);
        if (parsed.headers.length > 0) {
          setHeaders(parsed.headers);
        }
        if (parsed.params.length > 0) {
          setParams(parsed.params);
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
        setUrl(text);
      }
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="url-bar">
  <select
    class="mode-select"
    value={connectionMode}
    onchange={handleConnectionModeChange}
  >
    {#each connectionModes as mode}
      <option value={mode.id}>{mode.label}</option>
    {/each}
  </select>

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

  <!-- svelte-ignore a11y_autofocus -->
  <input
    type="text"
    class="url-input"
    class:invalid={validationError}
    placeholder={connectionMode === 'websocket' ? 'ws://localhost:8080' : connectionMode === 'sse' ? 'https://api.example.com/events' : 'Enter request URL...'}
    value={currentUrl}
    autofocus={true}
    oninput={handleUrlChange}
    onkeydown={handleKeydown}
    onblur={handleUrlBlur}
    onfocus={handleUrlFocus}
    onpaste={handlePaste}
  />

  <EnvironmentSelector />

  {#if connectionMode === 'http'}
    <CodegenButton />
    <CollectionSaveButton {collectionId} {collectionName} {collections} {onSaveToCollection} />
  {/if}

  {#if connectionMode === 'websocket'}
    {#if isWsConnected}
      <button class="cancel-button" onclick={() => postMessage({ type: 'wsDisconnect' })}>
        Disconnect
      </button>
    {:else}
      <button class="send-button" onclick={() => postMessage({ type: 'wsConnect', data: { url: currentUrl, headers: $request.headers, autoReconnect: false, reconnectIntervalMs: 3000 } })} disabled={!currentUrl.trim()}>
        Connect
      </button>
    {/if}
  {:else if connectionMode === 'sse'}
    {#if isSseConnected}
      <button class="cancel-button" onclick={() => postMessage({ type: 'sseDisconnect' })}>
        Disconnect
      </button>
    {:else}
      <button class="send-button" onclick={() => postMessage({ type: 'sseConnect', data: { url: currentUrl, headers: $request.headers, autoReconnect: true, withCredentials: false } })} disabled={!currentUrl.trim()}>
        Connect
      </button>
    {/if}
  {:else if loading}
    <button
      class="cancel-button"
      onclick={handleCancel}
      title="Cancel request (Esc)"
    >
      Cancel
    </button>
  {:else}
    <button
      class="send-button"
      onclick={handleSend}
      disabled={!currentUrl.trim()}
      title="Send request (Ctrl+Enter)"
    >
      Send
    </button>
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

<style>
  .url-bar {
    display: flex;
    gap: 8px;
    padding: 12px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .mode-select {
    padding: 8px 8px;
    border-radius: 4px;
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    min-width: 60px;
    cursor: pointer;
    font-weight: 600;
    font-size: 11px;
  }

  .mode-select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .method-select {
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--vscode-dropdown-background);
    color: var(--method-color, var(--vscode-dropdown-foreground));
    border: 1px solid var(--vscode-dropdown-border);
    min-width: 110px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }

  .method-select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .url-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    font-size: 13px;
  }

  .url-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .url-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .send-button {
    padding: 8px 24px;
    border-radius: 4px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 13px;
    transition: background 0.15s;
  }

  .send-button:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-button {
    padding: 8px 24px;
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-errorForeground);
    cursor: pointer;
    font-weight: 500;
    font-size: 13px;
    transition: background 0.15s;
  }

  .cancel-button:hover {
    background: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
  }

  .url-input.invalid {
    border-color: var(--vscode-inputValidation-errorBorder, #f44336);
  }

  .url-feedback {
    padding: 4px 12px 8px;
    background: var(--vscode-editor-background);
  }

  .error-message {
    color: var(--vscode-errorForeground, #f44336);
    font-size: 12px;
  }

  .suggestion-btn {
    background: transparent;
    border: none;
    color: var(--vscode-textLink-foreground);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .suggestion-btn:hover {
    color: var(--vscode-textLink-activeForeground);
  }

  .suggestion-btn strong {
    font-weight: 600;
  }
</style>
