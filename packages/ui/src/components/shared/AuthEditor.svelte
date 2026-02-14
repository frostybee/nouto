<script lang="ts">
  import type { AuthState } from '../../stores/request';
  import type { AuthType, OAuth2Config } from '../../types';
  import OAuth2Editor from './OAuth2Editor.svelte';
  import AwsAuthEditor from './AwsAuthEditor.svelte';

  interface Props {
    auth?: AuthState;
    onchange?: (auth: AuthState) => void;
  }
  let { auth = { type: 'none' }, onchange }: Props = $props();

  const authTypes: { id: AuthType; label: string; description: string }[] = [
    { id: 'none', label: 'No Auth', description: 'No authentication' },
    { id: 'basic', label: 'Basic Auth', description: 'Username and password' },
    { id: 'bearer', label: 'Bearer Token', description: 'Bearer/API token' },
    { id: 'apikey', label: 'API Key', description: 'Key name and value' },
    { id: 'oauth2', label: 'OAuth 2.0', description: 'OAuth 2.0 authorization' },
    { id: 'aws', label: 'AWS Sig V4', description: 'AWS Signature Version 4' },
  ];

  function updateAuth(newAuth: AuthState) {
    auth = newAuth;
    onchange?.(auth);
  }

  function setAuthType(type: AuthType) {
    if (type === 'none') {
      updateAuth({ type: 'none' });
    } else if (type === 'basic') {
      updateAuth({ type: 'basic', username: auth.username || '', password: auth.password || '' });
    } else if (type === 'bearer') {
      updateAuth({ type: 'bearer', token: auth.token || '' });
    } else if (type === 'apikey') {
      updateAuth({ type: 'apikey', apiKeyName: auth.apiKeyName || '', apiKeyValue: auth.apiKeyValue || '', apiKeyIn: auth.apiKeyIn || 'header' });
    } else if (type === 'oauth2') {
      updateAuth({ type: 'oauth2', oauth2: auth.oauth2 || { grantType: 'authorization_code', clientId: '' } });
    } else if (type === 'aws') {
      updateAuth({
        type: 'aws',
        awsAccessKey: auth.awsAccessKey || '',
        awsSecretKey: auth.awsSecretKey || '',
        awsRegion: auth.awsRegion || 'us-east-1',
        awsService: auth.awsService || 's3',
        awsSessionToken: auth.awsSessionToken || '',
      });
    }
  }

  function handleOAuth2ConfigChange(config: OAuth2Config) {
    updateAuth({ ...auth, oauth2: config });
  }

  function updateUsername(username: string) {
    updateAuth({ ...auth, username });
  }

  function updatePassword(password: string) {
    updateAuth({ ...auth, password });
  }

  function updateToken(token: string) {
    updateAuth({ ...auth, token });
  }

  function updateApiKeyName(name: string) {
    updateAuth({ ...auth, apiKeyName: name });
  }

  function updateApiKeyValue(value: string) {
    updateAuth({ ...auth, apiKeyValue: value });
  }

  function updateApiKeyIn(placement: 'header' | 'query') {
    updateAuth({ ...auth, apiKeyIn: placement });
  }

  let showPassword = $state(false);

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }
</script>

