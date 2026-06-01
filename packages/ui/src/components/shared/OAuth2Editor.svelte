<script lang="ts">
  import type { OAuth2Config, OAuth2GrantType, OAuthToken } from '../../types';
  import { postMessage, onMessage } from '../../lib/vscode';
  import OAuthTokenDisplay from './OAuthTokenDisplay.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    config?: OAuth2Config;
    onchange?: (config: OAuth2Config) => void;
    ontokenchange?: (token: OAuthToken | null) => void;
  }
  let { config = { grantType: 'authorization_code', clientId: '' }, onchange, ontokenchange }: Props = $props();

  let token = $state<OAuthToken | null>(null);
  let flowError = $state<string | null>(null);
  let isLoading = $state(false);

  const grantTypes: { id: OAuth2GrantType; label: string }[] = [
    { id: 'authorization_code', label: 'Authorization Code' },
    { id: 'client_credentials', label: 'Client Credentials' },
    { id: 'implicit', label: 'Implicit' },
    { id: 'password', label: 'Password' },
  ];

  function updateConfig(updates: Partial<OAuth2Config>) {
    config = { ...config, ...updates };
    onchange?.(config);
  }

  function handleGetToken() {
    flowError = null;
    isLoading = true;
    postMessage({ type: 'startOAuthFlow', data: config });
  }

  function handleRefreshToken() {
    if (!token?.refreshToken || !config.tokenUrl) return;
    flowError = null;
    isLoading = true;
    postMessage({
      type: 'refreshOAuthToken',
      data: {
        tokenUrl: config.tokenUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: token.refreshToken,
      },
    });
  }

  function handleClearToken() {
    token = null;
    ontokenchange?.(null);
    postMessage({ type: 'clearOAuthToken' });
  }

  // Listen for OAuth responses
  $effect(() => {
    const cleanup = onMessage((msg: any) => {
      if (msg.type === 'oauthTokenReceived' || msg.type === 'oauthTokenRefreshed') {
        token = msg.data;
        isLoading = false;
        ontokenchange?.(msg.data);
      } else if (msg.type === 'oauthFlowError') {
        flowError = msg.data.message;
        isLoading = false;
      }
    });
    return cleanup;
  });

  const showAuthUrl = $derived(config.grantType === 'authorization_code' || config.grantType === 'implicit');
  const showTokenUrl = $derived(config.grantType !== 'implicit');
  const showClientSecret = $derived(config.grantType !== 'implicit');
  const showPkce = $derived(config.grantType === 'authorization_code');
  const showPassword = $derived(config.grantType === 'password');

  let showSecretField = $state(false);
</script>

