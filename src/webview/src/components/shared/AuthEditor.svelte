<script lang="ts">
  import type { AuthState } from '../../stores/request';

  interface Props {
    auth?: AuthState;
    onchange?: (auth: AuthState) => void;
  }
  let { auth = { type: 'none' }, onchange }: Props = $props();

  type AuthType = 'none' | 'basic' | 'bearer';

  const authTypes: { id: AuthType; label: string; description: string }[] = [
    { id: 'none', label: 'No Auth', description: 'No authentication' },
    { id: 'basic', label: 'Basic Auth', description: 'Username and password' },
    { id: 'bearer', label: 'Bearer Token', description: 'Bearer/API token' },
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
    }
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
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }

  .auth-types {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .auth-type-btn {
    padding: 8px 16px;
    background: var(--vscode-input-background);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .auth-type-btn:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .auth-type-btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }

  .auth-type-label {
    font-weight: 500;
  }

  .auth-content {
    padding: 16px;
    background: var(--vscode-input-background);
    border-radius: 6px;
    border: 1px solid var(--vscode-panel-border);
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
    color: var(--vscode-descriptionForeground);
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
    color: var(--vscode-foreground);
    margin-bottom: 6px;
  }

  .auth-field input {
    width: 100%;
    padding: 8px 12px;
    background: var(--vscode-editor-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .auth-field input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .auth-field input::placeholder {
    color: var(--vscode-input-placeholderForeground);
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
    background: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textBlockQuote-border);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    border-radius: 0 4px 4px 0;
  }

  .auth-hint code {
    background: var(--vscode-textCodeBlock-background);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family), monospace;
    font-size: 11px;
  }
</style>
