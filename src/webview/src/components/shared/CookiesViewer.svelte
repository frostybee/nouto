<script lang="ts">
  import { parseCookies, formatExpiry } from '../../lib/cookie-parser';

  interface Props {
    headers?: Record<string, string>;
  }
  let { headers = {} }: Props = $props();

  const cookies = $derived(parseCookies(headers));
</script>

<div class="cookies-viewer">
  {#if cookies.length === 0}
    <div class="empty-state">
      <p>No cookies in response</p>
      <span class="hint">Cookies will appear here when the server sends Set-Cookie headers</span>
    </div>
  {:else}
    <div class="cookies-count">{cookies.length} cookie{cookies.length !== 1 ? 's' : ''}</div>
    <div class="cookies-list">
      {#each cookies as cookie}
        <div class="cookie-card">
          <div class="cookie-header">
            <span class="cookie-name">{cookie.name}</span>
            <div class="cookie-flags">
              {#if cookie.attributes.httponly}
                <span class="flag" title="HttpOnly - Not accessible via JavaScript">HttpOnly</span>
              {/if}
              {#if cookie.attributes.secure}
                <span class="flag" title="Secure - Only sent over HTTPS">Secure</span>
              {/if}
              {#if cookie.attributes.samesite}
                <span class="flag" title="SameSite policy">SameSite={cookie.attributes.samesite}</span>
              {/if}
            </div>
          </div>
          <div class="cookie-value">{cookie.value}</div>
          {#if Object.keys(cookie.attributes).length > 0}
            <div class="cookie-attributes">
              {#if cookie.attributes.expires}
                <div class="attribute">
                  <span class="attr-name">Expires:</span>
                  <span class="attr-value">{formatExpiry(cookie.attributes.expires)}</span>
                </div>
              {/if}
              {#if cookie.attributes['max-age']}
                <div class="attribute">
                  <span class="attr-name">Max-Age:</span>
                  <span class="attr-value">{cookie.attributes['max-age']}s</span>
                </div>
              {/if}
              {#if cookie.attributes.path}
                <div class="attribute">
                  <span class="attr-name">Path:</span>
                  <span class="attr-value">{cookie.attributes.path}</span>
                </div>
              {/if}
              {#if cookie.attributes.domain}
                <div class="attribute">
                  <span class="attr-name">Domain:</span>
                  <span class="attr-value">{cookie.attributes.domain}</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cookies-viewer {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }

  .empty-state p {
    margin: 0 0 8px;
    font-size: 13px;
  }

  .hint {
    font-size: 11px;
    opacity: 0.8;
  }

  .cookies-count {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .cookies-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cookie-card {
    padding: 12px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 6px;
    border: 1px solid var(--vscode-panel-border);
  }

  .cookie-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .cookie-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--vscode-symbolIcon-variableForeground, #9cdcfe);
  }

  .cookie-flags {
    display: flex;
    gap: 4px;
  }

  .flag {
    padding: 2px 6px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .cookie-value {
    font-family: var(--vscode-editor-font-family), monospace;
    font-size: 12px;
    padding: 8px;
    background: var(--vscode-editor-background);
    border-radius: 4px;
    word-break: break-all;
    margin-bottom: 8px;
  }

  .cookie-attributes {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 11px;
  }

  .attribute {
    display: flex;
    gap: 4px;
  }

  .attr-name {
    color: var(--vscode-descriptionForeground);
  }

  .attr-value {
    color: var(--vscode-foreground);
  }
</style>