<div class="oauth2-editor">
  <div class="grant-type-selector">
    <span class="section-label">Grant Type</span>
    <div class="grant-types" role="group">
      {#each grantTypes as gt}
        <button
          class="grant-type-btn"
          class:active={config.grantType === gt.id}
          onclick={() => updateConfig({ grantType: gt.id })}
        >
          {gt.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="oauth2-fields">
    {#if showAuthUrl}
      <div class="field">
        <label for="oauth-auth-url">Authorization URL</label>
        <input
          id="oauth-auth-url"
          type="text"
          placeholder="https://provider.com/oauth/authorize"
          value={config.authUrl || ''}
          oninput={(e) => updateConfig({ authUrl: e.currentTarget.value })}
        />
      </div>
    {/if}

    {#if showTokenUrl}
      <div class="field">
        <label for="oauth-token-url">Token URL</label>
        <input
          id="oauth-token-url"
          type="text"
          placeholder="https://provider.com/oauth/token"
          value={config.tokenUrl || ''}
          oninput={(e) => updateConfig({ tokenUrl: e.currentTarget.value })}
        />
      </div>
    {/if}

    <div class="field">
      <label for="oauth-client-id">Client ID</label>
      <input
        id="oauth-client-id"
        type="text"
        placeholder="your-client-id"
        value={config.clientId || ''}
        oninput={(e) => updateConfig({ clientId: e.currentTarget.value })}
      />
    </div>

    {#if showClientSecret}
      <div class="field">
        <label for="oauth-client-secret">Client Secret</label>
        <div class="secret-wrapper">
          <input
            id="oauth-client-secret"
            type={showSecretField ? 'text' : 'password'}
            placeholder="your-client-secret"
            value={config.clientSecret || ''}
            oninput={(e) => updateConfig({ clientSecret: e.currentTarget.value })}
          />
          <Tooltip text={showSecretField ? 'Hide' : 'Show'} position="top"><button
            class="toggle-btn"
            onclick={() => showSecretField = !showSecretField}
            aria-label={showSecretField ? 'Hide' : 'Show'}
          >
            <i class="codicon" class:codicon-eye={!showSecretField} class:codicon-eye-closed={showSecretField}></i>
          </button></Tooltip>
        </div>
      </div>
    {/if}

    <div class="field">
      <label for="oauth-scope">Scope</label>
      <input
        id="oauth-scope"
        type="text"
        placeholder="read write (space-separated)"
        value={config.scope || ''}
        oninput={(e) => updateConfig({ scope: e.currentTarget.value })}
      />
    </div>

    {#if showPkce}
      <div class="field checkbox-field">
        <label>
          <input
            type="checkbox"
            checked={config.usePkce || false}
            onchange={(e) => updateConfig({ usePkce: e.currentTarget.checked })}
          />
          Use PKCE (Proof Key for Code Exchange)
        </label>
      </div>
    {/if}

    {#if showPassword}
      <div class="field">
        <label for="oauth-username">Username</label>
        <input
          id="oauth-username"
          type="text"
          placeholder="username"
          value={config.username || ''}
          oninput={(e) => updateConfig({ username: e.currentTarget.value })}
        />
      </div>
      <div class="field">
        <label for="oauth-password">Password</label>
        <input
          id="oauth-password"
          type="password"
          placeholder="password"
          value={config.password || ''}
          oninput={(e) => updateConfig({ password: e.currentTarget.value })}
        />
      </div>
    {/if}
  </div>

  <div class="token-actions">
    <button
      class="get-token-btn"
      onclick={handleGetToken}
      disabled={isLoading || !config.clientId}
    >
      {#if isLoading}
        <i class="codicon codicon-loading codicon-modifier-spin"></i> Getting Token...
      {:else}
        Get New Access Token
      {/if}
    </button>
  </div>

  {#if flowError}
    <div class="flow-error">
      <i class="codicon codicon-error"></i> {flowError}
    </div>
  {/if}

  {#if token}
    <OAuthTokenDisplay
      {token}
      onrefresh={handleRefreshToken}
      onclear={handleClearToken}
    />
  {/if}
</div>

<style>
  .oauth2-editor {
    display: flex;
    flex-direction: column;
    gap: 1.231rem;
  }

  .section-label {
    display: block;
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 0.615rem;
  }

  .grant-types {
    display: flex;
    gap: 0.462rem;
    flex-wrap: wrap;
  }

  .grant-type-btn {
    padding: 0.462rem 0.923rem;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.846rem;
    transition: all 0.15s;
  }

  .grant-type-btn:hover { background: var(--hf-list-hoverBackground); }

  .grant-type-btn.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-button-background);
  }

  .oauth2-fields {
    display: flex;
    flex-direction: column;
    gap: 0.923rem;
    padding: 1.231rem;
    background: var(--hf-input-background);
    border-radius: 0.462rem;
    border: 1px solid var(--hf-panel-border);
  }

  .field label {
    display: block;
    font-size: 0.923rem;
    font-weight: 600;
    color: var(--hf-foreground);
    margin-bottom: 0.462rem;
  }

  .field input[type="text"],
  .field input[type="password"] {
    width: 100%;
    padding: 0.615rem 0.923rem;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    font-size: 1rem;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .field input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .field input::placeholder { color: var(--hf-input-placeholderForeground); }

  .secret-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .secret-wrapper input { padding-right: 3.077rem; }

  .toggle-btn {
    position: absolute;
    right: 0.308rem;
    padding: 0.308rem 0.615rem;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.7;
  }

  .toggle-btn:hover { opacity: 1; }

  .checkbox-field label {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    cursor: pointer;
  }

  .checkbox-field input[type="checkbox"] {
    width: auto;
    cursor: pointer;
  }

  .token-actions {
    display: flex;
    gap: 0.615rem;
  }

  .get-token-btn {
    padding: 0.615rem 1.231rem;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.462rem;
  }

  .get-token-btn:hover:not(:disabled) { background: var(--hf-button-hoverBackground); }
  .get-token-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .flow-error {
    padding: 0.615rem 0.923rem;
    background: var(--hf-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
    border: 1px solid var(--hf-inputValidation-errorBorder, #f44336);
    border-radius: 0.308rem;
    color: var(--hf-errorForeground);
    font-size: 0.923rem;
    display: flex;
    align-items: center;
    gap: 0.462rem;
  }
</style>
