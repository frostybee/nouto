<script lang="ts">
  import type { OAuthToken } from '../../types';
  import { copyToClipboard } from '../../lib/curl';

  interface Props {
    token: OAuthToken;
    onrefresh?: () => void;
    onclear?: () => void;
  }
  let { token, onrefresh, onclear }: Props = $props();

  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout>;

  const isExpired = $derived(token.expiresAt ? Date.now() >= token.expiresAt : false);
  const expiresIn = $derived(token.expiresAt
    ? Math.max(0, Math.floor((token.expiresAt - Date.now()) / 1000))
    : null
  );

  const expiresText = $derived((() => {
    if (expiresIn === null) return 'No expiration';
    if (isExpired) return 'Expired';
    if (expiresIn < 60) return `Expires in ${expiresIn}s`;
    if (expiresIn < 3600) return `Expires in ${Math.floor(expiresIn / 60)}m`;
    return `Expires in ${Math.floor(expiresIn / 3600)}h ${Math.floor((expiresIn % 3600) / 60)}m`;
  })());

  const maskedToken = $derived(
    token.accessToken.length > 12
      ? token.accessToken.substring(0, 6) + '...' + token.accessToken.substring(token.accessToken.length - 6)
      : token.accessToken
  );

  async function handleCopy() {
    const success = await copyToClipboard(token.accessToken);
    if (success) {
      copied = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copied = false; }, 2000);
    }
  }
</script>

<div class="token-display">
  <div class="token-header">
    <span class="token-label">Access Token</span>
    <span class="token-status" class:expired={isExpired}>
      {expiresText}
    </span>
  </div>

  <div class="token-value">
    <code>{maskedToken}</code>
    <div class="token-actions">
      <button class="action-btn" onclick={handleCopy} title="Copy token">
        {#if copied}
          <i class="codicon codicon-check"></i>
        {:else}
          <i class="codicon codicon-copy"></i>
        {/if}
      </button>
      {#if token.refreshToken && onrefresh}
        <button class="action-btn" onclick={onrefresh} title="Refresh token">
          <i class="codicon codicon-refresh"></i>
        </button>
      {/if}
      {#if onclear}
        <button class="action-btn delete" onclick={onclear} title="Clear token">
          <i class="codicon codicon-trash"></i>
        </button>
      {/if}
    </div>
  </div>

  {#if token.scope}
    <div class="token-meta">
      <span class="meta-label">Scope:</span> {token.scope}
    </div>
  {/if}
  {#if token.tokenType}
    <div class="token-meta">
      <span class="meta-label">Type:</span> {token.tokenType}
    </div>
  {/if}
</div>

<style>
  .token-display {
    padding: 12px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
  }

  .token-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .token-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
  }

  .token-status {
    font-size: 11px;
    color: #49cc90;
  }

  .token-status.expired { color: var(--vscode-errorForeground); }

  .token-value {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--vscode-input-background);
    border-radius: 4px;
    margin-bottom: 8px;
  }

  .token-value code {
    flex: 1;
    font-family: var(--vscode-editor-font-family), monospace;
    font-size: 12px;
    color: var(--vscode-foreground);
    word-break: break-all;
  }

  .token-actions {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    padding: 4px 6px;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    cursor: pointer;
    color: var(--vscode-foreground);
    font-size: 14px;
    opacity: 0.7;
  }

  .action-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
  .action-btn.delete:hover { color: var(--vscode-errorForeground); }

  .token-meta {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
  }

  .meta-label { font-weight: 600; }
</style>
