<script lang="ts">
  import { parseCookies, parseSentCookies, formatExpiry, isDeletedCookie, isSessionCookie } from '../../lib/cookie-parser';
  import Tooltip from './Tooltip.svelte';
  interface Props {
    headers?: Record<string, string>;
    requestHeaders?: Record<string, string>;
  }
  let { headers = {}, requestHeaders }: Props = $props();

  const cookies = $derived(parseCookies(headers));
  const sentCookies = $derived(parseSentCookies(requestHeaders));

  let sentCookiesOpen = $state(true);
  let responseCookiesOpen = $state(true);
</script>

<div class="cookies-viewer">
  <!-- Sent Cookies Section -->
  {#if sentCookies.length > 0}
    <section class="section">
      <button class="section-header" onclick={() => sentCookiesOpen = !sentCookiesOpen}>
        <i class="codicon {sentCookiesOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
        <span class="section-title">Sent Cookies</span>
        <span class="section-badge">{sentCookies.length}</span>
      </button>
      {#if sentCookiesOpen}
        <div class="sent-cookies-list">
          {#each sentCookies as cookie}
            <div class="sent-cookie-row">
              <span class="sent-cookie-name">{cookie.name}</span>
              <span class="sent-cookie-value">{cookie.value}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- Response Cookies Section -->
  <section class="section">
    <button class="section-header" onclick={() => responseCookiesOpen = !responseCookiesOpen}>
      <i class="codicon {responseCookiesOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
      <span class="section-title">Response Cookies</span>
      <span class="section-badge">{cookies.length}</span>
    </button>
    {#if responseCookiesOpen}
      {#if cookies.length === 0}
        <div class="empty-state">
          <p>No cookies in response</p>
          <span class="hint">Cookies will appear here when the server sends Set-Cookie headers</span>
        </div>
      {:else}
        <div class="cookies-list">
          {#each cookies as cookie}
            <div class="cookie-card">
              <div class="cookie-header">
                <span class="cookie-name">{cookie.name}</span>
                <div class="cookie-flags">
                  {#if isDeletedCookie(cookie)}
                    <Tooltip text="Cookie is being deleted (expired or max-age <= 0)" position="top"><span class="flag flag-deleted">Deleted</span></Tooltip>
                  {:else if isSessionCookie(cookie)}
                    <Tooltip text="Session cookie (no expiry set)" position="top"><span class="flag flag-session">Session</span></Tooltip>
                  {/if}
                  {#if cookie.attributes.httponly}
                    <Tooltip text="HttpOnly - Not accessible via JavaScript" position="top"><span class="flag">HttpOnly</span></Tooltip>
                  {/if}
                  {#if cookie.attributes.secure}
                    <Tooltip text="Secure - Only sent over HTTPS" position="top"><span class="flag">Secure</span></Tooltip>
                  {/if}
                  {#if cookie.attributes.samesite}
                    <Tooltip text="SameSite policy" position="top"><span class="flag">SameSite={cookie.attributes.samesite}</span></Tooltip>
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
    {/if}
  </section>

</div>

<style>
  .cookies-viewer {
    display: flex;
    flex-direction: column;
    gap: 0.308rem;
  }

  .section {
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.308rem;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    width: 100%;
    padding: 0.462rem 0.769rem;
    background: rgba(128, 128, 128, 0.06);
    border: none;
    cursor: pointer;
    color: var(--hf-foreground);
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: left;
    transition: background 0.1s;
  }

  .section-header:hover {
    background: rgba(128, 128, 128, 0.12);
  }

  .section-header .codicon {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .section-title {
    flex: 0 0 auto;
  }

  .section-badge {
    font-size: 0.769rem;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    background: rgba(128, 128, 128, 0.15);
    padding: 0.077rem 0.462rem;
    border-radius: 0.615rem;
    line-height: 1.4;
  }

  /* Sent cookies */
  .sent-cookies-list {
    display: flex;
    flex-direction: column;
    padding: 0.308rem 0.615rem;
  }

  .sent-cookie-row {
    display: flex;
    align-items: baseline;
    gap: 0.615rem;
    padding: 0.308rem 0.615rem;
    font-size: 0.923rem;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .sent-cookie-row:last-child {
    border-bottom: none;
  }

  .sent-cookie-name {
    font-weight: 600;
    color: var(--hf-symbolIcon-variableForeground, #9cdcfe);
    flex-shrink: 0;
  }

  .sent-cookie-value {
    font-family: var(--hf-editor-font-family), monospace;
    color: var(--hf-foreground);
    word-break: break-all;
    opacity: 0.85;
  }

  /* Response cookies */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.846rem;
    color: var(--hf-descriptionForeground);
    text-align: center;
  }

  .empty-state p {
    margin: 0 0 0.615rem;
    font-size: 1rem;
  }

  .hint {
    font-size: 0.846rem;
    opacity: 0.8;
  }

  .cookies-list {
    display: flex;
    flex-direction: column;
    gap: 0.615rem;
    padding: 0.615rem;
  }

  .cookie-card {
    padding: 0.923rem;
    background: var(--hf-textCodeBlock-background);
    border-radius: 0.462rem;
    border: 1px solid var(--hf-panel-border);
  }

  .cookie-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.615rem;
  }

  .cookie-name {
    font-weight: 600;
    font-size: 1rem;
    color: var(--hf-symbolIcon-variableForeground, #9cdcfe);
  }

  .cookie-flags {
    display: flex;
    gap: 0.308rem;
  }

  .flag {
    padding: 0.154rem 0.462rem;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 0.231rem;
    font-size: 0.692rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .flag-deleted {
    background: var(--hf-errorForeground, #f44747);
    color: #fff;
  }

  .flag-session {
    background: var(--hf-notificationsInfoIcon-foreground, #75beff);
    color: #fff;
  }

  .cookie-value {
    font-family: var(--hf-editor-font-family), monospace;
    font-size: 0.923rem;
    padding: 0.615rem;
    background: var(--hf-editor-background);
    border-radius: 0.308rem;
    word-break: break-all;
    margin-bottom: 0.615rem;
  }

  .cookie-attributes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.923rem;
    font-size: 0.846rem;
  }

  .attribute {
    display: flex;
    gap: 0.308rem;
  }

  .attr-name {
    color: var(--hf-descriptionForeground);
  }

  .attr-value {
    color: var(--hf-foreground);
  }

</style>