<div class="auth-editor">
  <div class="auth-type-selector">
    <span class="section-label">Type</span>
    <div class="auth-types" role="group" aria-label="Authentication type">
      {#each authTypes as authType}
        <button
          class="auth-type-btn"
          class:active={auth.type === authType.id}
          onclick={() => setAuthType(authType.id)}
        >
          <span class="auth-type-label">{authType.label}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if auth.type === 'none'}
    <div class="auth-content empty">
      <div class="empty-state">
        <span class="empty-icon codicon codicon-unlock"></span>
        <p>This request does not use any authorization.</p>
      </div>
    </div>
  {:else if auth.type === 'basic'}
    <div class="auth-content">
      <div class="auth-field">
        <label for="auth-username">Username</label>
        <input
          id="auth-username"
          type="text"
          placeholder="Enter username"
          value={auth.username || ''}
          oninput={(e) => updateUsername(e.currentTarget.value)}
        />
      </div>
      <div class="auth-field">
        <label for="auth-password">Password</label>
        <div class="password-input-wrapper">
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter password"
            value={auth.password || ''}
            oninput={(e) => updatePassword(e.currentTarget.value)}
          />
          <button
            class="toggle-password-btn"
            onclick={togglePasswordVisibility}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            <i class="codicon" class:codicon-eye={!showPassword} class:codicon-eye-closed={showPassword}></i>
          </button>
        </div>
      </div>
      <p class="auth-hint">
        The authorization header will be automatically generated when you send the request.
      </p>
    </div>
  {:else if auth.type === 'bearer'}
    <div class="auth-content">
      <div class="auth-field">
        <label for="auth-token">Token</label>
        <input
          id="auth-token"
          type="text"
          placeholder="Enter bearer token"
          value={auth.token || ''}
          oninput={(e) => updateToken(e.currentTarget.value)}
        />
      </div>
      <p class="auth-hint">
        The token will be sent as: <code>Authorization: Bearer &lt;token&gt;</code>
      </p>
    </div>
  {:else if auth.type === 'apikey'}
    <div class="auth-content">
      <div class="auth-field">
        <label for="auth-apikey-name">Key</label>
        <input
          id="auth-apikey-name"
          type="text"
          placeholder="e.g. X-API-Key"
          value={auth.apiKeyName || ''}
          oninput={(e) => updateApiKeyName(e.currentTarget.value)}
        />
      </div>
      <div class="auth-field">
        <label for="auth-apikey-value">Value</label>
        <input
          id="auth-apikey-value"
          type="text"
          placeholder="Enter API key value"
          value={auth.apiKeyValue || ''}
          oninput={(e) => updateApiKeyValue(e.currentTarget.value)}
        />
      </div>
      <div class="auth-field">
        <span class="field-label">Add to</span>
        <div class="placement-options" role="group" aria-label="API key placement">
          <button
            class="placement-btn"
            class:active={auth.apiKeyIn !== 'query'}
            onclick={() => updateApiKeyIn('header')}
          >
            Header
          </button>
          <button
            class="placement-btn"
            class:active={auth.apiKeyIn === 'query'}
            onclick={() => updateApiKeyIn('query')}
          >
            Query Param
          </button>
        </div>
      </div>
      <p class="auth-hint">
        {#if auth.apiKeyIn === 'query'}
          The key will be sent as a query parameter: <code>?{auth.apiKeyName || 'key'}=&lt;value&gt;</code>
        {:else}
          The key will be sent as a header: <code>{auth.apiKeyName || 'X-API-Key'}: &lt;value&gt;</code>
        {/if}
      </p>
    </div>
  {:else if auth.type === 'oauth2'}
    <div class="auth-content">
      <OAuth2Editor
        config={auth.oauth2}
        onchange={handleOAuth2ConfigChange}
      />
    </div>
  {:else if auth.type === 'aws'}
    <div class="auth-content">
      <AwsAuthEditor {auth} onchange={updateAuth} />
    </div>
  {/if}
</div>

<style>
  .auth-editor {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 8px;
  }

  .auth-types {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .auth-type-btn {
    padding: 8px 16px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .auth-type-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .auth-type-btn.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-button-background);
  }

  .auth-type-label {
    font-weight: 500;
  }

  .auth-content {
    padding: 16px;
    background: var(--hf-input-background);
    border-radius: 6px;
    border: 1px solid var(--hf-panel-border);
  }

  .auth-content.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--hf-descriptionForeground);
  }

  .empty-icon {
    font-size: 24px;
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .auth-field {
    margin-bottom: 12px;
  }

  .auth-field:last-of-type {
    margin-bottom: 0;
  }

  .auth-field label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--hf-foreground);
    margin-bottom: 6px;
  }

  .auth-field input {
    width: 100%;
    padding: 8px 12px;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .auth-field input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .auth-field input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .password-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input-wrapper input {
    padding-right: 40px;
  }

  .toggle-password-btn {
    position: absolute;
    right: 4px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .toggle-password-btn:hover {
    opacity: 1;
  }

  .auth-hint {
    margin: 12px 0 0;
    padding: 8px;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textBlockQuote-border);
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    border-radius: 0 4px 4px 0;
  }

  .auth-hint code {
    background: var(--hf-textCodeBlock-background);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 11px;
  }

  .field-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--hf-foreground);
    margin-bottom: 6px;
  }

  .placement-options {
    display: flex;
    gap: 8px;
  }

  .placement-btn {
    padding: 6px 14px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.15s;
  }

  .placement-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .placement-btn.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-button-background);
  }
</style>
