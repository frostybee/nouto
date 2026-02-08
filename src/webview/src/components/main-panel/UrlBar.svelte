<script lang="ts">
  import { request, setMethod, setUrl, isLoading, substituteVariables, type HttpMethod } from '../../stores';
  import { postMessage } from '../../lib/vscode';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import { validateUrl, isIncompleteUrl, suggestUrlFix } from '../../lib/validation';
  import { settings } from '../../stores/settings';
  import CodegenButton from '../shared/CodegenButton.svelte';

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

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


</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="url-bar">
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

  <input
    type="text"
    class="url-input"
    class:invalid={validationError}
    placeholder="Enter request URL..."
    value={currentUrl}
    oninput={handleUrlChange}
    onkeydown={handleKeydown}
    onblur={handleUrlBlur}
    onfocus={handleUrlFocus}
  />

  <EnvironmentSelector />

  <CodegenButton />

  {#if loading}
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
